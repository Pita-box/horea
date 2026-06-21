// Feature: admin-system-tools, Property 8: Agregace stavu e-mailové fronty
//
// Property 8: summarizeOutbox(rows, now) korektně agreguje stav e-mailové fronty.
// Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  summarizeOutbox,
  type OutboxRowMeta,
} from '../outbox-status';

// Pevný rozsah dat, aby toISOString() vždy vracel platný ISO řetězec.
const MIN_DATE = new Date('2000-01-01T00:00:00.000Z');
const MAX_DATE = new Date('2100-01-01T00:00:00.000Z');

// Generátor jednoho data jako ISO řetězec.
const isoArb = fc
  .date({ min: MIN_DATE, max: MAX_DATE, noInvalidDate: true })
  .map((d) => d.toISOString());

// Generátor jednoho řádku outboxu (jen neidentifikující metadata).
const rowArb: fc.Arbitrary<OutboxRowMeta> = fc.record({
  status: fc.constantFrom('pending', 'sent', 'dead') as fc.Arbitrary<
    OutboxRowMeta['status']
  >,
  createdAt: isoArb,
  // nextAttemptAt může být null (typicky u sent/dead) i konkrétní čas.
  nextAttemptAt: fc.option(isoArb, { nil: null }),
});

describe('summarizeOutbox — Property 8: agregace stavu outboxu', () => {
  it('agreguje counts, oldestPendingAt a readyToRetry konzistentně se vstupem', () => {
    fc.assert(
      fc.property(
        fc.array(rowArb),
        fc.date({ min: MIN_DATE, max: MAX_DATE, noInvalidDate: true }),
        (rows, now) => {
          const result = summarizeOutbox(rows, now);

          // R17.1: součet counts == počet vstupních řádků.
          const sum =
            result.counts.pending + result.counts.sent + result.counts.dead;
          expect(sum).toBe(rows.length);

          // R17.1: counts odpovídá rozdělení podle stavu.
          const expectedPending = rows.filter((r) => r.status === 'pending')
            .length;
          const expectedSent = rows.filter((r) => r.status === 'sent').length;
          const expectedDead = rows.filter((r) => r.status === 'dead').length;
          expect(result.counts.pending).toBe(expectedPending);
          expect(result.counts.sent).toBe(expectedSent);
          expect(result.counts.dead).toBe(expectedDead);

          // R17.2 + R17.4: oldestPendingAt = nejmenší createdAt mezi pending,
          // jinak null pokud žádný pending.
          const pendingRows = rows.filter((r) => r.status === 'pending');
          if (pendingRows.length === 0) {
            expect(result.oldestPendingAt).toBeNull();
          } else {
            const minCreatedMs = Math.min(
              ...pendingRows.map((r) => new Date(r.createdAt).getTime()),
            );
            expect(result.oldestPendingAt).not.toBeNull();
            expect(new Date(result.oldestPendingAt as string).getTime()).toBe(
              minCreatedMs,
            );
          }

          // R17.3: readyToRetry = počet pending s nextAttemptAt <= now.
          const nowMs = now.getTime();
          const expectedReady = pendingRows.filter(
            (r) =>
              r.nextAttemptAt !== null &&
              new Date(r.nextAttemptAt).getTime() <= nowMs,
          ).length;
          expect(result.readyToRetry).toBe(expectedReady);

          // R17.5: výstupní typ neobsahuje žádné PII — jen číselné counts,
          // ISO řetězec / null a číslo. Ověříme tvar výstupu.
          expect(Object.keys(result).sort()).toEqual(
            ['counts', 'oldestPendingAt', 'readyToRetry'].sort(),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
