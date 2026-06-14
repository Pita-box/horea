-- Migrace 0017: rozšíření tabulky `reservations` o důvod změny stavu a docházku.
--
-- Aditivní migrace pro feature `reservation-management` (dashboard majitele).
-- Přidává DVA sloupce; nemění ani nemaže žádná existující data. Stávající
-- rezervace dostanou `status_reason = NULL` a `attendance = NULL`.

-- 1) status_reason — JEDEN sdílený textový důvod pro odmítnutí (`rejected`)
--    NEBO zrušení (`cancelled`). Záměrně jeden sloupec, ne dva: rezervace je
--    v každém okamžiku právě v jednom stavu a přechody jsou disjunktní
--    (`rejected` jde jen z `pending`, `cancelled` jen z `approved`), takže
--    rezervace je vždy buď odmítnutá, NEBO zrušená — nikdy obojí. Sémantiku
--    důvodu určuje aktuální `status`.
--
--    Limit délky (≤ 500 znaků) se NEVYNUCUJE DB constraintem — validuje se
--    APLIKAČNĚ (server actions Reservation_Rejecter / Reservation_Canceller),
--    dle designu. Nullable: většina rezervací žádný důvod nemá.
alter table public.reservations
  add column if not exists status_reason text;

comment on column public.reservations.status_reason is
  'Volitelný text důvodu pro stav rejected NEBO cancelled (jeden sdílený sloupec — rezervace je vždy jen jedno z toho). Limit ≤ 500 znaků se vynucuje aplikačně, ne DB constraintem.';

-- 2) attendance — docházka klienta, ORTOGONÁLNÍ vůči `status`. Není součástí
--    Reservation_Status: mění se nezávisle (Attendance_Marker) a NIKDY neovlivní
--    `status` ani neodešle e-mail. Hodnota `null` = nevyhodnoceno (default).
create type public.attendance_status as enum (
  'attended',
  'no_show'
);

alter table public.reservations
  add column if not exists attendance public.attendance_status null default null;

comment on column public.reservations.attendance is
  'Docházka klienta, ortogonální vůči status: null = nevyhodnoceno, attended = dorazil, no_show = nedorazil. Nastavení docházky nemění status rezervace.';
