-- Migrace 0028: atomické přidělení pořadového čísla faktury per kalendářní rok
-- (feature `subscription-payments`, Faktura_Generator, task 5.1).
--
-- České účetnictví vyžaduje souvislou (gap-free) striktně rostoucí číselnou řadu
-- daňových dokladů v rámci kalendářního roku. `SELECT ... FOR UPDATE` nejde přes
-- Supabase JS klient, proto přidělení žije v plpgsql funkci (stejný vzor jako
-- migrace 0021). Funkce běží v jediné transakci a pod zámkem řádku roku
-- serializuje souběžná přidělení → striktně rostoucí, unikátní, bez mezer
-- (design.md, sekce *Číslování faktur*, Property 5).
--
-- Číslo se přiděluje až při přechodu Payment na `paid`, takže neúspěšné pokusy
-- nespotřebovávají čísla a nevznikají mezery.
-- _Requirements: 7.2, 7.3, 7.4_

create or replace function public.allocate_invoice_number(p_year integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last integer;
  v_next integer;
begin
  -- (1) Zajisti existenci řádku pro daný rok (idempotentní; bez přepisu
  --     existujícího last_number při souběhu díky DO NOTHING).
  insert into public.invoice_counter (year, last_number)
  values (p_year, 0)
  on conflict (year) do nothing;

  -- (2) Zámek řádku roku do konce transakce — serializuje souběžné přidělení,
  --     takže ani při paralelním dokončení více plateb nevznikne duplicita
  --     ani mezera (R7.3).
  select last_number
    into v_last
  from public.invoice_counter
  where year = p_year
  for update;

  -- (3) Atomický inkrement o 1 a zápis pod zámkem (R7.2, R7.4).
  v_next := v_last + 1;

  update public.invoice_counter
  set last_number = v_next
  where year = p_year;

  return v_next;
end;
$$;

comment on function public.allocate_invoice_number(integer) is
  'Atomicky přidělí další pořadové číslo faktury pro daný kalendářní rok pod zámkem řádku invoice_counter (SELECT ... FOR UPDATE). Upsertne řádek roku, inkrementuje last_number o 1 a vrátí nové číslo. Striktně rostoucí, unikátní, gap-free v rámci roku (Property 5). Volá ji výhradně server-side service role.';

revoke all on function public.allocate_invoice_number(integer) from public;
grant execute on function public.allocate_invoice_number(integer) to service_role;
