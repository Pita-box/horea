// Feature: telegram-operator-notifications, Property 2: No-op a nevyhození bez kompletní konfigurace
//
// Property 2 ověřuje dvě fail-safe vlastnosti:
//  1) Bez kompletní konfigurace (chybí token/chat id) vrátí reálné `sendTelegramMessage`
//     výsledek `skipped` a NIKDY nevyhodí výjimku (R1.2, R1.3).
//  2) Pro libovolný vstup notifikace a libovolné chování odesílatele (úspěch, `failed`,
//     nebo dokonce vyhozená chyba uvnitř) obě funkce `notifyBusinessCreated` i
//     `notifyPaymentConfirmed` vždy doběhnou bez vyhození výjimky a vrátí `SendResult`
//     se `status` (R5.1, R5.2, R5.3).
//
// Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.3

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import type { SendResult } from '../client';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';

// Mock log-server jako spy — odpojí reálnou závislost na `next/headers` (kterou
// server-only kód při logování používá) a umožní bezpečně volat reálný client.
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

// Mock Telegram_Client — `sendTelegramMessage` nastavujeme na různá chování,
// abychom ověřili, že Notifier je vůči nim odolný a nikdy nevyhodí.
vi.mock('../client', () => ({
  sendTelegramMessage: vi.fn(),
}));

import { notifyBusinessCreated, notifyPaymentConfirmed } from '../notifications';
import { sendTelegramMessage } from '../client';

/** Možná chování mockovaného odesílatele. */
type SenderBehavior = 'sent' | 'failed_http' | 'failed_network' | 'throw';

/** Namapuje vybrané chování na implementaci mockovaného `sendTelegramMessage`. */
function senderImpl(behavior: SenderBehavior): () => Promise<SendResult> {
  switch (behavior) {
    case 'sent':
      return async () => ({ status: 'sent' });
    case 'failed_http':
      return async () => ({ status: 'failed', errorKind: 'http_error' });
    case 'failed_network':
      return async () => ({ status: 'failed', errorKind: 'network_error' });
    case 'throw':
      return async () => {
        throw new Error('boom uvnitř odesílatele');
      };
  }
}

/** Povolené hodnoty `status` ve výsledku Notifieru. */
const ALLOWED_STATUS = new Set(['sent', 'failed', 'skipped']);

const behaviorArb = fc.constantFrom<SenderBehavior>('sent', 'failed_http', 'failed_network', 'throw');
const planArb = fc.constantFrom<SubscriptionPlan>('start', 'pokrocily', 'max');
// Validní data (bez Invalid Date) — chování při výjimce uvnitř testujeme přes `throw` mock.
const createdAtArb = fc.date({ noInvalidDate: true });

afterEach(() => {
  vi.clearAllMocks();
});

describe('Property 2: Notifier vždy doběhne bez vyhození a vrátí SendResult', () => {
  it('notifyBusinessCreated nikdy nevyhodí pro libovolný vstup a libovolné chování odesílatele', async () => {
    await fc.assert(
      fc.asyncProperty(behaviorArb, fc.string(), createdAtArb, async (behavior, businessName, createdAt) => {
        vi.mocked(sendTelegramMessage).mockImplementation(senderImpl(behavior));

        const result = await notifyBusinessCreated({ businessName, createdAt });

        expect(typeof result.status).toBe('string');
        expect(ALLOWED_STATUS.has(result.status)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('notifyPaymentConfirmed nikdy nevyhodí pro libovolný vstup a libovolné chování odesílatele', async () => {
    await fc.assert(
      fc.asyncProperty(
        behaviorArb,
        fc.string(),
        planArb,
        fc.integer(),
        async (behavior, businessName, plan, amountCzk) => {
          vi.mocked(sendTelegramMessage).mockImplementation(senderImpl(behavior));

          const result = await notifyPaymentConfirmed({ businessName, plan, amountCzk });

          expect(typeof result.status).toBe('string');
          expect(ALLOWED_STATUS.has(result.status)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 2: bez kompletní konfigurace je sendTelegramMessage no-op (skipped) a nevyhodí', () => {
  beforeEach(() => {
    // Vyprázdníme konfiguraci → resolveTelegramConfig vrátí null → feature neaktivní.
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_OPERATOR_CHAT_ID', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reálné sendTelegramMessage vrací skipped/feature_disabled pro libovolný text', async () => {
    // Obejdeme mock `../client` a otestujeme reálnou implementaci.
    const actual = await vi.importActual<typeof import('../client')>('../client');

    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const result = await actual.sendTelegramMessage(text);
        expect(result).toEqual({ status: 'skipped', reason: 'feature_disabled' });
      }),
      { numRuns: 100 },
    );
  });
});
