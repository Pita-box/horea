-- Migrace 0013: zpřísnění veřejného (anon) čtení na Published_Business
--
-- Kontext: migrace 0008 povolila anonovi SELECT na businesses/services/opening_hours
-- pouze podle is_published = true, BEZ kontroly stavu předplatného. Definice
-- Published_Business (viz public-business-page/requirements.md) ale vyžaduje OBĚ
-- podmínky současně:
--   1) business.is_published = true
--   2) existuje subscription daného podniku se status IN ('active', 'grace_period')
--
-- Tato migrace centralizuje logiku Published_Business do SECURITY DEFINER funkce
-- a přepisuje anon read policies tak, aby tuto funkci používaly. Anon NEDOSTÁVÁ
-- žádný přímý přístup k tabulce subscriptions — kontrola stavu předplatného běží
-- uvnitř SECURITY DEFINER funkce (s právy jejího vlastníka), takže citlivá data
-- o předplatném nikdy neopouštějí funkci.

-- 1) Helper funkce: je daný business Published_Business?
--    SECURITY DEFINER => běží s právy vlastníka funkce, proto smí číst subscriptions
--    i když volající (anon) na subscriptions žádný grant nemá.
create or replace function public.is_business_published(b_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    join public.subscriptions s on s.business_id = b.id
    where b.id = b_id
      and b.is_published = true
      and s.status in ('active', 'grace_period')
  );
$$;

comment on function public.is_business_published(uuid) is
  'Vrací true, když je business Published_Business: is_published = true a má subscription se status IN (active, grace_period). Centralizuje definici Published_Business pro RLS policies bez nutnosti dávat anonovi přístup k subscriptions.';

-- Policy funkci volá v kontextu role anon, proto explicitní execute grant.
grant execute on function public.is_business_published(uuid) to anon;

-- 2) Zpřísnění anon read policies z migrace 0008: nahradit pouhé is_published = true
--    voláním public.is_business_published(...). DROP + CREATE, protože USING výraz
--    existující policy nelze změnit ALTER příkazem.
drop policy if exists public_read_published on public.businesses;
create policy public_read_published on public.businesses
  for select
  to anon
  using (public.is_business_published(id));

drop policy if exists public_read_published_services on public.services;
create policy public_read_published_services on public.services
  for select
  to anon
  using (public.is_business_published(business_id));

drop policy if exists public_read_published_opening_hours on public.opening_hours;
create policy public_read_published_opening_hours on public.opening_hours
  for select
  to anon
  using (public.is_business_published(business_id));

-- 3) Detekce stavu publikováno / nepublikováno / 404 BEZ úniku citlivých polí.
--
-- Proč SECURITY DEFINER funkce a ne čistá RLS policy: RLS policy umí omezit, KTERÉ
-- ŘÁDKY role uvidí, ale NEUMÍ omezit, KTERÉ SLOUPCE se vrátí. Pro stav „nepublikováno"
-- (R2.2) potřebuje veřejná stránka zobrazit pouze NÁZEV nepublikovaného podniku —
-- nikoli jeho popis, kontakty (phone, contact_email, address) ani logo. Kdybychom
-- anonovi povolili řádkový SELECT na nepublikované businesses, unikla by všechna
-- sloupcová data. SECURITY DEFINER funkce s PEVNÝM seznamem bezpečných sloupců je
-- standardní vzor, který tento únik vylučuje: vrací jen id, slug, name, is_published
-- + spočítaný published, nic víc.
create or replace function public.get_public_business_state(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  is_published boolean,
  published boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.slug,
    b.name,
    b.is_published,
    public.is_business_published(b.id) as published
  from public.businesses b
  where b.slug = p_slug
  limit 1;
$$;

comment on function public.get_public_business_state(text) is
  'Pro libovolný slug vrátí max. 1 řádek s bezpečnými poli (id, slug, name, is_published) a spočítaným published. Umožňuje rozlišit 404 (žádný řádek) od nepublikovaného profilu (řádek s published = false) bez úniku popisu/kontaktů/loga nepublikovaných podniků.';

-- Funkci volá veřejná stránka pod anon klíčem.
grant execute on function public.get_public_business_state(text) to anon;
