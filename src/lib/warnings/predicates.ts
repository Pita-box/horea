import { JEDEN_MESIC_SECONDS } from '@/lib/subscription/state-machine';
import type { SubscriptionWarningKind } from '@/lib/email/templates/subscription-warning';

/**
 * Predikáty Warning_Cronu — kdy odeslat varovný e-mail před přechodem stavu
 * předplatného (R6.10, R6.11).
 *
 * Celá neplacená epizoda je kotvena na `first_failed_charge_at` (Prvni_Selhani).
 * Přechody jsou deterministické funkce uplynulého času od kotvy:
 *   - `grace_period` → `expired` nastává v den 30 (= Jeden_Mesic),
 *   - `expired` → `deleted_data` nastává v den 90 (= 3× Jeden_Mesic).
 *
 * Varování se posílá 7 dní PŘED přechodem, tedy:
 *   - den 23 od kotvy → varování před `grace_period` → `expired` (R6.10),
 *   - den 83 od kotvy → varování před `expired` → `deleted_data` (R6.11).
 *
 * Cron běží jednou denně, proto se varování posílá v rámci jednodenního okna
 * `[den N, den N+1)` — tj. uplynulý čas od kotvy je v intervalu daného dne.
 * Tím každé varování dorazí přesně jednou (předpoklad: jeden běh cronu za den).
 * Funkce jsou čisté a deterministické (závisí jen na kotvě a `now`).
 */

/** Počet dní výstrahy předem (7 dní před přechodem). */
const WARNING_LEAD_DAYS = 7;

/** Délka jednoho dne v sekundách. */
const ONE_DAY_SECONDS = 86_400;

/** Den od kotvy pro varování `grace_period` → `expired`: 30 − 7 = 23 (R6.10). */
export const GRACE_TO_EXPIRED_WARNING_DAY = JEDEN_MESIC_SECONDS / ONE_DAY_SECONDS - WARNING_LEAD_DAYS;

/** Den od kotvy pro varování `expired` → `deleted_data`: 90 − 7 = 83 (R6.11). */
export const EXPIRED_TO_DELETED_WARNING_DAY =
  (3 * JEDEN_MESIC_SECONDS) / ONE_DAY_SECONDS - WARNING_LEAD_DAYS;

function toMillis(value: Date | string): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro výpočet varování předplatného: "${String(value)}".`);
  }
  return ms;
}

/** `true`, pokud uplynulý čas od kotvy padá do jednodenního okna `[den, den+1)`. */
function isWithinDayWindow(
  firstFailedChargeAt: Date | string,
  now: Date | string,
  day: number,
): boolean {
  const elapsedSeconds = (toMillis(now) - toMillis(firstFailedChargeAt)) / 1000;
  const windowStart = day * ONE_DAY_SECONDS;
  const windowEnd = windowStart + ONE_DAY_SECONDS;
  return elapsedSeconds >= windowStart && elapsedSeconds < windowEnd;
}

/**
 * Vrátí druh varování, které se má odeslat v daný okamžik, nebo `null`, pokud
 * žádné varování dnes nepřipadá v úvahu.
 *
 * - den 23 od kotvy ⇒ `grace_to_expired` (R6.10),
 * - den 83 od kotvy ⇒ `expired_to_deleted` (R6.11),
 * - jinak ⇒ `null`.
 *
 * @param firstFailedChargeAt Kotva neplacené epizody (`null` ⇒ žádné varování).
 * @param now Aktuální okamžik běhu cronu.
 */
export function warningKindFor(
  firstFailedChargeAt: Date | string | null,
  now: Date | string,
): SubscriptionWarningKind | null {
  if (firstFailedChargeAt === null) {
    return null;
  }

  if (isWithinDayWindow(firstFailedChargeAt, now, GRACE_TO_EXPIRED_WARNING_DAY)) {
    return 'grace_to_expired';
  }

  if (isWithinDayWindow(firstFailedChargeAt, now, EXPIRED_TO_DELETED_WARNING_DAY)) {
    return 'expired_to_deleted';
  }

  return null;
}
