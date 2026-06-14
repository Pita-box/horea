-- Migrace 0040: CRUD správa kupónů administrátorem (feature `admin-dashboard`,
-- CouponManager, task 14.1).
--
-- PROČ RPC: Každá mutace kupónu (vytvoření / úprava / deaktivace / smazání) musí
-- zapsat auditní záznam ve STEJNÉ transakci jako samotná změna (design.md,
-- *Audit logging strategy*; Property 2 — právě jeden auditní záznam na úspěšnou
-- citlivou akci). Supabase JS klient neumí držet jednu DB transakci přes více
-- volání (stejná lekce jako migrace 0027/0030/0035/0036/0037/0038/0039), proto
-- mutace + zápis auditu žijí v jediné plpgsql SECURITY DEFINER funkci, která volá
-- `write_audit_log(...)` (migrace 0035) UVNITŘ své transakce.
--
-- VALIDACE (R7.2, R7.3): unikátnost `code` je vynucena DB unique constraintem
-- z migrace 0005 (`coupons_code_key`) — pokus o duplicitní kód shodí transakci s
-- SQLSTATE 23505, TS wrapper jej mapuje na českou hlášku „Kupón s tímto kódem již
-- existuje." Validace rozsahu 0–100 pro typ `percent` (R7.3) probíhá v TS
-- wrapperu (`lib/admin/coupon-manager.ts`) PŘED voláním RPC; jako pojistka na
-- úrovni DB ji zde navíc vynucuje guard, který fail-fast shodí transakci.
--
-- ZACHYCENÍ before/after: u vytvoření je `before` přirozeně `null`; u úpravy a
-- deaktivace se `before` čte pod zámkem řádku a `after` se sestaví z výsledných
-- hodnot; u smazání nese `before` poslední stav a `after` je `null` (objekt
-- zaniká).
--
-- DEAKTIVACE (R7.6): nastaví `is_active = false` BEZ mazání záznamu — historie
-- použití (`used_count`) zůstává zachována a checkout v `subscription-payments`
-- kupón přestane akceptovat.
--
-- SECURITY DEFINER: kvůli volání `write_audit_log` po append-only REVOKE z migrace
-- 0034. Volá ji výhradně server-side service role (TS wrapper
-- `lib/admin/coupon-manager.ts`).
-- _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 9.1, 9.2, 9.3_
-- _Properties: 4, 2_

-- ---------------------------------------------------------------------------
-- Pomocná funkce: serializace kupónu do jsonb pro auditní before/after.
-- ---------------------------------------------------------------------------
create or replace function public.coupon_snapshot(c public.coupons)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'type', c.type,
    'discount_value', c.discount_value,
    'valid_until', c.valid_until,
    'max_uses', c.max_uses,
    'used_count', c.used_count,
    'is_active', c.is_active
  );
$$;

comment on function public.coupon_snapshot(public.coupons) is
  'Serializuje řádek coupons do jsonb pro auditní before/after (feature admin-dashboard, R9.3).';

-- ---------------------------------------------------------------------------
-- 14.1 Vytvoření kupónu: insert + auditní záznam coupon_create
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_coupon(
  p_actor_user_id uuid,
  p_code text,
  p_type public.coupon_type,
  p_discount_value numeric,
  p_valid_until timestamptz,
  p_max_uses integer
)
returns public.coupons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.coupons;
begin
  -- Pojistka R7.3 na úrovni DB: percent value musí být v rozsahu 0–100 (primární
  -- validace s českou hláškou je v TS wrapperu; tato shodí transakci fail-fast).
  if p_type = 'percent' and (p_discount_value is null or p_discount_value < 0 or p_discount_value > 100) then
    raise exception 'Procentuální sleva musí být v rozsahu 0 až 100'
      using errcode = '22023';
  end if;

  -- Unikátnost code (R7.2) vynucuje DB unique constraint; duplicitní kód shodí
  -- transakci s SQLSTATE 23505, TS wrapper jej mapuje na českou hlášku.
  insert into public.coupons (code, type, discount_value, valid_until, max_uses)
  values (p_code, p_type, p_discount_value, p_valid_until, p_max_uses)
  returning * into v_row;

  -- Auditní záznam ve STEJNÉ transakci jako vytvoření (R7.8, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'coupon_create',
    'coupon',
    v_row.id,
    null,
    public.coupon_snapshot(v_row)
  );

  return v_row;
end;
$$;

comment on function public.admin_create_coupon(uuid, text, public.coupon_type, numeric, timestamptz, integer) is
  'Administrátorské vytvoření kupónu: vloží coupons řádek a ve stejné transakci zapíše auditní záznam coupon_create (feature admin-dashboard, R7.1/R7.8, Property 4 + 2). Duplicitní code shodí transakci (SQLSTATE 23505); percent value mimo 0–100 shodí transakci (22023). Volá ji výhradně server-side service role.';

