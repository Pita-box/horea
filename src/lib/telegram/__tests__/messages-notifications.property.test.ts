// Feature: telegram-operator-notifications, Property 11: Notifikační zprávy obsahují požadovaná pole
//
// Property 11 ověřuje, že notifikační buildery vkládají do textu zprávy všechna
// požadovaná pole:
//   - `buildBusinessCreatedMessage` obsahuje název podniku a okamžik vzniku
//     formátovaný přes `formatPragueDateTime`.
//   - `buildPaymentConfirmedMessage` obsahuje název podniku, český label tarifu
//     (Start / Pokročilý / Max) a částku formátovanou přes `formatCzk`.
//
// Validates: Requirements 3.2, 3.3, 4.2, 4.3

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import {
  buildBusinessCreatedMessage,
  buildPaymentConfirmedMessage,
  formatCzk,
  formatPragueDateTime,
} from '../messages';

/** Platné hodnoty tarifu (DB enum `subscription_plan`). */
const VALID_PLANS: ReadonlyArray<SubscriptionPlan> = ['start', 'pokrocily', 'max'];

/** Očekávané české labely tarifů (sladěno s `PLAN_LABEL` v `messages.ts`). */
const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

/** Generátor neprázdného názvu podniku. */
const businessNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0);

describe('Property 11: Notifikační zprávy obsahují požadovaná pole', () => {
  it('buildBusinessCreatedMessage obsahuje název podniku a okamžik vzniku (R3.2, R3.3)', () => {
    fc.assert(
      fc.property(businessNameArb, fc.date(), (businessName, createdAt) => {
        const message = buildBusinessCreatedMessage({ businessName, createdAt });

        // R3.3: zpráva obsahuje název podniku.
        expect(message).toContain(businessName);

        // R3.2: zpráva obsahuje okamžik vzniku formátovaný v pásmu Europe/Prague.
        expect(message).toContain(formatPragueDateTime(createdAt));
      }),
      { numRuns: 100 },
    );
  });

  it('buildPaymentConfirmedMessage obsahuje název, label tarifu a částku (R4.2, R4.3)', () => {
    fc.assert(
      fc.property(
        businessNameArb,
        fc.constantFrom(...VALID_PLANS),
        fc.nat(),
        (businessName, plan, amountCzk) => {
          const message = buildPaymentConfirmedMessage({ businessName, plan, amountCzk });

          // R4.2: zpráva obsahuje název podniku.
          expect(message).toContain(businessName);

          // R4.3: zpráva obsahuje český label zvoleného tarifu.
          expect(message).toContain(PLAN_LABEL[plan]);

          // R4.3: zpráva obsahuje částku formátovanou přes `formatCzk`.
          expect(message).toContain(formatCzk(amountCzk));
        },
      ),
      { numRuns: 100 },
    );
  });
});
