-- ---------------------------------------------------------------------------
-- 0049 — Multi-service rezervace: tabulka reservation_services (množina služeb)
-- ---------------------------------------------------------------------------
-- Aditivní migrace. Zavádí join tabulku reservation_services jako zdroj pravdy
-- o uspořádané množině služeb jedné rezervace (Reservation_Service_Set) se
-- snapshotem délky a ceny každé služby v okamžiku zápisu a s pořadím (position).
--
-- Schéma reservations se NEMĚNÍ: reservations.service_id zůstává NOT NULL a
-- ukazuje na službu s position = 0 (denormalizovaný „primary"). Single-service
-- cesta a existující dotazy/FK/cascade fungují beze změny → starý i nový kód
-- koexistují (R11.1, R13.1).
--
-- Zápis (insert/update/delete) běží VÝHRADNĚ přes SECURITY DEFINER RPC volané
-- service-role klientem (shodně s reservations a service_employees) — žádná
-- zapisovací RLS politika pro anon/authenticated. Majitel čte řádky přes
-- navázanou rezervaci svého podniku (mirror tenant_isolation).
--
-- Pozn.: backfill z reservations.service_id a nové RPC (create/manual/edit
-- _reservation_multi) se doplní do TÉTO migrace v navazujících krocích.
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_services (
  reservation_id uuid not null
    references public.reservations (id) on delete cascade,
  service_id uuid not null
    references public.services (id) on delete cascade,
  position int not null,
  duration_minutes_snapshot int not null check (duration_minutes_snapshot > 0),
  price_czk_snapshot numeric(10, 2) not null check (price_czk_snapshot >= 0),
  primary key (reservation_id, position),
  unique (reservation_id, service_id),
  check (position >= 0)
);

create index if not exists reservation_services_reservation_id_idx
  on public.reservation_services (reservation_id);
create index if not exists reservation_services_service_id_idx
  on public.reservation_services (service_id);

comment on table public.reservation_services is
  'Uspořádaná množina služeb rezervace (Reservation_Service_Set) se snapshotem délky/ceny a pořadím (position). service_id rezervace = position 0. Zápis jen service-role přes RPC.';

alter table public.reservation_services enable row level security;

-- Majitel čte řádky přes navázanou rezervaci svého podniku (mirror tenant_isolation
-- na reservations: business owner_user_id = auth.uid()). Zápis = service-role (obchází RLS).
drop policy if exists reservation_services_owner_read on public.reservation_services;
create policy reservation_services_owner_read on public.reservation_services
  for select
  using (
    exists (
      select 1
      from public.reservations r
      join public.businesses b on b.id = r.business_id
      where r.id = reservation_services.reservation_id
        and b.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill z reservations.service_id (R11.1, R11.2, R11.3)
-- ---------------------------------------------------------------------------
-- Pro každou existující rezervaci vytvoří přesně jeden řádek reservation_services
-- s position = 0, jehož service_id odpovídá reservations.service_id; snapshoty
-- duration_minutes / price_czk se berou z aktuálního stavu services.
-- Idempotentní (on conflict do nothing) — bezpečné při opakovaném běhu na sdílené DB.
insert into public.reservation_services
  (reservation_id, service_id, position, duration_minutes_snapshot, price_czk_snapshot)
select r.id, r.service_id, 0, s.duration_minutes, s.price_czk
from public.reservations r
join public.services s on s.id = r.service_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RPC create_reservation_multi — veřejná cesta (R5.1, R6.3, R7.1–R7.6, R4.1, R4.2)
-- ---------------------------------------------------------------------------
-- Multi-service obdoba create_reservation (0015). Přijímá uspořádané pole
-- p_service_ids (pořadí = position) a autoritativně počítá Combined_Duration =
-- SUM(services.duration_minutes) i ends_at = starts_at + Combined_Duration UVNITŘ
-- zámku ze services (ne z TS-předané hodnoty), aby se vyloučila divergence při
-- změně ceníku mezi pre-lock fetchem a zápisem.
--
-- Nová funkce s novým názvem (ne změna signatury create_reservation) — lekce
-- z migrací 0019/0020/0021: přetížení/změna signatury sdílené funkce vede
-- k PostgREST nejednoznačnosti kandidátů (PGRST203). Stávající single-service
-- create_reservation zůstává nedotčená; obě cesty koexistují.
--
-- Atomicita stojí na stejných dvou pilířích v jediné transakci RPC volání:
--   1) pg_advisory_xact_lock(hashtext(business_id)) — serializace per podnik,
--   2) overlap re-check pod zámkem (tstzrange &&) při allow_parallel_slots = false.
--
-- Insert reservations (service_id = p_service_ids[1] = position 0) i všech řádků
-- reservation_services běží v téže transakci → žádný částečný zápis (R7.3).
-- Pořadí výběru se materializuje přes unnest(...) with ordinality (position = ord - 1).
--
-- Návratová tabulka rozlišuje výsledky bez házení výjimek:
--   reservation_id / status  — úspěšný insert,
--   conflict = true          — slot byl pod zámkem obsazen (→ 409 v TS),
--   not_published = true     — business není Published_Business (→ 404 v TS),
--   invalid = true           — počet služeb mimo [1,10], duplicita, nebo některá
--                              služba neexistuje / nepatří podniku (→ 400/404 v TS).
create or replace function public.create_reservation_multi(
  p_business_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_note text
)
returns table (
  reservation_id uuid,
  status public.reservation_status,
  conflict boolean,
  not_published boolean,
  invalid boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auto_approve boolean;
  v_allow_parallel boolean;
  v_status public.reservation_status;
  v_has_conflict boolean;
  v_reservation_id uuid;
  v_count int;
  v_distinct_count int;
  v_owned_count int;
  v_combined_duration int;
  v_ends_at timestamptz;
begin
  -- (1) Serializace per business. Drží se do konce transakce RPC volání.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- Publikovanost ověřujeme UVNITŘ zámku — stav se mohl od kroku 2 změnit.
  if not public.is_business_published(p_business_id) then
    return query select null::uuid, null::public.reservation_status, false, true, false;
    return;
  end if;

  -- (3) Rozsah počtu služeb [MIN, MAX] = [1, 10] a bez duplicit (R5.1, R5.2, R5.3).
  -- array_length prázdného/NULL pole je NULL → coalesce na 0 → invalid.
  v_count := coalesce(array_length(p_service_ids, 1), 0);
  if v_count < 1 or v_count > 10 then
    return query select null::uuid, null::public.reservation_status, false, false, true;
    return;
  end if;

  select count(distinct x) into v_distinct_count
  from unnest(p_service_ids) as x;
  if v_distinct_count <> v_count then
    return query select null::uuid, null::public.reservation_status, false, false, true;
    return;
  end if;

  select b.auto_approve_reservations, b.allow_parallel_slots
    into v_auto_approve, v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- (4) Všechny služby musí existovat a patřit danému podniku (R7.1).
  select count(*) into v_owned_count
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  if v_owned_count <> v_count then
    return query select null::uuid, null::public.reservation_status, false, false, true;
    return;
  end if;

  -- (5) Autoritativní Combined_Duration ze services + ends_at (R2.1, R2.2, R6.3).
  select sum(s.duration_minutes) into v_combined_duration
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  v_ends_at := p_starts_at + make_interval(mins => v_combined_duration);

  -- (6) Overlap re-check pod zámkem (jen když nejsou povoleny paralelní sloty).
  if v_allow_parallel = false then
    select exists (
      select 1
      from public.reservations r
      where r.business_id = p_business_id
        and r.status in ('pending', 'approved')
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_starts_at, v_ends_at)
    )
    into v_has_conflict;

    if v_has_conflict then
      return query select null::uuid, null::public.reservation_status, true, false, false;
      return;
    end if;
  end if;

  -- Status dle auto-approve v okamžiku zápisu (R7.6).
  v_status := case when v_auto_approve then 'approved' else 'pending' end::public.reservation_status;

  -- (8) Insert rezervace. service_id = první služba = position 0 (denormalizovaný primary).
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
    p_service_ids[1],
    p_starts_at,
    v_ends_at,
    v_status,
    p_client_name,
    p_client_phone,
    p_client_email,
    p_note
  )
  returning id into v_reservation_id;

  -- (9) Insert celé množiny služeb se snapshotem délky/ceny a pořadím (position = ord - 1).
  -- unnest ... with ordinality materializuje pořadí prvků p_service_ids (R4.1, R4.2, R7.5).
  insert into public.reservation_services
    (reservation_id, service_id, position, duration_minutes_snapshot, price_czk_snapshot)
  select v_reservation_id, u.service_id, (u.ord - 1)::int, s.duration_minutes, s.price_czk
  from unnest(p_service_ids) with ordinality as u(service_id, ord)
  join public.services s on s.id = u.service_id
  where s.business_id = p_business_id;

  return query select v_reservation_id, v_status, false, false, false;
