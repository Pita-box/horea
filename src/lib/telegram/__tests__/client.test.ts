import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendTelegramMessage, telegramGetMe } from '../client';
import { serverLog } from '@/lib/log-server';

// Unit testy Telegram_Client — `sendTelegramMessage` a `telegramGetMe` (task 6.3).
//
// Client je server-only I/O vrstva nad Telegram Bot API. V testech proto:
//  - mockujeme `fetch` přes `vi.stubGlobal` (kontrolujeme úspěch/selhání i argumenty),
//  - nastavujeme konfiguraci přes `vi.stubEnv` (názvy proměnných čte `getTelegramConfig`),
//  - mockujeme `@/lib/log-server`, abychom mohli `serverLog` špehovat a zároveň se
//    vyhnuli reálnému `next/headers` volání.
// Po každém testu vše uklízíme.

// Mock serverLog jako spy — sledujeme, CO se loguje (bezpečnostní invariant R2.2/R15.3),
// a zároveň tím odpojíme reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

/** Token a chat použité v testech (smyšlené, nikdy reálné tajemství). */
const TEST_BOT_TOKEN = '123456:TESTABCDEF';
const TEST_OPERATOR_CHAT_ID = '987654321';

/** Nastaví kompletní (neprázdnou) konfiguraci, aby byla feature aktivní. */
function stubFullConfig(): void {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TEST_BOT_TOKEN);
  vi.stubEnv('TELEGRAM_OPERATOR_CHAT_ID', TEST_OPERATOR_CHAT_ID);
}

/** Posbírá všechny argumenty předané do kteréhokoli `serverLog` volání do jednoho JSON řetězce. */
function allServerLogArgsAsString(): string {
  const calls = [
    ...vi.mocked(serverLog.info).mock.calls,
    ...vi.mocked(serverLog.warn).mock.calls,
    ...vi.mocked(serverLog.error).mock.calls,
  ];
  return JSON.stringify(calls);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('sendTelegramMessage', () => {
  beforeEach(() => {
    stubFullConfig();
  });

  it('při ok odpovědi vrací sent a volá sendMessage na Operator_Chat_Id s parse_mode HTML', async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTelegramMessage('ahoj');

    expect(result).toEqual({ status: 'sent' });

    // Ověření URL: musí obsahovat /bot<token>/sendMessage.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain(`/bot${TEST_BOT_TOKEN}/sendMessage`);
    expect(init.method).toBe('POST');

    // Ověření těla: cílový chat = Operator_Chat_Id a parse_mode HTML.
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe(TEST_OPERATOR_CHAT_ID);
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toBe('ahoj');
  });

  it('bez konfigurace vrací skipped/feature_disabled a fetch se NEvolá', async () => {
    // Vyprázdníme konfiguraci → getTelegramConfig vrátí null.
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_OPERATOR_CHAT_ID', '');

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTelegramMessage('ahoj');

    expect(result).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('při HTTP chybě (500) vrací failed/http_error', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTelegramMessage('ahoj');

    expect(result).toEqual({ status: 'failed', errorKind: 'http_error' });
  });

  it('při síťovém selhání (TypeError) vrací failed/network_error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTelegramMessage('ahoj');

    expect(result).toEqual({ status: 'failed', errorKind: 'network_error' });
  });
});

describe('telegramGetMe', () => {
  beforeEach(() => {
    stubFullConfig();
  });

  it('při ok odpovědi vrací ok, volá getMe metodou GET a NEodesílá zprávu', async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await telegramGetMe();

    expect(result).toEqual({ status: 'ok' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/getMe');
    expect((init?.method ?? 'GET')).toBe('GET');

    // Health probe nesmí volat sendMessage (žádné odeslání zprávy).
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/sendMessage');
    }
  });

  it('při HTTP chybě (500) vrací error/http_error', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await telegramGetMe();

    expect(result).toEqual({ status: 'error', errorKind: 'http_error' });
  });

  it('při síťovém selhání (TypeError) vrací error/network_error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await telegramGetMe();

    expect(result).toEqual({ status: 'error', errorKind: 'network_error' });
  });
});

describe('bezpečnost — serverLog nikdy nedostane token ani text zprávy', () => {
  beforeEach(() => {
    stubFullConfig();
  });

  it('do serverLog nejde token ani text při HTTP chybě sendMessage', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('tajny-text-zpravy');

    const logged = allServerLogArgsAsString();
    expect(logged).not.toContain(TEST_BOT_TOKEN);
    expect(logged).not.toContain('tajny-text-zpravy');
    // Logovat se smí jen status/errorKind.
    expect(serverLog.error).toHaveBeenCalledWith('telegram_send_failed', {
      status: 'failed',
      errorKind: 'http_error',
    });
  });

  it('do serverLog nejde token ani text při síťovém selhání sendMessage', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('jiny-tajny-text');

    const logged = allServerLogArgsAsString();
    expect(logged).not.toContain(TEST_BOT_TOKEN);
    expect(logged).not.toContain('jiny-tajny-text');
  });

  it('do serverLog nejde token při chybě telegramGetMe', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await telegramGetMe();

    const logged = allServerLogArgsAsString();
    expect(logged).not.toContain(TEST_BOT_TOKEN);
    expect(serverLog.error).toHaveBeenCalledWith('telegram_getme_failed', {
      status: 'error',
      errorKind: 'http_error',
    });
  });

  it('při skipped (bez konfigurace) jde do logu jen status, žádné tajemství', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_OPERATOR_CHAT_ID', '');

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('text-ktery-se-neodesle');

    const logged = allServerLogArgsAsString();
    expect(logged).not.toContain('text-ktery-se-neodesle');
    expect(serverLog.info).toHaveBeenCalledWith('telegram_skipped_disabled', {
      status: 'skipped',
    });
  });
});
