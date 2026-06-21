import 'server-only';

import { getTelegramConfig } from './config';
import { serverLog } from '@/lib/log-server';

// Telegram_Client — server-only I/O vrstva nad Telegram Bot API (R2, R15).
//
// Dvě veřejné funkce:
//  - `sendTelegramMessage(text)` — odešle zprávu operátorovi (R2.1).
//  - `telegramGetMe()` — read-only health probe bez odeslání zprávy (R15.2, R15.3).
//
// Bezpečnostní invarianty:
//  - Token je v URL jen za běhu fetch; do `serverLog` jde VÝHRADNĚ `status`/`errorKind`,
//    NIKDY token, text zprávy ani tělo odpovědi (R2.2, R15.3).
//  - Funkce NIKDY nevyhodí výjimku — chyby se mapují na kategorii (R2.3, R1.3).

/** Základ Telegram Bot API. Token se doplňuje až za běhu (`/bot<token>/<method>`). */
const TELEGRAM_API_BASE = 'https://api.telegram.org';

/** Timeout požadavku — ochrana před zaseknutím na nedostupném hostu (R2.3). */
const REQUEST_TIMEOUT_MS = 5000;

/** Kategorie chyby — bez Secret_Value, vhodná k logování (R2.2, R2.3). */
type ErrorKind = 'http_error' | 'network_error' | 'unexpected';

/** Kategorizovaný výsledek odeslání — bez Secret_Value, vhodný k logování. */
export type SendResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'feature_disabled' } // R1.2, R1.3
  | { status: 'failed'; errorKind: ErrorKind }; // R2.3

/** Výsledek read-only health probe (R15.2, R15.3). */
export type GetMeResult =
  | { status: 'ok' }
  | { status: 'skipped'; reason: 'feature_disabled' }
  | { status: 'error'; errorKind: ErrorKind };

/**
 * Escapuje uživatelský obsah pro Telegram `parse_mode: 'HTML'`. Telegram vyžaduje
 * escapovat pouze `&`, `<`, `>` (pořadí důležité — `&` první). Čistá funkce bez I/O.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Mapuje zachycenou chybu z `fetch` na kategorii. Síťové selhání `fetch` vyhazuje
 * `TypeError`, vypršený timeout `AbortError` → `network_error` (nedostupnost);
 * cokoli jiného → `unexpected`. Nikdy nevrací detail chyby.
 */
function classifyThrown(error: unknown): Extract<ErrorKind, 'network_error' | 'unexpected'> {
  if (error instanceof TypeError) {
    return 'network_error';
  }
  // `AbortSignal.timeout()` přeruší s `TimeoutError`, ruční `abort()` s `AbortError` —
  // obojí znamená nedostupnost hosta (R2.3).
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return 'network_error';
  }
  return 'unexpected';
}

/** Vytvoří `AbortSignal`, který přeruší fetch po `REQUEST_TIMEOUT_MS` (R2.3). */
function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

/**
 * Odešle zprávu operátorovi na Operator_Chat_Id přes `sendMessage` (R2.1).
 *
 * Bez konfigurace (Feature_Enabled neaktivní) vrací `skipped` a zaloguje informativní
 * `telegram_skipped_disabled` bez Secret_Value (R1.2, R1.3). Při HTTP chybě (4xx/5xx)
 * vrací `failed`/`http_error`, při síťovém selhání `network_error`, jinak `unexpected`
 * (R2.3). Funkce NIKDY nevyhodí výjimku a do logu jde jen `status`/`errorKind` (R2.2).
 */
export async function sendTelegramMessage(text: string): Promise<SendResult> {
  const config = getTelegramConfig();
  if (!config) {
    await serverLog.info('telegram_skipped_disabled', { status: 'skipped' });
    return { status: 'skipped', reason: 'feature_disabled' };
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.operatorChatId,
        text: escapeHtml(text),
        parse_mode: 'HTML',
      }),
      signal: timeoutSignal(),
    });

    if (!response.ok) {
      await serverLog.error('telegram_send_failed', { status: 'failed', errorKind: 'http_error' });
      return { status: 'failed', errorKind: 'http_error' };
    }

    return { status: 'sent' };
  } catch (error) {
    const errorKind = classifyThrown(error);
    await serverLog.error('telegram_send_failed', { status: 'failed', errorKind });
    return { status: 'failed', errorKind };
  }
}

/**
 * Read-only health probe přes `getMe` — bez odeslání zprávy (R15.2, R15.3).
 *
 * Bez konfigurace vrací `skipped`. Úspěch → `ok`. Chyby se mapují stejně jako u
 * `sendTelegramMessage` na kategorii a vrací se jen `status`/`errorKind`; do logu
 * nejde token ani tělo odpovědi. Funkce NIKDY nevyhodí výjimku.
 */
export async function telegramGetMe(): Promise<GetMeResult> {
  const config = getTelegramConfig();
  if (!config) {
    await serverLog.info('telegram_skipped_disabled', { status: 'skipped' });
    return { status: 'skipped', reason: 'feature_disabled' };
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${config.botToken}/getMe`, {
      method: 'GET',
      signal: timeoutSignal(),
    });

    if (!response.ok) {
      await serverLog.error('telegram_getme_failed', { status: 'error', errorKind: 'http_error' });
      return { status: 'error', errorKind: 'http_error' };
    }

    return { status: 'ok' };
  } catch (error) {
    const errorKind = classifyThrown(error);
    await serverLog.error('telegram_getme_failed', { status: 'error', errorKind });
    return { status: 'error', errorKind };
  }
}
