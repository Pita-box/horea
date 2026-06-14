-- ---------------------------------------------------------------------------
-- 0044 — Avatar/cover obrázky podniku (sloupec cover_url + Storage bucket)
-- ---------------------------------------------------------------------------
-- Avatar zůstává v businesses.logo_url. Přidáváme cover_url pro hero obrázek
-- veřejného profilu. Soubory žijí v public Storage bucketu `business-media`
-- (cesta {business_id}/logo, {business_id}/cover). Nahrávání běží výhradně
-- server-side přes service-role (ověří vlastnictví podniku), takže write RLS
-- na storage.objects není potřeba; čtení je veřejné (public bucket → public URL).
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column if not exists cover_url text;

comment on column public.businesses.cover_url is
  'Veřejný URL cover/hero obrázku profilu (Storage bucket business-media). NULL → dekorativní gradient.';

-- Public bucket s limitem 5 MB a povolenými obrázkovými typy. Idempotentní.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-media',
  'business-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
