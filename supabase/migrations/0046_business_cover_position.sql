-- ---------------------------------------------------------------------------
-- 0046 — Pozice cover obrázku (focal point pro výřez na veřejném profilu)
-- ---------------------------------------------------------------------------
-- Svislá pozice (object-position Y) v procentech 0–100. 50 = na střed.
-- Umožní majiteli umístit fotku na výšku tak, aby v širokém hero pásu byla
-- vidět ta správná část.
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column if not exists cover_position smallint not null default 50
    check (cover_position between 0 and 100);

comment on column public.businesses.cover_position is
  'Svislá pozice cover obrázku (object-position Y) v procentech 0–100; 50 = střed.';
