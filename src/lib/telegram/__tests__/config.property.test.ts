import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { resolveTelegramConfig } from '../config';

const NUM_RUNS = 100;

// Generátor jedné proměnné prostředí: pokrývá nepřítomnost (undefined),
// prázdný string i neprázdné hodnoty (včetně whitespace, který je truthy).
const envValue: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.string(),
  fc.constant('   '),
);

describe('resolveTelegramConfig properties', () => {
  // Feature: telegram-operator-notifications, Property 1: Feature_Enabled právě když je konfigurace úplná
  // Validates: Requirements 1.1, 1.2
  it('Feature: telegram-operator-notifications, Property 1: Feature_Enabled právě když je konfigurace úplná', () => {
    fc.assert(
      fc.property(envValue, envValue, (botToken, operatorChatId) => {
        const env: Record<string, string | undefined> = {
          TELEGRAM_BOT_TOKEN: botToken,
          TELEGRAM_OPERATOR_CHAT_ID: operatorChatId,
        };

        const result = resolveTelegramConfig(env);

        // Implementace posuzuje prázdnost přes truthiness (prázdný string = chybějící).
        const bothPresent = Boolean(botToken) && Boolean(operatorChatId);

        if (bothPresent) {
          // Oba neprázdné ⟹ neprázdná konfigurace s odpovídajícími hodnotami.
          expect(result).not.toBeNull();
          expect(result).toEqual({
            botToken,
            operatorChatId,
          });
        } else {
          // Jinak (chybí nebo je prázdný aspoň jeden) ⟹ null.
          expect(result).toBeNull();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
