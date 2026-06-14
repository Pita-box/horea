-- ---------------------------------------------------------------------------
-- 0045 — Odkazy na sociální sítě podniku
-- ---------------------------------------------------------------------------
-- Volitelné odkazy zobrazené jako ikony na veřejném profilu (jen vyplněné).
-- Podporované sítě: Facebook, Instagram, YouTube, Google (místo / profil).
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists youtube_url text,
  add column if not exists google_url text;

comment on column public.businesses.facebook_url is 'Volitelný odkaz na Facebook profil/stránku.';
comment on column public.businesses.instagram_url is 'Volitelný odkaz na Instagram profil.';
comment on column public.businesses.youtube_url is 'Volitelný odkaz na YouTube kanál.';
comment on column public.businesses.google_url is 'Volitelný odkaz na Google místo / profil (Google Business / Maps).';
