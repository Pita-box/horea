-- Migrace 0021: atomické mutační funkce pro dashboard majitele
-- (feature reservation-management) — úprava rezervace a ruční tvorba rezervace.
--
-- Obě funkce sdílejí stejný atomický vzor jako create_reservation (migrace 0015):
-- pg_advisory_xact_lock(hashtext(business_id)) serializuje souběžné zápisy téhož
-- podniku, overlap re-check (tstzrange &&) pod zámkem brání dvojí obsazení slotu
-- při allow_parallel_slots = false. Doménový grid + otevírací dobu ověřuje TS
-- vrstva (Slot_Calculator přes loadAvailableSlots) TĚSNĚ PŘED voláním RPC; jediná
-- věc, která se mezitím může změnit, je vznik / přesun aktivní rezervace — a to
-- ověřuje overlap re-check pod zámkem.
--
-- Obě funkce volá VÝHRADNĚ server-side service role (Reservation_Editor /
-- Manual_Reservation_Creator), proto revoke from public + grant execute to
-- service_role.

-- =============================================================================
-- 1) edit_reservation — atomická úprava času a/nebo služby (R9.3)
-- =============================================================================
--
-- Klíčový rozdíl oproti create_reservation: overlap re-check VYLUČUJE samotnou
-- upravovanou rezervaci (`r.id != p_reservation_id`, R9.3). Bez toho by rezervace
-- kolidovala se svým vlastním stávajícím intervalem a každá úprava ponechávající
-- čas (nebo měnící jen službu) by selhala.
--
-- Návratová tabulka rozlišuje výsledky bez házení výjimek (snazší mapování v TS):
--   updated = true  — UPDATE proběhl,
--   conflict = true — slot byl pod zámkem obsazen jinou aktivní rezervací (→ 409),
--   invalid = true  — rezervace neexistuje / nepatří podniku / není ve stavu
--                     {pending, approved}, nebo služba nepatří podniku (→ 409/400).

create or replace function public.edit_reservation(
  p_reservation_id uuid,
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  updated boolean,
  conflict boolean,
  invalid boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.reservation_status;
  v_allow_parallel boolean;
  v_has_conflict boolean;
begin
  -- (1) Serializace per business. Drží se do konce transakce RPC volání.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- (2) Rezervace musí existovat, patřit podniku a být ve stavu {pending, approved}.
  select r.status
    into v_status
  from public.reservations r
  where r.id = p_reservation_id
    and r.business_id = p_business_id;

  if v_status is null or v_status not in ('pending', 'approved') then
    return query select false, false, true;
    return;
  end if;

  -- (3) Služba musí existovat a patřit témuž podniku.
  if not exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and s.business_id = p_business_id
  ) then
    return query select false, false, true;
    return;
  end if;

  select b.allow_parallel_slots
    into v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- (4) Overlap re-check pod zámkem s VYLOUČENÍM sebe sama (R9.3).
  if v_allow_parallel = false then
    select exists (
      select 1
      from public.reservations r
      where r.business_id = p_business_id
        and r.status in ('pending', 'approved')
        and r.id != p_reservation_id
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_starts_at, p_ends_at)
    )
    into v_has_conflict;

    if v_has_conflict then
      return query select false, true, false;
      return;
    end if;
  end if;

  -- (5) UPDATE s novým časem, službou a dopočteným ends_at (v UTC, R9.7).
  update public.reservations
  set service_id = p_service_id,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = p_reservation_id;

  return query select true, false, false;
end;
$$;

comment on function public.edit_reservation(uuid, uuid, uuid, timestamptz, timestamptz) is
  'Atomicky upraví čas a/nebo službu rezervace pod advisory lockem klíčovaným business_id. Overlap re-check VYLUČUJE upravovanou rezervaci (id != p_reservation_id), aby nekolidovala sama se sebou (R9.3). Vrací updated/conflict/invalid místo výjimek. Volá ji výhradně server-side service role.';

revoke all on function public.edit_reservation(uuid, uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.edit_reservation(uuid, uuid, uuid, timestamptz, timestamptz) to service_role;

-- =============================================================================
-- 2) create_manual_reservation — ruční tvorba majitelem s vynuceným approved (R12.4)
-- =============================================================================
--
-- DEDIKOVANÁ funkce místo přidání parametru k create_reservation:
-- create_reservation (3-arg get_active_reservation_intervals → migrace 0019/0020)
-- nás naučila, že přetížení / měnění signatury sdílené funkce vede k PostgREST
-- nejednoznačnosti kandidátů (PGRST203) a rozbití veřejné cesty. Proto NEMĚNÍME
-- signaturu create_reservation a nepřidáváme parametr „forced status"; ruční
-- tvorba má vlastní funkci s pevně zadaným status = 'approved' nezávisle na
-- business.auto_approve_reservations.
--
-- Jinak je tělo shodné s create_reservation: advisory lock, kontrola
-- publikovanosti a příslušnosti služby (→ not_published), overlap re-check pod
-- zámkem (→ conflict), insert. Status je ale VŽDY 'approved' (R12.4).

create or replace function public.create_manual_reservation(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_note text
)
returns table (
  reservation_id uuid,
  conflict boolean,
  not_published boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allow_parallel boolean;
  v_has_conflict boolean;
  v_reservation_id uuid;
begin
  -- (1) Serializace per business.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- (2) Publikovanost ověřujeme uvnitř zámku (shodně s create_reservation).
  if not public.is_business_published(p_business_id) then
    return query select null::uuid, false, true;
    return;
  end if;

  select b.allow_parallel_slots
    into v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- Služba musí existovat a patřit danému podniku (defensivní re-check).
  if not exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and s.business_id = p_business_id
  ) then
    return query select null::uuid, false, true;
    return;
  end if;

  -- (3) Overlap re-check pod zámkem (jen když nejsou povoleny paralelní sloty).
  if v_allow_parallel = false then
    select exists (
      select 1
      from public.reservations r
      where r.business_id = p_business_id
        and r.status in ('pending', 'approved')
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_starts_at, p_ends_at)
    )
    into v_has_conflict;

    if v_has_conflict then
      return query select null::uuid, true, false;
      return;
    end if;
  end if;

  -- (4) INSERT s VYNUCENÝM status = 'approved' nezávisle na auto_approve (R12.4).
  insert into public.reservations (
    business_id,
    service_id,
    starts_at,
    ends_at,
    status,
    client_name,
    client_phone,
    client_email,
    note
  ) values (
    p_business_id,
    p_service_id,
    p_starts_at,
    p_ends_at,
    'approved'::public.reservation_status,
    p_client_name,
    p_client_phone,
    p_client_email,
    p_note
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, false, false;
end;
$$;

comment on function public.create_manual_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) is
  'Atomicky vytvoří rezervaci jménem majitele pod advisory lockem klíčovaným business_id se status VŽDY approved (R12.4) bez ohledu na auto_approve_reservations. Dedikovaná funkce (ne parametr create_reservation) kvůli vyhnutí se přetížení signatury (lekce z migrací 0019/0020). Vrací conflict/not_published místo výjimek. Volá ji výhradně server-side service role.';

revoke all on function public.create_manual_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) from public;
grant execute on function public.create_manual_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) to service_role;
