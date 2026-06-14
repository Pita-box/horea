-- Migrace 0023: atomická GDPR anonymizace klienta (SECURITY DEFINER)
-- (feature reservation-management — Client_Anonymizer, R16).
--
-- Smazání klienta a anonymizace jeho rezervací MUSÍ proběhnout v JEDINÉ DB
-- transakci (R16.2): nikdy nesmí nastat stav, kdy je klient smazán, ale rezervace
-- stále nesou jeho kontaktní údaje (nebo naopak). plpgsql funkce běží celá v jedné
-- transakci RPC volání, takže buď proběhne všechno, nebo nic.
--
-- Anonymizace se týká POUZE kontaktních údajů (client_name → 'Smazaný klient',
-- client_phone i client_email → NULL). Slot rezervace (service_id, starts_at,
-- ends_at, status, attendance) zůstává nezměněn, aby figuroval v historii
-- obsazenosti (R16.3). Funkce povolí akci i tehdy, když klient nemá žádnou
-- odpovídající rezervaci — smaže se jen řádek klienta (R16.4) a vrátí se 0.
--
-- Funkci volá VÝHRADNĚ server-side service role (Client_Anonymizer), proto
-- revoke from public + grant execute to service_role. Ownership (že klient patří
-- podniku přihlášeného majitele) ověřuje TS vrstva odvozením business_id z
-- owner_user_id a předáním do p_business_id; funkce navíc filtruje výhradně na
-- p_business_id.

-- =============================================================================
-- Pomocná normalizace telefonu pro POROVNÁNÍ (konzistentní s normalizePhone v TS)
-- =============================================================================
--
-- Odstraní mezery, pomlčky a závorky a poté volitelný úvodní '+'. Díky tomu se
-- '+420 777 888 999', '420777888999' i '(420) 777-888-999' napárují na téhož
-- klienta (R15.2). Telefon zůstává v DB v původním (nenormalizovaném) tvaru —
-- normalizace slouží jen pro shodu při párování.
create or replace function public.normalize_phone_match(p_phone text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
           regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g'),
           '^\+',
           ''
         );
$$;

comment on function public.normalize_phone_match(text) is
  'Normalizuje telefon pro párování (strip mezer/pomlček/závorek + úvodní +), konzistentně s normalizePhone v TS (R15.2). Vrací prázdný řetězec pro NULL/prázdný vstup.';

-- =============================================================================
-- anonymize_client — atomická anonymizace rezervací + smazání klienta (R16)
-- =============================================================================

create or replace function public.anonymize_client(
  p_business_id uuid,
  p_client_id uuid
)
returns table (
  anonymized_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_email text;
  v_norm_phone text;
  v_norm_email text;
  v_count integer := 0;
begin
  -- (1) Načti telefon + e-mail klienta výhradně v rámci business_id (R16.2 a).
  select c.phone, c.email
    into v_phone, v_email
  from public.clients c
  where c.id = p_client_id
    and c.business_id = p_business_id;

  if not found then
    -- Klient neexistuje nebo nepatří podniku — nic neanonymizujeme ani nemažeme.
    return query select 0;
    return;
  end if;

  v_norm_phone := public.normalize_phone_match(v_phone);
  v_norm_email := lower(coalesce(v_email, ''));

  -- (a) UPDATE matchujících rezervací podniku: shoda normalizovaného (neprázdného)
  --     telefonu NEBO case-insensitive (neprázdného) e-mailu (R16.2 a/b).
  --     Zachová service_id, starts_at, ends_at, status, attendance (R16.3).
  with anonymized as (
    update public.reservations r
    set client_name = 'Smazaný klient',
        client_phone = null,
        client_email = null,
        updated_at = now()
    where r.business_id = p_business_id
      and (
        (v_norm_phone <> '' and public.normalize_phone_match(r.client_phone) = v_norm_phone)
        or
        (v_norm_email <> '' and lower(coalesce(r.client_email, '')) = v_norm_email)
      )
    returning 1
  )
  select count(*) into v_count from anonymized;

  -- (b) Hard delete řádku klienta (R16.2 c).
  delete from public.clients
  where id = p_client_id
    and business_id = p_business_id;

  -- Vrať počet anonymizovaných rezervací (povoleno i 0 — R16.4).
  return query select v_count;
end;
$$;

comment on function public.anonymize_client(uuid, uuid) is
  'Atomicky anonymizuje rezervace klienta (client_name = ''Smazaný klient'', client_phone/client_email = NULL; slot beze změny — R16.3) a hard delete řádku klienta, vše v jedné transakci (R16.2). Povolí i 0 matchujících rezervací (R16.4). Vrací počet anonymizovaných rezervací. Volá ji výhradně server-side service role.';

revoke all on function public.anonymize_client(uuid, uuid) from public;
grant execute on function public.anonymize_client(uuid, uuid) to service_role;
