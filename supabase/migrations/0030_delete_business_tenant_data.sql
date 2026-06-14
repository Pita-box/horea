-- Migrace 0030: atomické smazání tenant dat jednoho podniku při přechodu do
-- stavu `deleted_data` (feature `subscription-payments`, Cleanup_Cron, task 12.2).
--
-- Po 90 dnech od kotvy `first_failed_charge_at` bez úspěšné platby se tenant data
-- podniku trvale mažou (R6.7) a předplatné přechází do `deleted_data`. Mazání
-- musí být ATOMICKÉ — buď zmizí vše, nebo nic — proto žije v jediné plpgsql
-- SECURITY DEFINER funkci v jedné transakci pod zámkem řádku `subscriptions`
-- (stejný vzor jako migrace 0027 / 0028). Continue-on-error řeší volající cron:
-- selhání jednoho podniku nezastaví dávku.
--
-- CO SE MAŽE (tenant data, R6.7, Property 8):
--   * rezervace      (public.reservations)
--   * klienti        (public.clients)
--   * služby         (public.services)
--   * otevírací doby (public.opening_hours)
--   * profil podniku — obsahová pole řádku `businesses` se vyprázdní
--     (name, description, logo_url, příznaky), aby podnik po reaktivaci začínal
--     s prázdným profilem (R6.9).
--
-- CO ZŮSTÁVÁ ZACHOVÁNO (R6.8):
--   * řádek `public.users` (e-mail + password hash spravuje Supabase Auth),
--   * kompletní historie `public.subscriptions` a `public.payments`.
--
-- Řádek `public.businesses` se ZÁMĚRNĚ NEMAŽE: `subscriptions.business_id` a
-- `payments.business_id` na něj odkazují s `on delete cascade`, takže smazání
-- řádku podniku by zničilo účetní historii (R6.8). Proto se řádek ponechá jako
-- prázdná schránka (kotva pro zachovanou historii) a vyprázdní se jen jeho
-- obsahová pola. `slug` a `type` (NOT NULL) zůstávají.
-- _Requirements: 6.7, 6.8, 10.4_

create or replace function public.delete_business_tenant_data(p_business_id uuid)
returns table (
  business_id uuid,
  subscription_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subscription_id uuid;
begin
  -- (1) Zámek řádku předplatného do konce transakce — serializuje souběh s
  --     případným přechodem stavu (webhook / jiný cron) pro tentýž podnik.
  select s.id
    into v_subscription_id
  from public.subscriptions s
  where s.business_id = p_business_id
  for update;

  -- Podnik bez předplatného neexistuje v doméně této úlohy → prázdný výsledek
  -- (TS to mapuje na not_found a continue-on-error).
  if v_subscription_id is null then
    return;
  end if;

  -- (2) Smazání tenant dat (R6.7). Rezervace se mažou jako první (FK na services
  --     i businesses), pak zbytek.
  delete from public.reservations where reservations.business_id = p_business_id;
  delete from public.clients where clients.business_id = p_business_id;
  delete from public.services where services.business_id = p_business_id;
  delete from public.opening_hours where opening_hours.business_id = p_business_id;

  -- (3) Vyprázdnění profilu podniku (R6.9: prázdný profil po reaktivaci) a
  --     skrytí z veřejného webu. Řádek se zachová kvůli FK historie (R6.8).
  update public.businesses
  set name = '',
      description = null,
      logo_url = null,
      is_published = false,
      auto_approve_reservations = false,
      allow_parallel_slots = false,
      updated_at = now()
  where id = p_business_id;

  -- (4) Přechod předplatného do `deleted_data` (R6.7) ve stejné transakci.
  update public.subscriptions
  set status = 'deleted_data',
      updated_at = now()
  where id = v_subscription_id;

  return query select p_business_id, v_subscription_id;
end;
$$;

comment on function public.delete_business_tenant_data(uuid) is
  'Atomicky smaže tenant data jednoho podniku (rezervace, klienti, služby, otevírací doby) a vyprázdní profil podniku, pak nastaví subscriptions.status = deleted_data — vše v jedné transakci pod zámkem řádku subscriptions. Řádek businesses se NEMAŽE (FK on delete cascade by zničil historii subscriptions/payments). Zachovává users + historii plateb (R6.8). Volá ji výhradně server-side service role.';

revoke all on function public.delete_business_tenant_data(uuid) from public;
grant execute on function public.delete_business_tenant_data(uuid) to service_role;
