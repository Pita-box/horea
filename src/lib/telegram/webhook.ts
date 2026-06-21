import 'server-only';

// Webhook orchestrace + autorizace.
//
// Čisté autorizační predikáty `isAuthorizedSecret` a `isOperatorChat` zůstávají beze
// změny (jsou přímo pokryté property testy 3.7/3.8); `server-only` je ve vitestu
// aliasován na stub, takže import tyto testy neovlivní. Orchestraci ověřeného updatu
// zajišťuje `handleTelegramUpdate` (task 9.1) — autorizace chatu, parse příkazu,
// dispatch a odpověď výhradně na Operator_Chat_Id.

import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';

import { parseCommand } from './commands';
import { getTelegramConfig } from './config';
import { sendTelegramMessage } from './client';
import { getCurrentMonthRevenueCzk } from './revenue';
import { getNextMonthEstimateCzk } from './estimate';
import { buildHealthReport, runServiceProbes } from './health';
import {
  buildEstimateMessage,
  buildHealthMessage,
  buildHelpMessage,
  buildRevenueMessage,
  buildUnknownCommandMessage,
} from './messages';

/**
 * Čistá funkce: ověří hodnotu hlavičky `X-Telegram-Bot-Api-Secret-Token` proti
 * nakonfigurovanému secretu (R7.1, R7.2). Vrací `false`, když secret není nastaven
 * (`configured === null`, R7.3) nebo když hlavička chybí (`headerValue === null`).
 *
 * Porovnání probíhá v konstantním čase přes akumulátor XOR rozdílů po znacích, aby
 * raná návratnost nevyzradila délku shody. Rozdílná délka hlavičky a secretu vede
 * vždy k `false`, ale porovná se celý nakonfigurovaný secret.
 */
export function isAuthorizedSecret(
  headerValue: string | null,
  configured: string | null,
): boolean {
  // Bez nakonfigurovaného secretu odmítáme vše (R7.3).
  if (configured === null) {
    return false;
  }

  // Chybějící hlavička → neautorizováno.
  if (headerValue === null) {
    return false;
  }

  // Konstantní porovnání: rozdíl délek zaznamenáme do akumulátoru, ale projdeme
  // celý nakonfigurovaný secret, aby raná návratnost nevyzradila délku shody.
  let mismatch = headerValue.length ^ configured.length;
  for (let i = 0; i < configured.length; i++) {
    const headerCode = i < headerValue.length ? headerValue.charCodeAt(i) : 0;
    mismatch |= headerCode ^ configured.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Čistá funkce: `true` právě tehdy, když chat odesílatele odpovídá Operator_Chat_Id
 * (R8.1, R8.2). Porovnává se řetězcová reprezentace `chatId` se stringem
 * `operatorChatId`; pro jakýkoli jiný chat vrací `false`.
 */
export function isOperatorChat(chatId: string | number, operatorChatId: string): boolean {
  return String(chatId) === operatorChatId;
}

// ---------------------------------------------------------------------------
// Orchestrace ověřeného updatu (task 9.1)
// ---------------------------------------------------------------------------

/** Krátká česká chybová hláška při selhání čtení DB — bez Secret_Value (R9, R10). */
const DB_ERROR_MESSAGE = 'Údaje se teď nepodařilo načíst.';

/** Minimální tvar příchozí zprávy, který orchestrace potřebuje. */
interface ParsedMessage {
  chatId: string | number;
  text: string;
}

/**
 * Bezpečně vyparsuje chat id a text z Telegram updatu (`update.message.chat.id`,
 * `update.message.text`). Neplatný tvar → `null` (volající pak tiše skončí, R7.4).
 * Čistá funkce bez I/O.
 */
function parseMessage(update: unknown): ParsedMessage | null {
  if (typeof update !== 'object' || update === null) {
    return null;
  }

  const message = (update as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) {
    return null;
  }

  const chat = (message as { chat?: unknown }).chat;
  if (typeof chat !== 'object' || chat === null) {
    return null;
  }

  const chatId = (chat as { id?: unknown }).id;
  if (typeof chatId !== 'string' && typeof chatId !== 'number') {
    return null;
  }

  const text = (message as { text?: unknown }).text;
  if (typeof text !== 'string') {
    return null;
  }

  return { chatId, text };
}

/**
 * Sestaví odpověď na rozpoznaný příkaz. Pro `/trzby` a `/odhad` čte DB přes service-role
 * klienta; selhání čtení obalí `try/catch` a vrátí krátkou českou chybovou hlášku bez
 * Secret_Value (R9, R10). Pro `/stav` spustí read-only probe a sestaví report (R11.1).
 */
async function buildCommandReply(text: string): Promise<string> {
  const parsed = parseCommand(text);

  if (parsed.kind === 'unknown') {
    return buildUnknownCommandMessage(); // R12.2
  }

  switch (parsed.command) {
    case 'trzby':
      try {
        const supabase = createAdminClient();
        const amount = await getCurrentMonthRevenueCzk(supabase, new Date());
        return buildRevenueMessage(amount); // R9.1, R9.3
      } catch {
        // Logujeme jen kategorii — žádný stack trace ani Secret_Value (R9, R16.x).
        await serverLog.error('telegram_command_db_error', { command: 'trzby' });
        return DB_ERROR_MESSAGE;
      }
    case 'odhad':
      try {
        const supabase = createAdminClient();
        const amount = await getNextMonthEstimateCzk(supabase, new Date());
        return buildEstimateMessage(amount); // R10.1, R10.4
      } catch {
        // Logujeme jen kategorii — žádný stack trace ani Secret_Value (R10, R16.x).
        await serverLog.error('telegram_command_db_error', { command: 'odhad' });
        return DB_ERROR_MESSAGE;
      }
    case 'stav': {
      const services = await runServiceProbes();
      return buildHealthMessage(buildHealthReport(services)); // R11.1
    }
    case 'start':
    case 'help':
      return buildHelpMessage(); // R12.1
  }
}

/**
 * Orchestruje ověřený update (R7, R8, R9–R12): bezpečně vyparsuje chat id a text,
 * autorizuje chat odesílatele přes `isOperatorChat` a dispatchne rozpoznaný příkaz.
 * Odpověď se odesílá VÝHRADNĚ na Operator_Chat_Id přes `sendTelegramMessage` (R8.3).
 *
 * Fail-safe chování:
 *  - Neplatný tvar updatu → tiše skončí (R7.4).
 *  - Chybějící konfigurace (`getTelegramConfig() === null`) → tiše skončí, nic neodesílá
 *    (R1.2, R1.3).
 *  - Update z cizího chatu → ignorovat bez odpovědi (R8.2).
 *  - Selhání čtení DB → krátká česká chybová hláška bez Secret_Value (R9, R10).
 */
export async function handleTelegramUpdate(update: unknown): Promise<void> {
  const message = parseMessage(update);
  if (!message) {
    return; // neplatný tvar updatu → tiše skončit (R7.4)
  }

  const config = getTelegramConfig();
  if (!config) {
    return; // bez konfigurace nic neodesíláme (R1.2, R1.3)
  }

  // Autorizace chatu — reagujeme výhradně na Operator_Chat_Id (R8.1, R8.2).
  if (!isOperatorChat(message.chatId, config.operatorChatId)) {
    return; // cizí chat → ignorovat bez odpovědi (R8.2)
  }

  const reply = await buildCommandReply(message.text);

  // Odpověď výhradně na Operator_Chat_Id; `sendTelegramMessage` cílí na nakonfigurovaný
  // chat a je best-effort (nikdy nevyhodí) (R8.3).
  await sendTelegramMessage(reply);
}
