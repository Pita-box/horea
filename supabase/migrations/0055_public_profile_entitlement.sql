-- Migrace 0055: vynucení entitlementu `public_profile` v definici Published_Business
-- (feature plan-features / admin-dashboard).
--
-- PROBLÉM: Matice `plan_features` (admin /admin/plans) umožňuje vypnout funkci
-- „Veřejný rezervační profil" (`public_profile`) pro daný tarif, ale dosud se to
-- nikde nevynucovalo — veřejná stránka podniku zůstala dostupná. Vynucení bylo
-- v katalogu funkcí označeno jako „v budoucnu" a reálně se gateoval jen
-- `client_search`.
--
-- ŘEŠENÍ: Rozšiřujeme centrální funkci `is_business_published` (migrace 0013),
-- která je JEDINÝM zdrojem pravdy pro „Published_Business" — používá ji jak
-- detekční RPC `get_public_business_state`, tak anon RLS policies na
-- businesses/services/opening_hours. Tím se entitlement projeví všude najednou
-- (veřejná stránka, čtení dat i výpočet slotů) bez změny aplikačního kódu a bez
-- ztráty ISR (anon cesta zůstává).
--
-- SÉMANTIKA plan_features: chybějící řádek = funkce povolena (default). Funkce
-- je tedy zakázaná jen tehdy, když existuje řádek (plan, 'public_profile',
-- enabled = false). Předplatné bez tarifu (`plan IS NULL`, např. comp účet) se
-- nKontroluje — entitlement se neaplikuje (nemá tarif, na který by se vázal).
--
-- SECURITY DEFINER: funkce běží s právy vlastníka, takže čte i `plan_features`
-- bez nutnosti grantu pro anon.

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
      and (
        s.plan is null
        or not exists (
          select 1
          from public.plan_features pf
          where pf.plan = s.plan
            and pf.feature_key = 'public_profile'
            and pf.enabled = false
        )
      )
  );
$$;

comment on function public.is_business_published(uuid) is
  'Vrací true, když je business Published_Business: is_published = true, má subscription se status IN (active, grace_period) A jeho tarif má povolenou funkci public_profile (matice plan_features; chybějící řádek = povoleno, plan IS NULL = neaplikuje se). Centralizuje definici Published_Business pro RLS policies i get_public_business_state bez přístupu anon k subscriptions/plan_features. (Migrace 0013 + 0055.)';