end;
$$;

comment on function public.create_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) is
  'Atomicky vytvoří multi-service rezervaci pod advisory lockem klíčovaným business_id. Autoritativně počítá Combined_Duration = SUM(services.duration_minutes) a ends_at pod zámkem. Validuje rozsah počtu služeb [1,10], duplicity a příslušnost všech služeb k podniku. Insert reservations (service_id = p_service_ids[1]) + reservation_services přes unnest with ordinality (position = ord-1). Vrací conflict/not_published/invalid signály místo výjimek. Volá ji výhradně server-side service role.';

-- Funkci volá VÝHRADNĚ server-side service role klíč (ReservationCreator), který
-- obchází RLS. Odebíráme default execute z PUBLIC, aby ji anon ani authenticated
-- klient NIKDY nemohli zavolat (jinak by SECURITY DEFINER insert obešel RLS).
revoke all on function public.create_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) from public;
grant execute on function public.create_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC create_manual_reservation_multi — ruční tvorba majitelem (R5.4, R15.1–R15.5)
-- ---------------------------------------------------------------------------
-- Multi-service obdoba create_manual_reservation (0021/0022). Stejný vzor jako
-- create_reservation_multi výše, s těmito rozdíly danými tím, že jde o operaci
-- MAJITELE v dashboardu (Manual_Reservation_Creator):
--
--   1) Status je VŽDY 'approved' bez ohledu na auto_approve_reservations (R15.1) —
--      žádná auto-approve větev. Status se proto ani nevrací v návratové tabulce.
--   2) Publikovanost se NEVYŽADUJE (operace majitele) — shodně s create_manual_reservation
--      po migraci 0022 (publish gate odstraněn). not_published zůstává ve výstupu
--      kvůli stabilní signatuře, ale tato funkce ho nikdy nenastaví na true;
--      neexistující/cizí službu signalizuje příznak invalid (viz krok 4 níže).
--
-- Vše ostatní je shodné s create_reservation_multi: advisory lock klíčovaný
-- business_id, rozsah počtu služeb [1,10] + zákaz duplicit, ověření příslušnosti
-- všech služeb k podniku, autoritativní Combined_Duration = SUM(services.duration_minutes)
-- a ends_at počítané pod zámkem, overlap re-check při allow_parallel_slots = false,
-- insert reservations (service_id = p_service_ids[1] = position 0) + reservation_services
-- přes unnest(...) with ordinality (position = ord - 1) v jediné transakci (R15.2, R15.3, R15.5).
create or replace function public.create_manual_reservation_multi(
  p_business_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_client_email text,
  p_note text
)
returns table (
  reservation_id uuid,
  conflict boolean,
  not_published boolean,
  invalid boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allow_parallel boolean;
  v_has_conflict boolean;
  v_reservation_id uuid;
  v_count int;
  v_distinct_count int;
  v_owned_count int;
  v_combined_duration int;
  v_ends_at timestamptz;
begin
  -- (1) Serializace per business. Drží se do konce transakce RPC volání.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- (2) Publikovanost se u operace majitele NEVYŽADUJE (shodně s 0022) — žádný publish gate.

  -- (3) Rozsah počtu služeb [MIN, MAX] = [1, 10] a bez duplicit (R5.4, R15.2).
  -- array_length prázdného/NULL pole je NULL → coalesce na 0 → invalid.
  v_count := coalesce(array_length(p_service_ids, 1), 0);
  if v_count < 1 or v_count > 10 then
    return query select null::uuid, false, false, true;
    return;
  end if;

  select count(distinct x) into v_distinct_count
  from unnest(p_service_ids) as x;
  if v_distinct_count <> v_count then
    return query select null::uuid, false, false, true;
    return;
  end if;

  select b.allow_parallel_slots
    into v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- (4) Všechny služby musí existovat a patřit danému podniku (R15.2).
  select count(*) into v_owned_count
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  if v_owned_count <> v_count then
    return query select null::uuid, false, false, true;
    return;
  end if;

  -- (5) Autoritativní Combined_Duration ze services + ends_at (R15.3).
  select sum(s.duration_minutes) into v_combined_duration
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  v_ends_at := p_starts_at + make_interval(mins => v_combined_duration);

  -- (6) Overlap re-check pod zámkem (jen když nejsou povoleny paralelní sloty) (R15.5).
  if v_allow_parallel = false then
    select exists (
      select 1
      from public.reservations r
      where r.business_id = p_business_id
        and r.status in ('pending', 'approved')
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_starts_at, v_ends_at)
    )
    into v_has_conflict;

    if v_has_conflict then
      return query select null::uuid, true, false, false;
      return;
    end if;
  end if;

  -- (7) Insert rezervace s VYNUCENÝM status = 'approved' nezávisle na auto_approve (R15.1).
  -- service_id = první služba = position 0 (denormalizovaný primary).
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
    p_service_ids[1],
    p_starts_at,
    v_ends_at,
    'approved'::public.reservation_status,
    p_client_name,
    p_client_phone,
    p_client_email,
    p_note
  )
  returning id into v_reservation_id;

  -- (8) Insert celé množiny služeb se snapshotem délky/ceny a pořadím (position = ord - 1).
  -- unnest ... with ordinality materializuje pořadí prvků p_service_ids (R4.1, R4.2, R15.3).
  insert into public.reservation_services
    (reservation_id, service_id, position, duration_minutes_snapshot, price_czk_snapshot)
  select v_reservation_id, u.service_id, (u.ord - 1)::int, s.duration_minutes, s.price_czk
  from unnest(p_service_ids) with ordinality as u(service_id, ord)
  join public.services s on s.id = u.service_id
  where s.business_id = p_business_id;

  return query select v_reservation_id, false, false, false;
