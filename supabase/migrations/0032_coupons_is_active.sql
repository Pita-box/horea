-- Migrace 0032: příznak aktivace kupónu `coupons.is_active`
-- (feature `admin-dashboard`, CouponManager, task 1.3).
--
-- Deaktivace kupónu administrátorem (R7.6) nastaví `is_active = false`, čímž
-- kupón přestane být uplatnitelný při checkoutu ve feature `subscription-payments`,
-- aniž by se mazal záznam — historie použití (`used_count`) zůstává zachována.
-- Default `true`: stávající i nové kupóny jsou ve výchozím stavu aktivní.
-- _Requirements: 7.6_

alter table public.coupons
  add column is_active boolean not null default true;

comment on column public.coupons.is_active is
  'Zda lze kupón uplatnit při checkoutu. Deaktivace (R7.6) nastaví false bez mazání záznamu; checkout v subscription-payments musí tento příznak respektovat.';
