import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  computeState,
  DELETED_DATA_SECONDS,
  GRACE_PERIOD_SECONDS,
  type AnchoredSubscriptionStatus,
} from '@/lib/subscription/state-machine';

/**
 * Feature: subscription-payments, Property 1: Validita stavového automatu a
 * deterministické anchored timeouty.
 *
 * `computeState(first_failed_charge_at, now)` je čistá funkce dvou hodnot —
 * časové kotvy Prvni_Selhani a aktuálního času. Cílový stav neplacené epizody
 * je proto plně určen rozdílem `Δ = now − first_failed_charge_at`:
 *
 *  - kotva `null`            ⇒ `active` (žádná neplacená epizoda),
 *  - `0 ≤ Δ < 30 dní`        ⇒ `grace_period`,
 *  - `30 ≤ Δ < 90 dní`       ⇒ `expired`,
 *  - `Δ ≥ 90 dní`            ⇒ `deleted_data`,
 *
 * kde hranice 30/90 dní jsou 2 592 000 s a 7 776 000 s (násobky Jeden_Mesic).
 * Generátor cíleně varíruje `Δ` kolem obou hranic (±1 s, přesná hodnota) a
 * varíruje i reprezentaci vstupů (`Date` vs. ISO řetězec), aby ověřil mapování
 * i determinismus (stejný vstup ⇒ stejný výstup). Skutečnou perzistenci
 * přechodů a `is_published` řeší `transitions.ts` (server-only DB) a integrační
 * testy; zde testujeme čistou rozhodovací funkci.
 *
 * Validates: Requirements 1.3, 1.6, 3.6, 4.1, 4.2, 4.3, 5.6, 6.3, 6.4, 6.5, 6.6, 6.7, 11.3
 */

const NUM_RUNS = 300;

/** Očekávaný stav z rozdílu v sekundách (oracle nezávislý na implementaci). */
function expectedStatus(deltaSeconds: number): AnchoredSubscriptionStatus {
  if (deltaSeconds < GRACE_PERIOD_SECONDS) {
    return 'grace_period';
  }
  if (deltaSeconds < DELETED_DATA_SECONDS) {
    return 'expired';
  }
  return 'deleted_data';
}

/**
 * Rozdíl `Δ` v sekundách (≥ 0) se silným zastoupením hodnot kolem hranic
 * 30 dní (2 592 000 s) a 90 dní (7 776 000 s): přesná hranice i ±1 s, plus
 * náhodné hodnoty v každém pásmu a daleko za hranicí.
 */
const deltaSecondsArb: fc.Arbitrary<number> = fc.oneof(
  // Přesné hranice a jejich těsné okolí.
  fc.constantFrom(
    0,
    1,
    GRACE_PERIOD_SECONDS - 1,
    GRACE_PERIOD_SECONDS,
    GRACE_PERIOD_SECONDS + 1,
    DELETED_DATA_SECONDS - 1,
    DELETED_DATA_SECONDS,
    DELETED_DATA_SECONDS + 1,
  ),
  // grace_period pásmo (0 .. 30 dní).
  fc.integer({ min: 0, max: GRACE_PERIOD_SECONDS - 1 }),
  // expired pásmo (30 .. 90 dní).
  fc.integer({ min: GRACE_PERIOD_SECONDS, max: DELETED_DATA_SECONDS - 1 }),
  // deleted_data pásmo (≥ 90 dní), včetně dalekých hodnot.
  fc.integer({ min: DELETED_DATA_SECONDS, max: DELETED_DATA_SECONDS + 5 * 365 * 24 * 3600 }),
);

/** Základní okamžik `now` (ms) v rozumném rozsahu kolem současnosti. */
const nowMsArb = fc.integer({
  min: Date.parse('2024-01-01T00:00:00.000Z'),
  max: Date.parse('2035-12-31T23:59:59.000Z'),
});

describe('Property 1: validita stavového automatu a anchored timeouty', () => {
  it('kotva null ⇒ active pro libovolné now', () => {
    fc.assert(
      fc.property(nowMsArb, fc.boolean(), (nowMs, asString) => {
        const now = asString ? new Date(nowMs).toISOString() : new Date(nowMs);
        expect(computeState(null, now)).toBe('active');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Δ určuje stav dle hranic 30/90 dní (vč. přesných hranic ±1 s)', () => {
    fc.assert(
      fc.property(nowMsArb, deltaSecondsArb, fc.boolean(), (nowMs, deltaSeconds, asString) => {
        const anchorMs = nowMs - deltaSeconds * 1000;
        const anchor = asString ? new Date(anchorMs).toISOString() : new Date(anchorMs);
        const now = asString ? new Date(nowMs).toISOString() : new Date(nowMs);

        const result = computeState(anchor, now);

        // Hlavní mapování: stav je čistá funkce Δ vůči hranicím.
        expect(result).toBe(expectedStatus(deltaSeconds));

        // Hraniční sémantika je inkluzivní zdola: přesně 30 dní ⇒ expired,
        // přesně 90 dní ⇒ deleted_data (ne ještě předchozí pásmo).
        if (deltaSeconds === GRACE_PERIOD_SECONDS) {
          expect(result).toBe('expired');
        }
        if (deltaSeconds === DELETED_DATA_SECONDS) {
          expect(result).toBe('deleted_data');
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('determinismus — stejná kotva a now vždy vrátí stejný stav', () => {
    fc.assert(
      fc.property(nowMsArb, deltaSecondsArb, (nowMs, deltaSeconds) => {
        const anchor = new Date(nowMs - deltaSeconds * 1000);
        const now = new Date(nowMs);
        expect(computeState(anchor, now)).toBe(computeState(anchor, now));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
