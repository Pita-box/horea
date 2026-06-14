-- Migrace 0022: create_manual_reservation již nevyžaduje publikovaný podnik.
--
-- Kontext: ruční tvorba rezervace (Manual_Reservation_Creator) je operace
-- MAJITELE v dashboardu (R12). Requirements specu reservation-management u
-- operací majitele publikovanost NEVYŽADUJÍ — majitel s aktivním předplatným,
-- ale dosud NEPUBLIKOVANÝM profilem, musí umět zakládat (a upravovat) rezervace.
--
-- Migrace 0021 zdědila z create_reservation kontrolu is_business_published
-- (vracela not_published = true pro nepublikovaný podnik). To bránilo ruční
-- tvorbě u nepublikovaného podniku. Tato migrace funkci přepíše (stejná
-- signatura → create or replace, žádné přetížení) a publish gate odstraní.
-- Funkci nadále volá VÝHRADNĚ server-side service role (revoke/grant beze změny).
--
-- `not_published` ve výstupu zůstává (kvůli stabilní signatuře) a nově signalizuje
-- POUZE neexistující/cizí službu (defensivní re-check); TS vrstva ho mapuje na
-- „Vybraná služba již není dostupná".

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

  -- (2) Publikovanost se u operace majitele NEVYŽADUJE (R12) — žádný publish gate.
  --     Načteme nastavení paralelních slotů; pokud business neexistuje, overlap
  --     i insert stejně selžou na cizím/neexistujícím business_id.
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
  'Atomicky vytvoří rezervaci jménem majitele pod advisory lockem (status VŽDY approved, R12.4). Publikovanost se NEVYŽADUJE (operace majitele, R12). not_published nově signalizuje jen neexistující/cizí službu. Volá ji výhradně server-side service role.';

revoke all on function public.create_manual_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) from public;
grant execute on function public.create_manual_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) to service_role;
