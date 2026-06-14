-- Migrace 0036: administrátorské akce nad předplatným — přímý override stavu
-- předplatného a pozastavení podniku (feature `admin-dashboard`, BusinessManager,
-- tasky 10.1 a 10.2).
--
-- PROČ RPC: Obě akce mění stav existujícího objektu A SOUČASNĚ musí zapsat
-- auditní záznam ve STEJNÉ transakci (design.md, *Audit logging strategy*;
-- Property 2 — právě jeden auditní záznam na úspěšnou citlivou akci). Supabase JS
-- klient neumí držet jednu DB transakci přes více volání (stejná lekce jako
-- migrace 0027/0030/0035), proto akce + zápis auditu žijí v jediné plpgsql
-- SECURITY DEFINER funkci, která volá `write_audit_log(...)` (migrace 0035)
-- UVNITŘ své transakce. Buď uspěje akce i auditní záznam, nebo se obojí vrátí.
--
-- ZACHYCENÍ before/after: probíhá přímo v RPC (čtení řádku před změnou pod zámkem
-- `for update`, sestavení `after` z cílových hodnot). Pro existující objekt je
-- spolehlivé; best-effort povaha (R9.4) se uplatní jen tehdy, kdyby objekt
-- neexistoval — pak RPC vrátí prázdnou tabulku a žádná akce ani audit nevzniknou.
--
-- OVERRIDE VĚDOMĚ OBCHÁZÍ stavový automat ze `subscription-payments` (design.md,
-- *Admin subscription override*) — jde o privilegovanou pravomoc admina, ne o
-- běžný přechod automatu. Proto nastavuje `plan`/`status`/`current_period_end`
-- přímo na zvolené hodnoty bez výpočtu přes computeState.
--
-- SECURITY DEFINER: funkce běží jako vlastník, takže může přes write_audit_log
-- vložit řádek i po append-only REVOKE z migrace 0034. Volá ji výhradně
-- server-side service role (TS wrapper `lib/admin/subscription-override.ts`).
-- _Requirements: 5.1, 5.2, 5.5, 5.7, 9.1, 9.2, 9.3_
-- _Properties: 2_

-- ---------------------------------------------------------------------------
-- 10.1 Override předplatného: přímé nastavení plan / status / current_period_end
-- ---------------------------------------------------------------------------
create or replace function public.admin_override_subscription(
  p_actor_user_id uuid,
  p_subscription_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_current_period_end timestamptz
)
returns table (
  subscription_id uuid,
  business_id uuid,
  plan public.subscription_plan,
  status public.subscription_status,
  current_period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  -- (1) Zámek řádku předplatného do konce transakce + zachycení stavu PŘED akcí
  --     (before) pro auditní záznam (R9.3).
  select s.business_id,
         jsonb_build_object(
           'plan', s.plan,
           'status', s.status,
           'current_period_end', s.current_period_end
         )
    into v_business_id, v_before
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  -- Předplatné neexistuje → prázdná návratová tabulka (TS to mapuje na not_found);
  -- žádná změna ani auditní záznam nevzniknou.
  if not found then
    return;
  end if;

  -- (2) Přímý override (vědomé obejití stavového automatu — R5.1, R5.2).
  update public.subscriptions
  set plan = p_plan,
      status = p_status,
      current_period_end = p_current_period_end,
      updated_at = now()
  where id = p_subscription_id;

  v_after := jsonb_build_object(
    'plan', p_plan,
    'status', p_status,
    'current_period_end', p_current_period_end
  );

  -- (3) Auditní záznam ve STEJNÉ transakci jako override (R5.7, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'subscription_override',
    'subscription',
    p_subscription_id,
    v_before,
    v_after
  );

  return query
    select p_subscription_id, v_business_id, p_plan, p_status, p_current_period_end;
end;
$$;

comment on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) is
  'Administrátorský override předplatného: přímo nastaví plan/status/current_period_end na zvolené hodnoty (vědomě obchází stavový automat ze subscription-payments) a ve stejné transakci zapíše auditní záznam subscription_override s before/after (feature admin-dashboard, R5.1/R5.2/R5.7, Property 2). Vrací prázdnou tabulku, pokud předplatné neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) from public;
grant execute on function public.admin_override_subscription(uuid, uuid, public.subscription_plan, public.subscription_status, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 10.2 Pozastavení podniku: business.is_published = false
-- ---------------------------------------------------------------------------
create or replace function public.admin_suspend_business(
  p_actor_user_id uuid,
  p_business_id uuid
)
returns table (
  business_id uuid,
  is_published boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_was_published boolean;
  v_before jsonb;
begin
  -- (1) Zámek řádku podniku + zachycení stavu PŘED akcí (before).
  select b.is_published
    into v_was_published
  from public.businesses b
  where b.id = p_business_id
  for update;

  -- Podnik neexistuje → prázdná návratová tabulka (TS to mapuje na not_found).
  if not found then
    return;
  end if;

  v_before := jsonb_build_object('is_published', v_was_published);

  -- (2) Pozastavení — skrytí podniku z veřejného webu (R5.5).
  update public.businesses
  set is_published = false,
      updated_at = now()
  where id = p_business_id;

  -- (3) Auditní záznam ve STEJNÉ transakci jako pozastavení (R5.7, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'suspend_business',
    'business',
    p_business_id,
    v_before,
    jsonb_build_object('is_published', false)
  );

  return query select p_business_id, false;
end;
$$;

comment on function public.admin_suspend_business(uuid, uuid) is
  'Administrátorské pozastavení podniku: nastaví businesses.is_published = false a ve stejné transakci zapíše auditní záznam suspend_business s before/after (feature admin-dashboard, R5.5/R5.7, Property 2). Vrací prázdnou tabulku, pokud podnik neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_suspend_business(uuid, uuid) from public;
grant execute on function public.admin_suspend_business(uuid, uuid) to service_role;
