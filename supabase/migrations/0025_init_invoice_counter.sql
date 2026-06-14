-- Migrace 0025: tabulka `invoice_counter` pro číslování faktur per kalendářní rok.
--
-- Feature `subscription-payments`, Faktura_Generator. Tabulka drží poslední
-- přidělené pořadové číslo faktury pro každý kalendářní rok. Číslo se přiděluje
-- atomicky pod zámkem řádku (`SELECT ... FOR UPDATE`) až při přechodu Payment
-- na stav `paid`, čímž je zaručena striktně rostoucí, unikátní a bezmezerová
-- (gap-free) posloupnost v rámci roku.
-- _Requirements: 7.2, 7.3, 7.4_

create table public.invoice_counter (
  -- Kalendářní rok (např. 2025); primární klíč => právě jeden řádek na rok,
  -- na kterém se zamyká při přidělení čísla.
  year integer primary key,
  -- Poslední přidělené pořadové číslo v daném roce. Inkrementuje se o 1 pod
  -- zámkem řádku; výchozí 0 znamená, že zatím nebylo přiděleno žádné číslo.
  last_number integer not null default 0,
  constraint invoice_counter_last_number_non_negative check (last_number >= 0)
);

comment on table public.invoice_counter is
  'Poslední přidělené pořadové číslo faktury per kalendářní rok. Přiděluje se atomicky pod zámkem řádku (SELECT ... FOR UPDATE) při přechodu Payment na paid.';
comment on column public.invoice_counter.year is
  'Kalendářní rok; primární klíč zajišťuje jeden zamykatelný řádek na rok.';
comment on column public.invoice_counter.last_number is
  'Poslední přidělené pořadové číslo v roce; inkrementuje se o 1 pod zámkem. 0 = zatím nic nepřiděleno.';
