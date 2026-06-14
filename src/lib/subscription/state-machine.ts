import type { SubscriptionStatus } from '@/lib/auth/free-user-guard';

/**
 * Stavový automat předplatného — výpočet stavu z časové kotvy.
 *
 * Celá neplacená epizoda se měří od jediné kotvy `first_failed_charge_at`
 * (v glosáři Prvni_Selhani). Cílový stav je proto deterministická čistá funkce
 * dvou hodnot: kotvy a aktuálního času. Cron tento výpočet pouze „zhmotňuje"
 * (perzistuje), nezavádí vlastní logiku časování. Viz design.md, sekce
 * *Stavový automat předplatného*, a Property 1.
 */

/** Délka jednoho předplatitelského období (Jeden_Mesic) — přesně 30 dní v sekundách. */
export const JEDEN_MESIC_SECONDS = 2_592_000;

/** Hranice grace period — 30 dní od kotvy (sekundy). */
export const GRACE_PERIOD_SECONDS = JEDEN_MESIC_SECONDS;

/** Hranice mazání dat — 90 dní od kotvy (sekundy). */
export const DELETED_DATA_SECONDS = 3 * JEDEN_MESIC_SECONDS;

/**
 * Stav odvozený z kotvy. Hodnota `free` do tohoto výpočtu nespadá — `free` je
 * stav před první platbou, nezávislý na neplacené epizodě, a řídí ho checkout.
 */
export type AnchoredSubscriptionStatus = Exclude<SubscriptionStatus, 'free'>;

function toMillis(value: Date | string): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro výpočet stavu předplatného: "${String(value)}".`);
  }
  return ms;
}

/**
 * Vypočte stav předplatného z kotvy Prvni_Selhani a aktuálního času.
 *
 * - kotva `null` ⇒ `active` (žádná neplacená epizoda probíhá),
 * - `0 ≤ Δ < 30 dní` ⇒ `grace_period`,
 * - `30 ≤ Δ < 90 dní` ⇒ `expired` (reaktivace možná úspěšnou platbou),
 * - `Δ ≥ 90 dní` ⇒ `deleted_data`,
 *
 * kde `Δ = now − first_failed_charge_at`. Hranice jsou počítány v sekundách jako
 * násobky délky Jeden_Mesic (30 dní = 2 592 000 s), aby byl výpočet deterministický.
 *
 * Degenerovaný případ `Δ < 0` (kotva v budoucnosti) je mapován na `grace_period`,
 * tj. nejranější stav neplacené epizody — profil zůstává publikovaný.
 *
 * @param firstFailedChargeAt Kotva neplacené epizody (`Date`, ISO řetězec, nebo `null`).
 * @param now Aktuální okamžik (`Date` nebo ISO řetězec).
 */
export function computeState(
  firstFailedChargeAt: Date | string | null,
  now: Date | string,
): AnchoredSubscriptionStatus {
  if (firstFailedChargeAt === null) {
    return 'active';
  }

  const deltaSeconds = (toMillis(now) - toMillis(firstFailedChargeAt)) / 1000;

  if (deltaSeconds < GRACE_PERIOD_SECONDS) {
    return 'grace_period';
  }

  if (deltaSeconds < DELETED_DATA_SECONDS) {
    return 'expired';
  }

  return 'deleted_data';
}
