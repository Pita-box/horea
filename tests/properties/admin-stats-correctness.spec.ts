import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { partitionByStatus, sumPaidRevenueCzk } from '@/lib/admin/stats';

/**
 * Feature: admin-dashboard, Property 5: Správnost statistik.
 *
 * Dvě čisté funkce StatsAggregatoru nesou jádro správnosti přehledu:
 *
 *  (a) `sumPaidRevenueCzk` — tržby se rovnají součtu `amount_czk` právě těch
 *      plateb, které mají `status = paid` a spadají do zvoleného období (R2.5).
 *      Modeluje se zde DB kontrakt: z plného datasetu plateb se vyfiltruje
 *      množina, kterou by agregační SQL předalo funkci, a porovná se s nezávislým
 *      oracle počítaným jinou cestou (akumulace ve smyčce) — ne tautologie.
 *
 *  (b) `partitionByStatus` — rozpad počtu podniků dle stavu předplatného je
 *      **partition** reportovaných stavů (R2.4): každý podnik v reportovaném stavu
 *      (`free`/`active`/`grace_period`/`expired`) je započten právě jednou a
 *      součet kategorií se rovná počtu podniků v reportovaných stavech; stavy mimo
 *      report (`deleted_data`, `null`, neznámé) se nezapočítají.
 *
 * Generátor varíruje dataset plateb (stav, částka, příslušnost do období) i
 * stavy předplatných (včetně nereportovaných a `null`).
 *
 * Validates: Requirements 2.4, 2.5
 */

const NUM_RUNS = 200;

const PAYMENT_STATUSES = ['paid', 'pending', 'failed'] as const;
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

type GeneratedPayment = {
  status: PaymentStatus;
  amountCzk: number;
  inPeriod: boolean;
};

const paymentArb: fc.Arbitrary<GeneratedPayment> = fc.record({
  status: fc.constantFrom<PaymentStatus>(...PAYMENT_STATUSES),
  amountCzk: fc.integer({ min: 0, max: 100_000 }),
  inPeriod: fc.boolean(),
});

const SUBSCRIPTION_STATUSES = [
  'free',
  'active',
  'grace_period',
  'expired',
  'deleted_data',
  'unknown',
] as const;

const REPORTED_STATUSES = ['free', 'active', 'grace_period', 'expired'] as const;

const statusArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constantFrom<string>(...SUBSCRIPTION_STATUSES),
  fc.constant<string | null>(null),
);

describe('Property 5: správnost statistik', () => {
  it('(a) tržby = suma amount_czk plateb paid v období (nezávislý oracle)', () => {
    fc.assert(
      fc.property(fc.array(paymentArb, { maxLength: 60 }), (payments) => {
        // Kontrakt agregačního SQL: status = paid AND created_at v období.
        const filtered = payments
          .filter((p) => p.status === 'paid' && p.inPeriod)
          .map((p) => ({ amount_czk: p.amountCzk }));

        const result = sumPaidRevenueCzk(filtered);

        // Nezávislý oracle — akumulace ve smyčce, jiná cesta než reduce v impl.
        let oracle = 0;
        for (const p of payments) {
          if (p.status === 'paid' && p.inPeriod) {
            oracle += p.amountCzk;
          }
        }

        expect(result).toBe(oracle);
        // Žádná jiná množina plateb než paid-v-období nepřispívá: výsledek nikdy
        // nepřesáhne součet všech částek.
        const totalAll = payments.reduce((s, p) => s + p.amountCzk, 0);
        expect(result).toBeLessThanOrEqual(totalAll);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('(b) rozpad dle stavu je partition reportovaných podniků', () => {
    fc.assert(
      fc.property(fc.array(statusArb, { maxLength: 80 }), (statuses) => {
        const breakdown = partitionByStatus(statuses);

        // Každá kategorie odpovídá nezávislému počtu daného stavu (právě jednou).
        for (const status of REPORTED_STATUSES) {
          const expected = statuses.filter((s) => s === status).length;
          expect(breakdown[status]).toBe(expected);
        }

        const categorySum =
          breakdown.free + breakdown.active + breakdown.grace_period + breakdown.expired;

        // Součet kategorií = počet podniků v reportovaných stavech (partition).
        const reportedCount = statuses.filter(
          (s) => s !== null && (REPORTED_STATUSES as readonly string[]).includes(s),
        ).length;
        expect(categorySum).toBe(reportedCount);

        // Nereportované stavy (deleted_data/null/neznámé) se nezapočítají.
        expect(categorySum).toBeLessThanOrEqual(statuses.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
