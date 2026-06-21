// Feature: admin-system-tools, Property 12: Cooldown testovacího e-mailu
//
// Property 12 ověřuje čistou funkci `computeCooldownState` (R22.4):
// odeslání je povoleno právě tehdy, když nikdy neodesláno (`lastSentAt === null`)
// nebo když od posledního odeslání uplynul alespoň cooldown. V zakázaném případě
// musí být `remainingSeconds === Math.ceil(cooldown - elapsed)` a v rozsahu (0, cooldown].

import { describe, it } from 'vitest';
import fc from 'fast-check';

import { computeCooldownState } from '../email-cooldown';

describe('email-cooldown — Property 12: Cooldown testovacího e-mailu', () => {
  it('allowed ⟺ (nikdy odesláno | uplynulý čas ≥ cooldown); jinak kladné remainingSeconds v (0, cooldown]', () => {
    fc.assert(
      fc.property(
        // `now` v rozumném rozsahu (kalendářní data, ne extrémy); nikdy Invalid Date.
        fc.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2100-01-01T00:00:00.000Z'), noInvalidDate: true }),
        // Posun posledního odeslání do minulosti: 0 .. 5 minut před `now`.
        // Drží elapsed ≥ 0, takže remainingSeconds zůstává v (0, cooldown].
        fc.integer({ min: 0, max: 300_000 }),
        // Zda bylo vůbec odesláno (pokrývá větev `lastSentAt === null`).
        fc.boolean(),
        // Kladná délka cooldownu v sekundách (1 .. 5 minut) — překryv s posunem
        // zajišťuje pokrytí povolené i zakázané větve.
        fc.integer({ min: 1, max: 300 }),
        (now, offsetMs, neverSent, cooldownSeconds) => {
          const lastSentAt = neverSent
            ? null
            : new Date(now.getTime() - offsetMs).toISOString();

          const state = computeCooldownState(lastSentAt, now, cooldownSeconds);

          // Uplynulý čas spočítaný stejně jako ve funkci (kvůli přesné shodě).
          const elapsedSeconds =
            lastSentAt === null
              ? Number.POSITIVE_INFINITY
              : (now.getTime() - new Date(lastSentAt).getTime()) / 1000;

          const shouldBeAllowed =
            lastSentAt === null || elapsedSeconds >= cooldownSeconds;

          if (shouldBeAllowed) {
            // Povoleno: stav je { allowed: true }.
            if (state.allowed !== true) {
              return false;
            }
            return true;
          }

          // Zakázáno: kladné remainingSeconds = ceil(cooldown - elapsed) v (0, cooldown].
          if (state.allowed !== false) {
            return false;
          }
          const expectedRemaining = Math.ceil(cooldownSeconds - elapsedSeconds);
          return (
            state.remainingSeconds === expectedRemaining &&
            state.remainingSeconds > 0 &&
            state.remainingSeconds <= cooldownSeconds
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
