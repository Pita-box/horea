-- Migrace 0054: businesses.owner_user_id nullable + FK ON DELETE SET NULL
-- (feature admin-dashboard — vynucené smazání podniku, varianta „uvolnit e-mail,
-- zachovat anonymizovanou účetní historii").
--
-- PROČ: Admin „vynucené smazání podniku" má nově odstranit i účet vlastníka
-- (smazat řádek v auth.users), aby se uvolnil e-mail pro novou registraci.
-- Dosavadní FK řetězec ale vše kaskádově maže:
--   auth.users → public.users (ON DELETE CASCADE)
--             → public.businesses.owner_user_id (ON DELETE CASCADE)
--             → public.subscriptions / public.payments (ON DELETE CASCADE)
-- Smazání uživatele by tak zničilo i účetní historii (faktury, platby), kterou
-- musíme zachovat (R6.8 + zákonná archivace daňových dokladů v ČR).
--
-- ŘEŠENÍ: `businesses.owner_user_id` zesplatníme (nullable) a FK změníme na
-- ON DELETE SET NULL. Smazání uživatele pak podnik (= kotvu zachované historie)
-- jen ODPOJÍ (owner_user_id = NULL) místo aby ho smazalo. `subscriptions`/
-- `payments` na podnik dál odkazují a zůstávají zachované, jen anonymizované
-- (profil podniku je vyprázdněn už v `delete_business_tenant_data`, migrace 0030).
--
-- Unikátní constraint `businesses_owner_user_id_unique` zůstává — v Postgresu
-- je více NULL hodnot navzájem různých, takže více odpojených podniků nevadí.

alter table public.businesses
  alter column owner_user_id drop not null;

alter table public.businesses
  drop constraint businesses_owner_user_id_fkey;

alter table public.businesses
  add constraint businesses_owner_user_id_fkey
    foreign key (owner_user_id) references public.users(id) on delete set null;

comment on column public.businesses.owner_user_id is
  'Vlastník podniku (public.users.id). NULL = odpojený podnik po smazání účtu vlastníka (admin vynucené smazání) — řádek slouží jen jako kotva zachované anonymizované účetní historie (subscriptions/payments). FK ON DELETE SET NULL (migrace 0054).';