end;
$$;

comment on function public.create_manual_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) is
  'Atomicky vytvoří multi-service rezervaci jménem majitele pod advisory lockem klíčovaným business_id se status VŽDY approved (R15.1) bez ohledu na auto_approve_reservations. Publikovanost se NEVYŽADUJE (operace majitele, shodně s create_manual_reservation po 0022). Autoritativně počítá Combined_Duration = SUM(services.duration_minutes) a ends_at pod zámkem. Validuje rozsah počtu služeb [1,10], duplicity a příslušnost všech služeb k podniku (invalid). Insert reservations (service_id = p_service_ids[1]) + reservation_services přes unnest with ordinality (position = ord-1). not_published zůstává ve výstupu kvůli signatuře, ale nikdy se nenastaví na true. Vrací conflict/invalid signály místo výjimek. Volá ji výhradně server-side service role.';

-- Funkci volá VÝHRADNĚ server-side service role klíč (ManualReservationCreator),
-- který obchází RLS. Odebíráme default execute z PUBLIC, aby ji anon ani
-- authenticated klient NIKDY nemohli zavolat.
revoke all on function public.create_manual_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) from public;
grant execute on function public.create_manual_reservation_multi(uuid, uuid[], timestamptz, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC edit_reservation_multi — úprava kombinované rezervace majitelem (R9.1–R9.6)
-- ---------------------------------------------------------------------------
-- Multi-service obdoba edit_reservation (0021). Přijímá uspořádané pole
-- p_service_ids (pořadí = position) a autoritativně přepočítá Combined_Duration =
-- SUM(services.duration_minutes) i ends_at = starts_at + Combined_Duration UVNITŘ
-- zámku ze services (ne z TS-předané hodnoty), shodně s create_reservation_multi.
--
-- Klíčový rozdíl oproti create_reservation_multi: overlap re-check VYLUČUJE
-- samotnou upravovanou rezervaci (`r.id != p_reservation_id`, R9.5). Bez toho by
-- rezervace kolidovala se svým vlastním stávajícím intervalem a každá úprava
-- ponechávající čas (nebo měnící jen množinu služeb) by selhala.
--
-- Náhrada množiny služeb je atomická v téže transakci RPC volání:
--   DELETE staré množiny → UPDATE reservations (service_id = p_service_ids[1] =
--   position 0, nový starts_at/ends_at) → INSERT nové množiny přes
--   unnest(...) with ordinality (position = ord - 1) → žádný částečný zápis (R9.3).
--
-- Návratová tabulka rozlišuje výsledky bez házení výjimek (snazší mapování v TS):
--   updated = true  — UPDATE + náhrada množiny proběhly,
--   conflict = true — slot byl pod zámkem obsazen jinou aktivní rezervací (→ 409),
--   invalid = true  — rezervace neexistuje / nepatří podniku / není ve stavu
--                     {pending, approved}, počet služeb mimo [1,10], duplicita,
--                     nebo některá služba neexistuje / nepatří podniku (→ 409/400).
create or replace function public.edit_reservation_multi(
  p_reservation_id uuid,
  p_business_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz
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
  v_count int;
  v_distinct_count int;
  v_owned_count int;
  v_combined_duration int;
  v_ends_at timestamptz;
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

  -- (3) Rozsah počtu služeb [MIN, MAX] = [1, 10] a bez duplicit (R9.6).
  -- array_length prázdného/NULL pole je NULL → coalesce na 0 → invalid.
  v_count := coalesce(array_length(p_service_ids, 1), 0);
  if v_count < 1 or v_count > 10 then
    return query select false, false, true;
    return;
  end if;

  select count(distinct x) into v_distinct_count
  from unnest(p_service_ids) as x;
  if v_distinct_count <> v_count then
    return query select false, false, true;
    return;
  end if;

  -- (4) Všechny služby musí existovat a patřit témuž podniku (R9.4).
  select count(*) into v_owned_count
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  if v_owned_count <> v_count then
    return query select false, false, true;
    return;
  end if;

  -- (5) Autoritativní Combined_Duration ze services + ends_at (R9.2).
  select sum(s.duration_minutes) into v_combined_duration
  from public.services s
  where s.id = any(p_service_ids)
    and s.business_id = p_business_id;
  v_ends_at := p_starts_at + make_interval(mins => v_combined_duration);

  select b.allow_parallel_slots
    into v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- (6) Overlap re-check pod zámkem s VYLOUČENÍM sebe sama (R9.5).
  if v_allow_parallel = false then
    select exists (
      select 1
      from public.reservations r
      where r.business_id = p_business_id
        and r.status in ('pending', 'approved')
        and r.id != p_reservation_id
        and tstzrange(r.starts_at, r.ends_at) && tstzrange(p_starts_at, v_ends_at)
    )
    into v_has_conflict;

    if v_has_conflict then
      return query select false, true, false;
      return;
    end if;
  end if;

  -- (7) Náhrada celé množiny služeb v jediné transakci: DELETE staré → UPDATE → INSERT nové (R9.3).
  delete from public.reservation_services
  where reservation_id = p_reservation_id;

  -- UPDATE rezervace: service_id = první služba = position 0, nový čas a přepočtený ends_at.
  update public.reservations
  set service_id = p_service_ids[1],
      starts_at = p_starts_at,
      ends_at = v_ends_at,
      updated_at = now()
  where id = p_reservation_id;

  -- INSERT nové množiny se snapshotem délky/ceny a pořadím (position = ord - 1).
  -- unnest ... with ordinality materializuje pořadí prvků p_service_ids (R4.1, R4.2).
  insert into public.reservation_services
    (reservation_id, service_id, position, duration_minutes_snapshot, price_czk_snapshot)
  select p_reservation_id, u.service_id, (u.ord - 1)::int, s.duration_minutes, s.price_czk
  from unnest(p_service_ids) with ordinality as u(service_id, ord)
  join public.services s on s.id = u.service_id
  where s.business_id = p_business_id;

  return query select true, false, false;
end;
$$;

comment on function public.edit_reservation_multi(uuid, uuid, uuid[], timestamptz) is
  'Atomicky upraví čas a celou množinu služeb rezervace pod advisory lockem klíčovaným business_id. Autoritativně přepočítá Combined_Duration = SUM(services.duration_minutes) a ends_at pod zámkem. Validuje stav rezervace {pending,approved}, rozsah počtu služeb [1,10], duplicity a příslušnost všech služeb k podniku (invalid). Overlap re-check VYLUČUJE upravovanou rezervaci (id != p_reservation_id), aby nekolidovala sama se sebou (R9.5). Náhrada množiny: DELETE staré reservation_services + UPDATE reservations (service_id = p_service_ids[1]) + INSERT nové přes unnest with ordinality (position = ord-1). Vrací updated/conflict/invalid místo výjimek. Volá ji výhradně server-side service role.';

-- Funkci volá VÝHRADNĚ server-side service role klíč (ReservationEditor), který
-- obchází RLS. Odebíráme default execute z PUBLIC, aby ji anon ani authenticated
-- klient NIKDY nemohli zavolat.
revoke all on function public.edit_reservation_multi(uuid, uuid, uuid[], timestamptz) from public;
grant execute on function public.edit_reservation_multi(uuid, uuid, uuid[], timestamptz) to service_role;
