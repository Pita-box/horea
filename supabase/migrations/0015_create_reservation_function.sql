-- Migrace 0015: atomické vytvoření rezervace (SECURITY DEFINER)
--
-- Kontext: rezervace vytváří VÝHRADNĚ server-side ReservationCreator přes service
-- role klíč. Tato funkce zapouzdřuje kritickou sekci tak, aby dva souběžné pokusy
-- o STEJNÝ slot STEJNÉHO podniku nemohly oba uspět při allow_parallel_slots = false
-- (R9.7).
--
-- Atomicita stojí na dvou pilířích, které běží v jediné transakci RPC volání:
--   1) pg_advisory_xact_lock(hashtext(business_id)) — lehký zámek klíčovaný hashí
--      business_id. Serializuje souběžné rezervace pro TÝŽ podnik, zatímco různé
--      podniky běží paralelně. Uvolní se automaticky na commit i rollback (xact).
--   2) Overlap re-check pod zámkem — exists() přes tstzrange &&. Default bounds
--      tstzrange jsou [) (polootevřený), takže dotykové sloty (konec == začátek)
--      NEkolidují. To je konzistentní se Slot_Calculator (intervalsOverlap používá
--      ostré nerovnosti a tolerance grid je řešena v TS vrstvě).
--
-- VĚDOMÁ ODCHYLKA od designu „recompute celého gridu v SQL": grid a otevírací dobu
-- ověřuje TS přes Slot_Calculator (sdílený loadAvailableSlots) TĚSNĚ PŘED voláním
-- této funkce. Jediná věc, která se mezi krokem 2 a krokem 5 může změnit a způsobit
-- Reservation_Conflict, je vznik nové aktivní rezervace — a přesně to ověřuje
-- overlap re-check pod zámkem. Recompute celého gridu (otevírací doba + grid krok)
-- v SQL by jen duplikoval logiku Slot_Calculatoru a zaváděl riziko rozjíždění obou
-- implementací. Pro allow_parallel_slots = true se overlap nekontroluje vůbec
-- (paralelní rezervace jsou povoleny), shodně s chováním Slot_Calculatoru.
--
-- Návratová tabulka rozlišuje výsledky bez házení výjimek (snazší mapování v TS):
--   reservation_id / status  — úspěšný insert,
--   conflict = true          — slot byl pod zámkem obsazen (→ 409 v TS),
--   not_published = true     — business není Published_Business nebo služba k němu
--                              nepatří / neexistuje (→ 404 v TS).

create or replace function public.create_reservation(
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
  status public.reservation_status,
  conflict boolean,
  not_published boolean
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
begin
  -- (1) Serializace per business. Drží se do konce transakce RPC volání.
  perform pg_advisory_xact_lock(hashtext(p_business_id::text));

  -- Publikovanost ověřujeme UVNITŘ zámku — stav se mohl od kroku 2 změnit.
  if not public.is_business_published(p_business_id) then
    return query select null::uuid, null::public.reservation_status, false, true;
    return;
  end if;

  select b.auto_approve_reservations, b.allow_parallel_slots
    into v_auto_approve, v_allow_parallel
  from public.businesses b
  where b.id = p_business_id;

  -- Služba musí stále existovat a patřit danému businessu (defensivní re-check).
  if not exists (
    select 1
    from public.services s
    where s.id = p_service_id
      and s.business_id = p_business_id
  ) then
    return query select null::uuid, null::public.reservation_status, false, true;
    return;
  end if;

  -- (2) Overlap re-check pod zámkem (jen když nejsou povoleny paralelní sloty).
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
      return query select null::uuid, null::public.reservation_status, true, false;
      return;
    end if;
  end if;

  -- Status dle auto-approve v okamžiku zápisu (R9.6).
  v_status := case when v_auto_approve then 'approved' else 'pending' end::public.reservation_status;

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
    v_status,
    p_client_name,
    p_client_phone,
    p_client_email,
    p_note
  )
  returning id into v_reservation_id;

  return query select v_reservation_id, v_status, false, false;
end;
$$;

comment on function public.create_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) is
  'Atomicky vytvoří rezervaci pod advisory lockem klíčovaným business_id. Overlap re-check (tstzrange &&) brání dvojí rezervaci téhož slotu při allow_parallel_slots = false (R9.7). Vrací conflict/not_published signály místo výjimek. Volá ji výhradně server-side service role.';

-- Funkci volá VÝHRADNĚ server-side service role klíč (ReservationCreator), který
-- obchází RLS. Odebíráme default execute z PUBLIC, aby ji anon ani authenticated
-- klient NIKDY nemohli zavolat (jinak by SECURITY DEFINER insert obešel RLS).
revoke all on function public.create_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) from public;
grant execute on function public.create_reservation(uuid, uuid, timestamptz, timestamptz, text, text, text, text) to service_role;
