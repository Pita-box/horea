-- Migrace 0038: vynucené smazání podniku administrátorem (feature
-- `admin-dashboard`, BusinessManager, task 12.1).
--
-- PROČ RPC: Vynucené smazání musí (a) smazat tenant data podniku, (b) zachovat
-- účetní historii `subscriptions`/`payments` a (c) zapsat auditní záznam ve
-- STEJNÉ transakci jako smazání (design.md, *Audit logging strategy*; Property 2
-- — právě jeden auditní záznam na úspěšnou citlivou akci). Supabase JS klient
-- neumí držet jednu DB transakci přes více volání (stejná lekce jako migrace
-- 0027/0030/0035/0036/0037), proto celá akce žije v jediné plpgsql SECURITY
-- DEFINER funkci.
--
-- ZNOVUPOUŽITÍ, NE DUPLIKACE (design.md, *Force delete business*): vlastní mazání
-- tenant dat NEDUPLIKUJEME — funkce volá existující `delete_business_tenant_data`
-- (migrace 0030, vlastněná `subscription-payments`) UVNITŘ své transakce. Ta
-- atomicky smaže rezervace, klienty, služby a otevírací doby, vyprázdní profil
-- podniku a nastaví `subscriptions.status = deleted_data`. Historie
-- `subscriptions`/`payments` zůstává zachována (R6.3) — řádek `businesses` se
-- záměrně nemaže (FK on delete cascade by zničil historii; viz komentář migrace
-- 0030). Rozdíl oproti automatickému Cleanup_Cron: tato akce je spuštěna ručně a
-- okamžitě adminem a vyžaduje explicitní potvrzení (R6.1, vynuceno UI + TS
-- wrapperem).
--
-- ZACHYCENÍ before/after: `before` = profil podniku před smazáním (čteno pod
-- zámkem), `after` = příznak odstranění tenant dat. U akce, která objekt ruší,
-- nese `after` stav vyjadřující odstranění (design.md).
--
-- SECURITY DEFINER: kvůli volání `write_audit_log` po append-only REVOKE (migrace
-- 0034) a kvůli volání `delete_business_tenant_data` (rovněž service-role).
-- Volá ji výhradně server-side service role (TS wrapper `lib/admin/force-delete.ts`).
-- _Requirements: 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3_
-- _Properties: 7, 2_

create or replace function public.admin_force_delete_business(
  p_actor_user_id uuid,
  p_business_id uuid
)
returns table (
  business_id uuid,
  subscription_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_subscription_id uuid;
begin
  -- (1) Zámek řádku podniku + zachycení stavu PŘED akcí (profil) pro audit (R9.3).
  select jsonb_build_object(
           'name', b.name,
           'slug', b.slug,
           'is_published', b.is_published
         )
    into v_before
  from public.businesses b
  where b.id = p_business_id
  for update;

  -- Podnik neexistuje → prázdná návratová tabulka (TS to mapuje na not_found);
  -- žádné mazání ani auditní záznam nevzniknou.
  if not found then
    return;
  end if;

  -- (2) ZNOVUPOUŽITÍ cleanup logiky ze `subscription-payments` (migrace 0030) —
  --     smaže tenant data, vyprázdní profil a nastaví subscriptions.status =
  --     deleted_data; historie subscriptions/payments zůstává zachována (R6.2, R6.3).
  select d.subscription_id
    into v_subscription_id
  from public.delete_business_tenant_data(p_business_id) d;

  -- (3) Auditní záznam ve STEJNÉ transakci jako smazání (R6.4, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'force_delete_business',
    'business',
    p_business_id,
    v_before,
    jsonb_build_object('tenant_data_deleted', true)
  );

  return query select p_business_id, v_subscription_id;
end;
$$;

comment on function public.admin_force_delete_business(uuid, uuid) is
  'Administrátorské vynucené smazání podniku: v jedné transakci znovupoužije delete_business_tenant_data (migrace 0030) ke smazání tenant dat a vyprázdnění profilu (zachová historii subscriptions/payments) a zapíše auditní záznam force_delete_business s before/after (feature admin-dashboard, R6.2/R6.3/R6.4, Property 7 + 2). Vrací prázdnou tabulku, pokud podnik neexistuje. Explicitní potvrzení (R6.1) vynucuje UI + TS wrapper. Volá ji výhradně server-side service role.';

revoke all on function public.admin_force_delete_business(uuid, uuid) from public;
grant execute on function public.admin_force_delete_business(uuid, uuid) to service_role;
