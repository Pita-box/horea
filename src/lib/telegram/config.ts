// Telegram_Config — čistá resoluce konfigurace z proměnných prostředí.
//
// Tento soubor obsahuje ZÁMĚRNĚ jen čisté funkce (žádný `import 'server-only'`,
// žádné čtení `process.env`), aby byly přímo pokryté property testy. I/O wrapper
// `getTelegramConfig()` doplní až task 6.1.

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
