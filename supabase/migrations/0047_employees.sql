-- ---------------------------------------------------------------------------
-- 0047 — Zaměstnanci podniku (tým) + napojení na rezervace + přepínače
-- ---------------------------------------------------------------------------
-- Tabulka employees: členové týmu podniku (jméno, pozice, foto v R2).
-- businesses.show_team_public        → zobrazit „Náš tým" na veřejném profilu.
-- businesses.allow_employee_selection → klient si může vybrat zaměstnance při rezervaci.
-- reservations.employee_id           → přiřazení rezervace konkrétnímu zaměstnanci.
--
-- Zápis (CRUD) běží server-side přes service-role po ověření vlastnictví podniku,
-- proto na employees stačí RLS pro veřejné ČTENÍ (publikované podniky). Service
-- role RLS obchází.
-- ---------------------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  role text,
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists employees_business_id_idx on public.employees (business_id);

alter table public.employees enable row level security;

-- Veřejné čtení jen pro publikované podniky (anon klíč). Zápis = service-role.
drop policy if exists employees_public_read on public.employees;
create policy employees_public_read on public.employees
  for select
  using (public.is_business_published(business_id));

comment on table public.employees is
  'Členové týmu podniku (zobrazitelní na veřejném profilu, přiřaditelní k rezervacím). Zápis jen service-role.';

-- Přepínače na podniku.
alter table public.businesses
  add column if not exists show_team_public boolean not null default false,
  add column if not exists allow_employee_selection boolean not null default false;

comment on column public.businesses.show_team_public is
  'Zobrazit sekci „Náš tým" (zaměstnance) na veřejném profilu.';
comment on column public.businesses.allow_employee_selection is
  'Umožnit klientům vybrat konkrétního zaměstnance při rezervaci.';

-- Přiřazení rezervace zaměstnanci (volitelné). Smazání zaměstnance → NULL.
alter table public.reservations
  add column if not exists employee_id uuid references public.employees (id) on delete set null;

create index if not exists reservations_employee_id_idx on public.reservations (employee_id);
