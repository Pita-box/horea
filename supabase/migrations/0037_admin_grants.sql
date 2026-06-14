-- Migrace 0037: administrátorské udělení Free_Trial a Comp_Ucet (feature
-- `admin-dashboard`, BusinessManager, task 11.1).
--
-- ATOMICITA (R5.6, Property 6 — all-or-nothing): obě akce mění VÍCE řádků
-- současně (`subscriptions` + `businesses`) a navíc musí zapsat auditní záznam
-- ve STEJNÉ transakci (Property 2). Supabase JS klient neumí držet jednu DB
-- transakci přes více volání (stejná lekce jako migrace 0027/0030/0035/0036),
-- proto celé udělení žije v jediné plpgsql SECURITY DEFINER funkci v jedné
-- transakci pod zámkem řádku `subscriptions`. Jakákoli dílčí chyba (např.
-- porušení constraintu) vrátí ÚPLNĚ všechny změny — žádný polovičatý stav.
--
-- ZACHYCENÍ before/after: probíhá přímo v RPC (čtení řádků před změnou pod
-- zámkem, sestavení `after` z cílových hodnot) a předává se do `write_audit_log`
-- (migrace 0035) ve stejné transakci.
--
-- ROZSAH DLE AKCEPTAČNÍCH KRITÉRIÍ:
--   * Free_Trial (R5.3): status=active, businesses.is_published=true,
--     current_period_end = konec zkušebního období; BEZ stržení platby.
--   * Comp_Ucet (R5.4): status=active, businesses.is_published=true; BEZ stržení
--     platby a BEZ založení recurring schedule (žádný gopay schedule se nezakládá).
--     current_period_end ani auto_renew se ZÁMĚRNĚ nemění — comp je trvale aktivní
--     účet a akceptační kritérium R5.4 mění výhradně status a is_published.
--
-- SECURITY DEFINER: kvůli write_audit_log po append-only REVOKE (migrace 0034).
-- Volá ji výhradně server-side service role (TS wrapper `lib/admin/grants.ts`).
-- _Requirements: 5.3, 5.4, 5.6, 5.7, 9.1, 9.2, 9.3_
-- _Properties: 6, 2_

-- ---------------------------------------------------------------------------
-- Free_Trial: dočasně aktivní předplatné bez platby, s koncem zkušebního období
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_free_trial(
  p_actor_user_id uuid,
  p_subscription_id uuid,
  p_trial_end timestamptz
)
returns table (
  subscription_id uuid,
  business_id uuid,
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
  -- (1) Zámek řádku předplatného + zachycení stavu PŘED akcí (subscription + business).
  select s.business_id,
         jsonb_build_object(
           'subscription', jsonb_build_object(
             'plan', s.plan,
             'status', s.status,
             'current_period_end', s.current_period_end
           ),
           'business', jsonb_build_object('is_published', b.is_published)
         )
    into v_business_id, v_before
  from public.subscriptions s
  join public.businesses b on b.id = s.business_id
  where s.id = p_subscription_id
  for update of s;

  -- Předplatné neexistuje → prázdná návratová tabulka (TS to mapuje na not_found).
  if not found then
    return;
  end if;

  -- (2) Aktivace zkušebního období bez platby (R5.3). Obě změny v jedné transakci.
  update public.subscriptions
  set status = 'active',
      current_period_end = p_trial_end,
      updated_at = now()
  where id = p_subscription_id;

  update public.businesses
  set is_published = true,
      updated_at = now()
  where id = v_business_id;

  v_after := jsonb_build_object(
    'subscription', jsonb_build_object(
      'status', 'active',
      'current_period_end', p_trial_end
    ),
    'business', jsonb_build_object('is_published', true)
  );

  -- (3) Auditní záznam ve STEJNÉ transakci jako udělení (R5.7, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'grant_free_trial',
    'subscription',
    p_subscription_id,
    v_before,
    v_after
  );

  return query
    select p_subscription_id, v_business_id, 'active'::public.subscription_status, p_trial_end;
end;
$$;

comment on function public.admin_grant_free_trial(uuid, uuid, timestamptz) is
  'Administrátorské udělení Free_Trial: v jedné transakci nastaví subscriptions.status=active, current_period_end=konec zkušebního období a businesses.is_published=true (bez platby), a zapíše auditní záznam grant_free_trial s before/after (feature admin-dashboard, R5.3/R5.6/R5.7, Property 6 + 2). All-or-nothing — dílčí chyba vrátí vše. Vrací prázdnou tabulku, pokud předplatné neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_grant_free_trial(uuid, uuid, timestamptz) from public;
grant execute on function public.admin_grant_free_trial(uuid, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Comp_Ucet: trvale aktivní předplatné bez platby a bez recurring schedule
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_comp(
  p_actor_user_id uuid,
  p_subscription_id uuid
)
returns table (
  subscription_id uuid,
  business_id uuid,
  status public.subscription_status,
  current_period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_current_period_end timestamptz;
  v_before jsonb;
  v_after jsonb;
begin
  -- (1) Zámek řádku předplatného + zachycení stavu PŘED akcí (subscription + business).
  select s.business_id,
         s.current_period_end,
         jsonb_build_object(
           'subscription', jsonb_build_object(
             'plan', s.plan,
             'status', s.status,
             'current_period_end', s.current_period_end
           ),
           'business', jsonb_build_object('is_published', b.is_published)
         )
    into v_business_id, v_current_period_end, v_before
  from public.subscriptions s
  join public.businesses b on b.id = s.business_id
  where s.id = p_subscription_id
  for update of s;

  -- Předplatné neexistuje → prázdná návratová tabulka (TS to mapuje na not_found).
  if not found then
    return;
  end if;

  -- (2) Trvalá aktivace bez platby (R5.4). Mění výhradně status a is_published;
  --     current_period_end ani auto_renew se nedotýkáme (comp je trvalý účet,
  --     žádný recurring schedule se nezakládá). Obě změny v jedné transakci.
  update public.subscriptions
  set status = 'active',
      updated_at = now()
  where id = p_subscription_id;

  update public.businesses
  set is_published = true,
      updated_at = now()
  where id = v_business_id;

  v_after := jsonb_build_object(
    'subscription', jsonb_build_object(
      'status', 'active',
      'current_period_end', v_current_period_end
    ),
    'business', jsonb_build_object('is_published', true)
  );

  -- (3) Auditní záznam ve STEJNÉ transakci jako udělení (R5.7, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'grant_comp',
    'subscription',
    p_subscription_id,
    v_before,
    v_after
  );

  return query
    select p_subscription_id, v_business_id, 'active'::public.subscription_status, v_current_period_end;
end;
$$;

comment on function public.admin_grant_comp(uuid, uuid) is
  'Administrátorské udělení Comp_Ucet: v jedné transakci nastaví subscriptions.status=active a businesses.is_published=true (bez platby a bez recurring schedule; current_period_end a auto_renew se nemění), a zapíše auditní záznam grant_comp s before/after (feature admin-dashboard, R5.4/R5.6/R5.7, Property 6 + 2). All-or-nothing — dílčí chyba vrátí vše. Vrací prázdnou tabulku, pokud předplatné neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_grant_comp(uuid, uuid) from public;
grant execute on function public.admin_grant_comp(uuid, uuid) to service_role;
