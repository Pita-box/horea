import 'server-only';

import { serverLog } from '@/lib/log-server';
import { sendTelegramMessage, type SendResult } from './client';
import {
  buildBusinessCreatedMessage,
  buildPaymentConfirmedMessage,
  type BusinessCreatedInput,
  type PaymentConfirmedInput,
} from './messages';

// Notifier — best-effort PUSH notifikace operátorovi (R3, R4, R5).
//
// Vstupní typy `BusinessCreatedInput` a `PaymentConfirmedInput` jsou definované
// v `./messages` (jediný zdroj pravdy) — zde je jen importujeme a re-exportujeme
// pro pohodlí volajících integračních hooků.
//
// Bezpečnostní/robustnostní invariant: CELÉ tělo je v `try/catch`. Funkce vrací
// `SendResult` pro účely logu/testu, ale NIKDY nevyhodí výjimku do volajícího toku
// (R5.1, R5.2, R5.3). Při zachycené chybě vrací `{ status: 'failed', errorKind: 'unexpected' }`.

export type { BusinessCreatedInput, PaymentConfirmedInput };

/**
 * Best-effort notifikace o vzniku nového podniku. Sestaví český text přes
 * Message_Builder a odešle přes `sendTelegramMessage`. Veškeré chyby zachytí (R5.3) —
 * vrací `SendResult` pro logování/test, ale NIKDY nevyhodí výjimku (R5.1, R5.2).
 */
export async function notifyBusinessCreated(input: BusinessCreatedInput): Promise<SendResult> {
  try {
    return await sendTelegramMessage(buildBusinessCreatedMessage(input));
  } catch {
    await serverLog.error('telegram_notify_failed', { status: 'failed', errorKind: 'unexpected' });
    return { status: 'failed', errorKind: 'unexpected' };
  }
}

/**
 * Best-effort notifikace o potvrzené platbě. Sestaví český text přes Message_Builder
 * a odešle přes `sendTelegramMessage`. Veškeré chyby zachytí (R5.3) — vrací `SendResult`
 * pro logování/test, ale NIKDY nevyhodí výjimku (R5.1, R5.2).
 */
export async function notifyPaymentConfirmed(input: PaymentConfirmedInput): Promise<SendResult> {
  try {
    return await sendTelegramMessage(buildPaymentConfirmedMessage(input));
  } catch {
    await serverLog.error('telegram_notify_failed', { status: 'failed', errorKind: 'unexpected' });
    return { status: 'failed', errorKind: 'unexpected' };
  }
}
