-- Migrace 0026: rozšíření tabulky `payments` o číslo faktury.
--
-- Feature `subscription-payments`, Faktura_Generator. Aditivní migrace:
-- přidává JEDEN sloupec `invoice_number` a unique constraint na něj. Sloupec
-- `variable_symbol` už unikátní constraint má (definovaný v migraci 0005), proto
-- se zde neduplikuje.
-- _Requirements: 5.2, 7.4_

-- invoice_number — pořadové číslo faktury přidělené až při přechodu Payment na
-- `paid` (přes Faktura_Generator a tabulku invoice_counter). Nullable: platby
-- ve stavu pending/failed číslo faktury nemají. Unique zaručuje, že žádné dvě
-- platby nesdílejí stejné číslo faktury.
alter table public.payments
  add column if not exists invoice_number text;

alter table public.payments
  add constraint payments_invoice_number_unique unique (invoice_number);

comment on column public.payments.invoice_number is
  'Pořadové číslo faktury přidělené při přechodu Payment na paid (přes invoice_counter). NULL u pending/failed plateb. Unikátní napříč tabulkou.';