revoke all on function public.admin_create_coupon(uuid, text, public.coupon_type, numeric, timestamptz, integer) from public;
grant execute on function public.admin_create_coupon(uuid, text, public.coupon_type, numeric, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 14.1 Úprava kupónu: update + auditní záznam coupon_update
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_coupon(
  p_actor_user_id uuid,
  p_coupon_id uuid,
  p_code text,
  p_type public.coupon_type,
  p_discount_value numeric,
  p_valid_until timestamptz,
  p_max_uses integer
)
returns public.coupons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.coupons;
  v_after public.coupons;
begin
  -- Zámek řádku kupónu do konce transakce + zachycení stavu PŘED akcí (R9.3).
  select * into v_before
  from public.coupons
  where id = p_coupon_id
  for update;

  -- Kupón neexistuje → null návratová hodnota (TS to mapuje na not_found);
  -- žádná změna ani auditní záznam nevzniknou.
  if not found then
    return null;
  end if;

  -- Pojistka R7.3 na úrovni DB (primární validace v TS wrapperu).
  if p_type = 'percent' and (p_discount_value is null or p_discount_value < 0 or p_discount_value > 100) then
    raise exception 'Procentuální sleva musí být v rozsahu 0 až 100'
      using errcode = '22023';
  end if;

  -- Unikátnost code (R7.2) — případná kolize shodí transakci s SQLSTATE 23505.
  update public.coupons
  set code = p_code,
      type = p_type,
      discount_value = p_discount_value,
      valid_until = p_valid_until,
      max_uses = p_max_uses
  where id = p_coupon_id
  returning * into v_after;

  -- Auditní záznam ve STEJNÉ transakci jako úprava (R7.8, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'coupon_update',
    'coupon',
    p_coupon_id,
    public.coupon_snapshot(v_before),
    public.coupon_snapshot(v_after)
  );

  return v_after;
end;
$$;

comment on function public.admin_update_coupon(uuid, uuid, text, public.coupon_type, numeric, timestamptz, integer) is
  'Administrátorská úprava kupónu: aktualizuje atributy a ve stejné transakci zapíše auditní záznam coupon_update s before/after (feature admin-dashboard, R7.5/R7.8, Property 2). Vrací null, pokud kupón neexistuje. Duplicitní code shodí transakci (23505); percent value mimo 0–100 shodí transakci (22023). Volá ji výhradně server-side service role.';

revoke all on function public.admin_update_coupon(uuid, uuid, text, public.coupon_type, numeric, timestamptz, integer) from public;
grant execute on function public.admin_update_coupon(uuid, uuid, text, public.coupon_type, numeric, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 14.1 Deaktivace kupónu: is_active = false (bez mazání) + audit coupon_deactivate
-- ---------------------------------------------------------------------------
create or replace function public.admin_deactivate_coupon(
  p_actor_user_id uuid,
  p_coupon_id uuid
)
returns public.coupons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.coupons;
  v_after public.coupons;
begin
  -- Zámek řádku + zachycení stavu PŘED akcí.
  select * into v_before
  from public.coupons
  where id = p_coupon_id
  for update;

  if not found then
    return null;
  end if;

  -- Deaktivace bez mazání záznamu (R7.6) — used_count zůstává zachován.
  update public.coupons
  set is_active = false
  where id = p_coupon_id
  returning * into v_after;

  -- Auditní záznam ve STEJNÉ transakci jako deaktivace (R7.8, Property 2).
  perform public.write_audit_log(
    p_actor_user_id,
    'coupon_deactivate',
    'coupon',
    p_coupon_id,
    public.coupon_snapshot(v_before),
    public.coupon_snapshot(v_after)
  );

  return v_after;
end;
$$;

comment on function public.admin_deactivate_coupon(uuid, uuid) is
  'Administrátorská deaktivace kupónu: nastaví is_active = false bez mazání záznamu a ve stejné transakci zapíše auditní záznam coupon_deactivate s before/after (feature admin-dashboard, R7.6/R7.8, Property 2). Vrací null, pokud kupón neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_deactivate_coupon(uuid, uuid) from public;
grant execute on function public.admin_deactivate_coupon(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 14.1 Smazání kupónu: hard delete + auditní záznam coupon_delete
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_coupon(
  p_actor_user_id uuid,
  p_coupon_id uuid
)
returns public.coupons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.coupons;
begin
  -- Zámek řádku + zachycení posledního stavu PŘED smazáním.
  select * into v_before
  from public.coupons
  where id = p_coupon_id
  for update;

  if not found then
    return null;
  end if;

  -- Hard delete (R7.7).
  delete from public.coupons where id = p_coupon_id;

  -- Auditní záznam ve STEJNÉ transakci jako smazání (R7.8, Property 2).
  -- after = null (objekt zaniká); audit_log.target_id nemá FK na coupons, takže
  -- záznam přetrvá i po smazání kupónu.
  perform public.write_audit_log(
    p_actor_user_id,
    'coupon_delete',
    'coupon',
    p_coupon_id,
    public.coupon_snapshot(v_before),
    null
  );

  return v_before;
end;
$$;

comment on function public.admin_delete_coupon(uuid, uuid) is
  'Administrátorské smazání kupónu: hard delete a ve stejné transakci zapíše auditní záznam coupon_delete (before = poslední stav, after = null) (feature admin-dashboard, R7.7/R7.8, Property 2). Vrací null, pokud kupón neexistuje. Volá ji výhradně server-side service role.';

revoke all on function public.admin_delete_coupon(uuid, uuid) from public;
grant execute on function public.admin_delete_coupon(uuid, uuid) to service_role;
