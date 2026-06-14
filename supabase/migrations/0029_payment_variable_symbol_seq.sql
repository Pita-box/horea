-- Migrace 0029: monotónní zdroj variabilního symbolu platebního pokusu
-- (feature `subscription-payments`, Checkout + Billing_Engine, tasky 8.3, 10.2).
--
-- Variabilni_Symbol (1–10 číslic) musí být unikátní napříč `payments`. Aby byla
-- unikátnost *zaručená* (ne pouze pravděpodobnostní jako u náhody), odvozuje se
-- VS z monotónní sekvence — viz design.md, sekce *Variabilní symbol*, a
-- Property 3. Postgres SEQUENCE poskytuje striktně rostoucí, souběhu-bezpečný
-- zdroj hodnot (každé `nextval` vrátí jinou hodnotu i při paralelních voláních).
-- Mezery v sekvenci (rollback) nevadí — VS potřebuje jen unikátnost, ne
-- gap-free posloupnost. Čistou konverzi sekvence → dekadický VS dělá
-- `lib/payments/variable-symbol.ts`.
-- _Requirements: 5.1, 5.2_

-- Sekvence startuje od 1; maxhodnota 9 999 999 999 odpovídá 10 číslicím (limit
-- VS dle requirements). `no cycle` zabrání přetečení zpět na začátek (po
-- vyčerpání by `nextval` selhalo místo vrácení duplicitní hodnoty).
create sequence if not exists public.payment_variable_symbol_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 9999999999
  no cycle;

comment on sequence public.payment_variable_symbol_seq is
  'Monotónní zdroj variabilního symbolu platebního pokusu (1–10 číslic). nextval je striktně rostoucí a souběhu-bezpečný → zaručená unikátnost VS napříč payments (Property 3).';

-- RPC obal nad `nextval` — Supabase JS klient neumí volat `nextval` přímo, proto
-- jej zpřístupníme přes funkci volatelnou service role. Volá ji výhradně
-- server-side service role (Checkout, Billing_Engine).
create or replace function public.next_payment_variable_symbol()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select nextval('public.payment_variable_symbol_seq');
$$;

comment on function public.next_payment_variable_symbol() is
  'Vrátí další hodnotu monotónní sekvence pro variabilní symbol platby (nextval). Striktně rostoucí, unikátní i při souběhu. Volá ji výhradně server-side service role.';

revoke all on function public.next_payment_variable_symbol() from public;
grant execute on function public.next_payment_variable_symbol() to service_role;
