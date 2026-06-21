import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { isOperatorChat } from '../webhook';

const NUM_RUNS = 100;

describe('isOperatorChat properties', () => {
  // Feature: telegram-operator-notifications, Property 8: Autorizace chatu odesílatele
  // Validates: Requirements 8.1, 8.2
  it('Feature: telegram-operator-notifications, Property 8: Autorizace chatu odesílatele', () => {
    fc.assert(
      fc.property(
        // chatId generujeme jako number i string, abychom pokryli obě reprezentace.
        fc.oneof(fc.integer(), fc.string()),
        // Druhý, nezávisle generovaný kandidát na operatorChatId (může se shodovat i lišit).
        fc.string(),
        (chatId, otherChatId) => {
          // (a) Když operatorChatId odpovídá řetězcové reprezentaci chatId → true.
          const matching = String(chatId);
          expect(isOperatorChat(chatId, matching)).toBe(true);

          // (b) Když se operatorChatId liší od String(chatId) → false.
          // Jinak (náhodná shoda) musí stále platit true.
          if (otherChatId === matching) {
            expect(isOperatorChat(chatId, otherChatId)).toBe(true);
          } else {
            expect(isOperatorChat(chatId, otherChatId)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
