-- Migrace 0027: atomická funkce pro perzistenci přechodu stavového automatu
-- předplatného (feature `subscription-payments`, Stavovy_Automat, task 2.3).
--
-- Supabase JS klient neumí držet jednu DB transakci přes více volání (stejná
-- lekce jako u migrace 0021). Proto přechod, který mění VÍCE řádků současně
-- (`subscriptions.status` + `subscriptions.first_failed_charge_at` +
-- `businesses.is_published`), žije v jediné plpgsql SECURITY DEFINER funkci,
-- aby nevznikaly polovičaté stavy (design.md, sekce *Princip bezstavovosti a
-- transakcí*).
--
-- Doprovodné efekty přechodu:
--   * status              — cílový stav předplatného (počítá TS přes computeState
--                           nebo plyne z konkrétní události — viz transitions.ts),
--   * is_published        — active/grace_period => true; expired/deleted_data =>
--                           false (R4.2, R6.5),
--   * zámek dashboardu     — NENÍ samostatný sloupec: vynucuje ho free-user-guard
--                           odvozením ze `status` (expired/deleted_data => lock),
--   * first_failed_charge_at (kotva) — řízeno parametrem p_anchor_action:
--       'set_if_null' — nastav kotvu jen pokud dosud není (R4.3: první selhání
--                       NEPŘEPÍŠE existující kotvu); hodnota = p_anchor_value,
--                       nebo now() pokud p_anchor_value je NULL,
--       'set'         — nastav kotvu na p_anchor_value (R11.3: konec období s
--                       auto_renew=false, kotva = current_period_end),
--       'clear'       — vymaž kotvu (NULL) při úspěšné platbě / reaktivaci
--                       (R1.3, R5.6, R6.6),
--       'leave'       — ponech stávající kotvu (časová materializace cronem).
--
-- Volá ji VÝHRADNĚ server-side service role (Webhook_Handler, cron úlohy),
-- proto revoke from public + grant execute to service_role.
-- _Requirements: 1.3, 4.1, 4.2, 4.3, 5.6, 6.5, 6.6, 11.3_

create or replace function public.apply_subscription_transition(
  p_subscription_id uuid,
  p_status public.subscription_status,
  p_is_published boolean,
  p_anchor_action text,
  p_anchor_value timestamptz default null
)
returns table (
  subscription_id uuid,
  business_id uuid,
  status public.subscription_status,
  is_published boolean,
  first_failed_charge_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_existing_anchor timestamptz;
  v_new_anchor timestamptz;
begin
  -- (1) Validace parametru akce kotvy (fail-fast místo tiché chyby).
  if p_anchor_action not in ('set_if_null', 'set', 'clear', 'leave') then
    raise exception 'Neplatná akce kotvy: %', p_anchor_action
      using errcode = '22023';
  end if;

  -- (2) Zámek řádku předplatného do konce transakce RPC — serializuje souběžné
  --     přechody téhož předplatného (např. opakovaný webhook).
  select s.business_id, s.first_failed_charge_at
    into v_business_id, v_existing_anchor
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  -- Předplatné neexistuje → prázdná návratová tabulka (TS to mapuje na not_found).
  if v_business_id is null then
    return;
  end if;

  -- (3) Výpočet nové hodnoty kotvy podle požadované akce.
  v_new_anchor := case p_anchor_action
    when 'set_if_null' then coalesce(v_existing_anchor, coalesce(p_anchor_value, now()))
    when 'set' then p_anchor_value
    when 'clear' then null
    else v_existing_anchor -- 'leave'
  end;

  -- (4) Perzistence stavu předplatného a kotvy v jedné transakci.
  update public.subscriptions
  set status = p_status,
      first_failed_charge_at = v_new_anchor,
      updated_at = now()
  where id = p_subscription_id;

  -- (5) Doprovodný efekt na publikovanost podniku (R4.2, R6.5).
  update public.businesses
  set is_published = p_is_published
  where id = v_business_id;

  return query
    select p_subscription_id, v_business_id, p_status, p_is_published, v_new_anchor;
end;
$$;

comment on function public.apply_subscription_transition(uuid, public.subscription_status, boolean, text, timestamptz) is
  'Atomicky perzistuje přechod stavového automatu předplatného (status + kotva first_failed_charge_at + businesses.is_published) v jedné transakci pod zámkem řádku subscriptions. Kotvu řídí p_anchor_action: set_if_null (R4.3 bez přepisu), set (R11.3), clear (R1.3/5.6/6.6), leave (materializace). Vrací prázdnou tabulku pokud předplatné neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.apply_subscription_transition(uuid, public.subscription_status, boolean, text, timestamptz) from public;
grant execute on function public.apply_subscription_transition(uuid, public.subscription_status, boolean, text, timestamptz) to service_role;
