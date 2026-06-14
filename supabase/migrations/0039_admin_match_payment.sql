-- Migrace 0039: ruční spárování příchozí bankovní platby administrátorem (feature
-- `admin-dashboard`, PaymentMatcher, task 15.1).
--
-- PROČ RPC: Spárování musí (a) nastavit `payment.status = paid`, (b) SPUSTIT
-- tentýž efekt jako webhook (přechod předplatného do `active` + prodloužení období)
-- a (c) zapsat auditní záznam — vše ve STEJNÉ transakci (design.md, *Manual payment
-- matching* a *Audit logging strategy*; Property 2). Supabase JS klient neumí
-- držet jednu DB transakci přes více volání (stejná lekce jako migrace
-- 0027/0030/0035/0036/0037/0038), proto celá akce žije v jediné plpgsql SECURITY
-- DEFINER funkci. Při selhání nastavení `paid` se celá transakce vrátí — platba
-- zůstane `pending` (R8.4), TS wrapper zobrazí českou hlášku.
--
-- ZNOVUPOUŽITÍ, NE DUPLIKACE (design.md): efekt prodloužení vlastní
-- `subscription-payments`. Tato funkce jej pouze SPUSTÍ stejně jako webhook
-- handler (`processGopayWebhook` → `applyPaid`):
--   * přechod automatu = activateSubscription → znovupoužití existující funkce
--     `apply_subscription_transition` (migrace 0027) se stejnými argumenty jako
--     v `transitions.ts` (status=active, is_published=true, kotva 'clear');
--   * prodloužení období o Jeden_Mesic = stejná konstanta jako `extendPeriod`
--     (`JEDEN_MESIC_SECONDS` = 2 592 000 s = 30 dní). Výpočet prodloužení se
--     NEDUPLIKUJE jako nová doménová logika — je to přímé zrcadlo Jeden_Mesic.
--   * Generování faktury NENÍ součástí efektu spárování dle R8.3 (ten odkazuje na
--     R5.5/R5.6 ze `subscription-payments` = prodloužení + přechod stavu), proto
--     se zde záměrně negeneruje.
--
-- BASE PRO PRODLOUŽENÍ: webhook prodlužuje stávající `current_period_end`. U ruční
-- platby (první i obnovovací) může být `current_period_end` NULL → použijeme
-- `coalesce(current_period_end, now())` jako bázi, aby první ruční platba založila
-- období od teď + Jeden_Mesic. Pro běžný obnovovací případ (non-null) je chování
-- shodné s webhookem.
--
-- ZACHYCENÍ before/after: `before` = stav platby před akcí (čteno pod zámkem),
-- `after` = `paid` + nový konec období.
--
-- SECURITY DEFINER: kvůli volání `write_audit_log` (po append-only REVOKE z migrace
-- 0034) a `apply_subscription_transition`. Volá ji výhradně server-side service
-- role (TS wrapper `lib/admin/payment-matcher.ts`).
-- _Requirements: 8.3, 8.4, 8.5, 9.1, 9.2, 9.3_
-- _Properties: 2_

create or replace function public.admin_match_payment(
  p_actor_user_id uuid,
  p_payment_id uuid
)
returns table (
  payment_id uuid,
  subscription_id uuid,
  business_id uuid,
  current_period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.payment_status;
  v_method public.payment_method;
  v_subscription_id uuid;
  v_business_id uuid;
  v_before jsonb;
  v_new_period_end timestamptz;
begin
  -- (1) Zámek řádku platby do konce transakce + zachycení stavu PŘED akcí.
  select p.status, p.method, p.subscription_id, p.business_id
    into v_status, v_method, v_subscription_id, v_business_id
  from public.payments p
  where p.id = p_payment_id
  for update;

  -- Platba neexistuje → prázdná návratová tabulka (TS to mapuje na not_found).
  if not found then
    return;
  end if;

  v_before := jsonb_build_object('status', v_status);

  -- (2) Spárovat lze pouze čekající platbu (R8.3). Jinak fail-fast → rollback,
  --     platba zůstává beze změny (TS wrapper to mapuje na match_failed, R8.4).
  if v_status <> 'pending' then
    raise exception 'Platbu nelze spárovat: není ve stavu pending (aktuální stav %)', v_status
      using errcode = '22023';
  end if;

  -- (3) Nastavení payment.status = paid (R8.3). Selhání → výjimka → rollback (R8.4).
  update public.payments
  set status = 'paid'
  where id = p_payment_id;

  -- (4) SPUSTIT efekt prodloužení ze `subscription-payments` (R8.3, neduplikovat):
  --     (4a) přechod automatu = activateSubscription (znovupoužití migrace 0027:
  --          status=active, is_published=true, kotva 'clear').
  perform public.apply_subscription_transition(
    v_subscription_id,
    'active'::public.subscription_status,
    true,
    'clear'
  );

  --     (4b) prodloužení období o Jeden_Mesic (2 592 000 s) — stejný efekt jako
  --          extendPeriod ve webhooku. Báze: stávající konec, jinak now().
  update public.subscriptions
  set current_period_end = coalesce(current_period_end, now()) + interval '2592000 seconds',
      updated_at = now()
  where id = v_subscription_id
  returning subscriptions.current_period_end into v_new_period_end;

  -- (5) Auditní záznam ve STEJNÉ transakci jako spárování (R8.5, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'payment_match',
    'payment',
    p_payment_id,
    v_before,
    jsonb_build_object('status', 'paid', 'current_period_end', v_new_period_end)
  );

  return query select p_payment_id, v_subscription_id, v_business_id, v_new_period_end;
end;
$$;

comment on function public.admin_match_payment(uuid, uuid) is
  'Ruční spárování platby administrátorem: v jedné transakci nastaví payments.status = paid a SPUSTÍ efekt ze subscription-payments — znovupoužije apply_subscription_transition (migrace 0027; status=active, is_published=true, clear kotvy) a prodlouží current_period_end o Jeden_Mesic (2 592 000 s), pak zapíše auditní záznam payment_match s before/after (feature admin-dashboard, R8.3/R8.5, Property 2). Spárovat lze pouze pending platbu; jinak rollback a platba zůstává pending (R8.4). Vrací prázdnou tabulku, pokud platba neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_match_payment(uuid, uuid) from public;
grant execute on function public.admin_match_payment(uuid, uuid) to service_role;
