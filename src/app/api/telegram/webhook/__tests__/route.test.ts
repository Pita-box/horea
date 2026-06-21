import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { POST } from '../route';
import { handleTelegramUpdate } from '@/lib/telegram/webhook';
import { serverLog } from '@/lib/log-server';

// Unit testy Route Handleru POST `/api/telegram/webhook` (task 12.2, R7.1–R7.4).
//
// Route handler je tenký adaptér mezi HTTP a doménovou orchestrací. Testujeme jen
// jeho odpovědnost (status kódy a zda/kdy se dispatchne business logika), proto:
//  - `@/lib/telegram/webhook` — mockujeme JEN `handleTelegramUpdate` (spy);
//    čistou `isAuthorizedSecret` necháváme reálnou (přes `vi.importActual`), aby
//    ověření hlavičky bylo skutečné (R7.1, R7.2),
//  - secret řídíme přes `vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', …)`, takže reálná
//    `resolveWebhookSecret(process.env)` vrací to, co test potřebuje (R7.3),
//  - `@/lib/log-server` — `serverLog` jako spy; odpojí reálnou závislost na
//    `next/headers` a umožní ověřit, že se loguje jen kategorie (R7.3).
// Po každém testu uklízíme stuby i mocky.

// `handleTelegramUpdate` jako spy; `isAuthorizedSecret` ponecháváme reálné.
vi.mock('@/lib/telegram/webhook', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram/webhook')>(
    '@/lib/telegram/webhook',
  );
  return { ...actual, handleTelegramUpdate: vi.fn(async () => {}) };
});

// serverLog jako spy — odpojí reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

/** Hlavička, kterou Telegram posílá s Webhook_Secret u každého updatu. */
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
/** Nakonfigurovaný secret používaný napříč testy. */
const SECRET = 'tajny-webhook-secret';

/**
 * Sestaví `POST` request na webhook s volitelnou hlavičkou secretu a tělem.
 * Standardní `Request` plně pokrývá to, co handler používá (`headers.get`,
 * `json()`), proto ho jen přetypujeme na `NextRequest`.
 */
function buildRequest(options: { secretHeader?: string; body?: string }): NextRequest {
  const headers = new Headers();
  if (options.secretHeader !== undefined) {
    headers.set(SECRET_HEADER, options.secretHeader);
  }

  return new Request('https://app.example/api/telegram/webhook', {
    method: 'POST',
    headers,
    body: options.body,
  }) as unknown as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('POST /api/telegram/webhook — konfigurace secretu (R7.3)', () => {
  it('nenastavený secret → 401, žádný dispatch, log telegram_webhook_secret_missing', async () => {
    // Prázdný secret = Feature není bezpečně konfigurovatelná → odmítáme vše.
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');

    const response = await POST(
      buildRequest({ secretHeader: 'cokoliv', body: JSON.stringify({ update_id: 1 }) }),
    );

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
    // Loguje se jen kategorie — nikdy Secret_Value.
    expect(serverLog.error).toHaveBeenCalledWith('telegram_webhook_secret_missing', {});
  });
});

describe('POST /api/telegram/webhook — ověření hlavičky (R7.2)', () => {
  it('chybějící hlavička → 401, žádný dispatch', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);

    const response = await POST(buildRequest({ body: JSON.stringify({ update_id: 1 }) }));

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('neshodná hlavička → 401, žádný dispatch', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);

    const response = await POST(
      buildRequest({ secretHeader: 'spatny-secret', body: JSON.stringify({ update_id: 1 }) }),
    );

    expect(response.status).toBe(401);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });
});

describe('POST /api/telegram/webhook — parsování těla a dispatch (R7.1, R7.4)', () => {
  it('shodná hlavička, ale neplatné JSON tělo → 200 bez příkazu (R7.4)', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);

    const response = await POST(
      buildRequest({ secretHeader: SECRET, body: '{neplatny json' }),
    );

    expect(response.status).toBe(200);
    expect(handleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('shodná hlavička a validní JSON tělo → 200 a dispatch naparsovaného updatu (R7.1)', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);

    const update = { update_id: 7, message: { chat: { id: 42 }, text: '/trzby' } };
    const response = await POST(
      buildRequest({ secretHeader: SECRET, body: JSON.stringify(update) }),
    );

    expect(response.status).toBe(200);
    expect(handleTelegramUpdate).toHaveBeenCalledTimes(1);
    expect(handleTelegramUpdate).toHaveBeenCalledWith(update);
  });
});
