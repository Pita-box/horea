import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleTelegramUpdate } from '../webhook';
import { sendTelegramMessage } from '../client';
import { getCurrentMonthRevenueCzk } from '../revenue';
import { getNextMonthEstimateCzk } from '../estimate';
import { runServiceProbes } from '../health';
import {
  buildHelpMessage,
  buildUnknownCommandMessage,
  formatCzk,
} from '../messages';

// Unit testy orchestrace `handleTelegramUpdate` (task 9.2).
//
// `handleTelegramUpdate` je server-only I/O orchestrace: autorizuje chat, parsuje
// příkaz, dispatchne ho na správný kalkulátor / probe a odpovídá VÝHRADNĚ na
// Operator_Chat_Id přes `sendTelegramMessage`. V testech proto mockujeme všechny
// I/O sousedy a ověřujeme čistě orchestraci (kdo se zavolal a co se odeslalo):
//  - `../client` — `sendTelegramMessage` jako spy (kontrolujeme, zda a s čím se volá),
//  - `../revenue` / `../estimate` — kalkulátory (řídíme návratovou hodnotu i selhání),
//  - `../health` — mockujeme JEN `runServiceProbes`; čisté `buildHealthReport` a typy
//    necháváme reálné (přes `vi.importActual`), aby `/stav` odpověď byla skutečná,
//  - `@/lib/supabase/admin` — `createAdminClient` vrací dummy (orchestrace ho jen předává),
//  - `./config` — `getTelegramConfig` vrací pevnou konfiguraci s Operator_Chat_Id `42`,
//  - `@/lib/log-server` — odpojí reálné `next/headers` a umožní špehovat logování.
// Po každém testu vše uklízíme (`vi.restoreAllMocks`).

// Konfigurace: feature aktivní, Operator_Chat_Id = '42'.
vi.mock('../config', () => ({
  getTelegramConfig: () => ({ botToken: 't', operatorChatId: '42' }),
}));

// Odesílací helper jako spy — best-effort, nikdy nevyhodí.
vi.mock('../client', () => ({
  sendTelegramMessage: vi.fn(async () => ({ status: 'sent' as const })),
}));

// Kalkulátory tržeb a odhadu — návratovou hodnotu řídíme per test.
vi.mock('../revenue', () => ({
  getCurrentMonthRevenueCzk: vi.fn(),
}));
vi.mock('../estimate', () => ({
  getNextMonthEstimateCzk: vi.fn(),
}));

// Health: mockujeme jen `runServiceProbes`; `buildHealthReport` a typy necháme reálné.
vi.mock('../health', async () => {
  const actual = await vi.importActual<typeof import('../health')>('../health');
  return { ...actual, runServiceProbes: vi.fn() };
});

// Admin Supabase klient — orchestrace ho jen předává kalkulátoru; vracíme dummy.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}) as never,
}));

// serverLog jako spy — odpojí reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

/** Operator_Chat_Id z mocku konfigurace. */
const OPERATOR_CHAT_ID = 42;

/** Sestaví validní Telegram update z operátorského chatu se zadaným textem. */
function operatorUpdate(text: string): unknown {
  return { message: { chat: { id: OPERATOR_CHAT_ID }, text } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('handleTelegramUpdate — autorizace chatu (R8.2)', () => {
  it('update z cizího chatu → žádná odpověď (sendTelegramMessage se nevolá)', async () => {
    // Cizí chat id (jiné než Operator_Chat_Id) → ignorovat bez odpovědi.
    await handleTelegramUpdate({ message: { chat: { id: 999 }, text: '/trzby' } });

    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(getCurrentMonthRevenueCzk).not.toHaveBeenCalled();
  });
});

describe('handleTelegramUpdate — dispatch příkazů na Operator_Chat_Id (R8.3)', () => {
  it('/trzby → volá getCurrentMonthRevenueCzk a odešle výsledek (R9.1, R9.3)', async () => {
    vi.mocked(getCurrentMonthRevenueCzk).mockResolvedValue(12345);

    await handleTelegramUpdate(operatorUpdate('/trzby'));

    expect(getCurrentMonthRevenueCzk).toHaveBeenCalledTimes(1);
    expect(getNextMonthEstimateCzk).not.toHaveBeenCalled();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendTelegramMessage).mock.calls[0][0];
    // Odpověď obsahuje naformátovaný výsledek tržeb.
    expect(sent).toContain(formatCzk(12345));
  });

  it('/odhad → volá getNextMonthEstimateCzk a odešle výsledek (R10.1)', async () => {
    vi.mocked(getNextMonthEstimateCzk).mockResolvedValue(54321);

    await handleTelegramUpdate(operatorUpdate('/odhad'));

    expect(getNextMonthEstimateCzk).toHaveBeenCalledTimes(1);
    expect(getCurrentMonthRevenueCzk).not.toHaveBeenCalled();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendTelegramMessage).mock.calls[0][0];
    expect(sent).toContain(formatCzk(54321));
  });

  it('/stav → volá runServiceProbes a odešle health zprávu (R11.1)', async () => {
    vi.mocked(runServiceProbes).mockResolvedValue([
      { service: 'supabase', label: 'Supabase', status: 'ok' },
      { service: 'resend', label: 'Resend', status: 'down' },
    ]);

    await handleTelegramUpdate(operatorUpdate('/stav'));

    expect(runServiceProbes).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendTelegramMessage).mock.calls[0][0];
    // Reálný buildHealthReport + buildHealthMessage → zpráva o stavu systému.
    expect(sent).toContain('Stav systému');
    expect(sent).toContain('Supabase');
  });

  it('/help → odešle nápovědu (R12.1)', async () => {
    await handleTelegramUpdate(operatorUpdate('/help'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][0]).toBe(buildHelpMessage());
  });

  it('/start → odešle nápovědu (R12.1)', async () => {
    await handleTelegramUpdate(operatorUpdate('/start'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][0]).toBe(buildHelpMessage());
  });

  it('neznámý text → odešle nápovědu na neznámý příkaz (R12.2)', async () => {
    await handleTelegramUpdate(operatorUpdate('něco úplně jiného'));

    expect(getCurrentMonthRevenueCzk).not.toHaveBeenCalled();
    expect(getNextMonthEstimateCzk).not.toHaveBeenCalled();
    expect(runServiceProbes).not.toHaveBeenCalled();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][0]).toBe(
      buildUnknownCommandMessage(),
    );
  });
});

describe('handleTelegramUpdate — selhání čtení DB (R9, R10)', () => {
  it('reject kalkulátoru → odešle českou chybovou hlášku a nevyhodí', async () => {
    vi.mocked(getCurrentMonthRevenueCzk).mockRejectedValue(new Error('db down'));

    // Nesmí vyhodit ven (fail-safe).
    await expect(handleTelegramUpdate(operatorUpdate('/trzby'))).resolves.toBeUndefined();

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][0]).toBe(
      'Údaje se teď nepodařilo načíst.',
    );
  });
});

describe('handleTelegramUpdate — neplatný tvar updatu (R7.4)', () => {
  it('chybějící message/chat/text → žádná odpověď (sendTelegramMessage se nevolá)', async () => {
    await handleTelegramUpdate({ foo: 'bar' });
    await handleTelegramUpdate({ message: { chat: { id: 42 } } }); // chybí text
    await handleTelegramUpdate(null);

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
