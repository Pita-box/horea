-- ---------------------------------------------------------------------------
-- 0051 — Více zaměstnanců na jednu rezervaci (reservation_employees)
-- ---------------------------------------------------------------------------
-- Aditivní migrace. Zavádí M:N join tabulku reservation_employees jako zdroj
-- pravdy o množině zaměstnanců přiřazených k jedné rezervaci (např. služba
-- vyžaduje více lidí, nebo rezervace obsahuje více služeb).
--
-- Schéma reservations se NEMĚNÍ: reservations.employee_id zůstává jako
-- denormalizovaný „primary" (první přiřazený zaměstnanec, příp. NULL) kvůli
-- zpětné kompatibilitě se stávajícím kódem (booking flow, jednoduchá zobrazení).
-- Server vrstva ho drží v synchronizaci s první položkou množiny.
--
-- Zápis (insert/delete) běží VÝHRADNĚ přes service-role klienta
-- (ReservationEmployeeAssigner), shodně s reservations.employee_id a employees —
-- žádná zapisovací RLS politika pro anon/authenticated. Majitel čte řádky přes
-- navázanou rezervaci svého podniku (mirror reservation_services_owner_read).
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_employees (
  reservation_id uuid not null
    references public.reservations (id) on delete cascade,
  employee_id uuid not null
    references public.employees (id) on delete cascade,
  primary key (reservation_id, employee_id)
);

create index if not exists reservation_employees_employee_id_idx
  on public.reservation_employees (employee_id);

comment on table public.reservation_employees is
  'Množina zaměstnanců přiřazených k rezervaci (M:N). reservations.employee_id zůstává jako denormalizovaný primary (první přiřazený). Zápis jen service-role.';

alter table public.reservation_employees enable row level security;

-- Majitel čte řádky přes navázanou rezervaci svého podniku (mirror tenant_isolation
-- na reservations: business owner_user_id = auth.uid()). Zápis = service-role (obchází RLS).
drop policy if exists reservation_employees_owner_read on public.reservation_employees;
create policy reservation_employees_owner_read on public.reservation_employees
  for select
  using (
    exists (
      select 1
      from public.reservations r
      join public.businesses b on b.id = r.business_id
      where r.id = reservation_employees.reservation_id
        and b.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill ze stávajícího reservations.employee_id
-- ---------------------------------------------------------------------------
-- Pro každou rezervaci s přiřazeným zaměstnancem vytvoří odpovídající řádek.
-- Idempotentní (on conflict do nothing) — bezpečné při opakovaném běhu na sdílené DB.
insert into public.reservation_employees (reservation_id, employee_id)
select r.id, r.employee_id
from public.reservations r
where r.employee_id is not null
on conflict do nothing;
