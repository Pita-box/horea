import 'server-only';

// Telegram_Config — čistá resoluce konfigurace z proměnných prostředí + I/O wrapper.
//
// Čisté funkce (`resolveTelegramConfig`, `resolveWebhookSecret`) jsou přímo pokryté
// property testy. Jediné místo, které čte `process.env` (token/chat), je I/O wrapper
// `getTelegramConfig()` níže.

/** Vyřešená konfigurace, když je Feature_Enabled aktivní. */
export interface TelegramConfig {
  botToken: string;
  operatorChatId: string;
}

/**
 * Čistá funkce: z mapy proměnných odvodí konfiguraci. Vrací `TelegramConfig` jen
 * když jsou `TELEGRAM_BOT_TOKEN` i `TELEGRAM_OPERATOR_CHAT_ID` neprázdné (R1.1);
 * jinak `null` (R1.2). NIKDY nepředává hodnoty do logů — jen je vrací volajícímu.
 */
export function resolveTelegramConfig(
  env: Record<string, string | undefined>,
): TelegramConfig | null {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const operatorChatId = env.TELEGRAM_OPERATOR_CHAT_ID;

  if (!botToken || !operatorChatId) {
    return null;
  }

  return { botToken, operatorChatId };
}

/**
 * Čistá funkce: vrací webhook secret, nebo `null`, když `TELEGRAM_WEBHOOK_SECRET`
 * není nastaven (R7.3). NIKDY nepředává hodnotu do logů — jen ji vrací volajícímu.
 */
export function resolveWebhookSecret(
  env: Record<string, string | undefined>,
): string | null {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  return secret ? secret : null;
}

/**
 * I/O wrapper: jediné místo, které čte token a chat z `process.env`. Deleguje na
 * čistou `resolveTelegramConfig`. Vrací `TelegramConfig`, jen když je konfigurace
 * úplná (R1.4), jinak `null`.
 */
export function getTelegramConfig(): TelegramConfig | null {
  return resolveTelegramConfig(process.env);
}
