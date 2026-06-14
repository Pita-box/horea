-- ---------------------------------------------------------------------------
-- 0048 — Přiřazení zaměstnanců ke službám (kdo vykonává kterou službu)
-- ---------------------------------------------------------------------------
-- M:N vazba service_employees. Pokud služba nemá žádný řádek → vykonávají ji
-- všichni zaměstnanci (řeší se v aplikaci, ne v DB). Veřejné čtení (anon) jen
-- pro publikované podniky kvůli výběru zaměstnance v rezervaci; zápis = service-role.
-- ---------------------------------------------------------------------------

create table if not exists public.service_employees (
  service_id uuid not null references public.services (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  primary key (service_id, employee_id)
);

create index if not exists service_employees_employee_id_idx
  on public.service_employees (employee_id);

alter table public.service_employees enable row level security;

-- Veřejné čtení jen pro publikované podniky (přes navázanou službu).
drop policy if exists service_employees_public_read on public.service_employees;
create policy service_employees_public_read on public.service_employees
  for select
  using (
    exists (
      select 1
      from public.services s
      where s.id = service_employees.service_id
        and public.is_business_published(s.business_id)
    )
  );

comment on table public.service_employees is
  'Které zaměstnance lze vybrat ke které službě. Prázdné pro službu = všichni. Zápis jen service-role.';
