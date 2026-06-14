import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { formatInvoiceNumber } from '@/lib/invoices/invoice-number';

/**
 * Feature: subscription-payments, Property 5: Monotonie a bezmezerovost
 * číslování faktur.
 *
 * Skutečný DB zámek řádku `invoice_counter` per rok žije v plpgsql RPC
 * `allocate_invoice_number` (migrace 0028) a ověřuje ho integrační test 5.4.
 * Tento property test ověřuje KONTRAKT té operace nad in-memory modelem, který
 * věrně zrcadlí SQL: přidělení = (přečti poslední pro rok, inkrementuj o 1,
 * zapiš) serializované zámkem. Pro LIBOVOLNOU posloupnost přidělení — včetně
 * prokládání více let (model souběhu, který zámek stejně serializuje) — platí,
 * že přidělená čísla jsou v rámci kalendářního roku striktně rostoucí, unikátní
 * a bezmezerová (každé další přesně o 1 vyšší). Formát `YYYY-NNNN` ověřuje
 * sdílená čistá funkce `formatInvoiceNumber`.
 *
 * Validates: Requirements 7.2, 7.3, 7.4
 */

const NUM_RUNS = 200;

/**
 * Model atomického přidělovače čísel faktur (kontrakt RPC `allocate_invoice_number`):
 * counter per kalendářní rok, přidělení vrací inkrementovanou hodnotu pod
 * (modelovaným) zámkem. Jelikož zámek serializuje souběžná přidělení, je pořadí
 * volání zároveň modelem prokládaného souběhu.
 */
class InvoiceCounterModel {
  private readonly counters = new Map<number, number>();

  allocate(year: number): number {
    const next = (this.counters.get(year) ?? 0) + 1;
    this.counters.set(year, next);
    return next;
  }
}

/** Roky včetně přechodu mezi lety (řada se na začátku roku restartuje). */
const yearArb = fc.constantFrom(2023, 2024, 2025, 2026);

describe('Property 5: monotonie a bezmezerovost číslování faktur', () => {
  it('přidělení jsou per rok striktně rostoucí, unikátní a gap-free (i při prokládání let)', () => {
    fc.assert(
      fc.property(fc.array(yearArb, { minLength: 1, maxLength: 100 }), (years) => {
        const model = new InvoiceCounterModel();
        const perYearSequences = new Map<number, number[]>();
        const globalInvoiceNumbers: string[] = [];

        for (const year of years) {
          const sequence = model.allocate(year);
          const list = perYearSequences.get(year) ?? [];
          list.push(sequence);
          perYearSequences.set(year, list);
          globalInvoiceNumbers.push(formatInvoiceNumber(year, sequence));
        }

        for (const [year, sequences] of perYearSequences) {
          for (let i = 0; i < sequences.length; i += 1) {
            // Bezmezerové a striktně rostoucí: i-té přidělení je přesně i+1.
            expect(sequences[i]).toBe(i + 1);
            if (i > 0) {
              expect(sequences[i]).toBe(sequences[i - 1] + 1);
            }
          }
          // Unikátnost v rámci roku.
          expect(new Set(sequences).size).toBe(sequences.length);

          // Formát YYYY-NNNN (NNNN doplněno nulami na min. 4 číslice).
          const last = sequences[sequences.length - 1];
          expect(formatInvoiceNumber(year, last)).toMatch(/^\d{4}-\d{4,}$/);
          expect(formatInvoiceNumber(year, 1)).toBe(`${year}-0001`);
        }

        // Číslo faktury je unikátní napříč celou platformou (rok + sekvence).
        expect(new Set(globalInvoiceNumbers).size).toBe(globalInvoiceNumbers.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
