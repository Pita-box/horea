import { NextResponse, type NextRequest } from 'next/server';

import { serverLog } from '@/lib/log-server';
import { resolveWebhookSecret } from '@/lib/telegram/config';
import { handleTelegramUpdate, isAuthorizedSecret } from '@/lib/telegram/webhook';

/**
 * Route handler POST `/api/telegram/webhook` (R7.1–R7.4).
 *
 * Tenký adaptér mezi HTTP a doménovou logikou ({@link handleTelegramUpdate}),
 * vzorovaný podle `app/api/webhooks/gopay/route.ts`. Odpovědnost route handleru:
 *
 *  1. **Konfigurace secretu** — `resolveWebhookSecret(process.env)`; když `null`,
 *     webhook odmítá vše HTTP 401 a loguje `telegram_webhook_secret_missing`
 *     bez Secret_Value (R7.3).
 *  2. **Ověření hlavičky** `x-telegram-bot-api-secret-token` v konstantním čase
 *     přes {@link isAuthorizedSecret}; neshoda/chybí → HTTP 401, žádná business
 *     logika (R7.2).
 *  3. **Parsování těla** — `await request.json()` v `try/catch`; syntakticky
 *     neplatné tělo → HTTP 200 bez příkazu, ať Telegram neretry-uje (R7.4).
 *  4. Validní update předá {@link handleTelegramUpdate} a vrátí HTTP 200.
 *
 * Token, secret ani tělo se nikdy nelogují.
 */

/** Hlavička s Webhook_Secret, kterou Telegram posílá u každého updatu. */
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export async function POST(request: NextRequest): Promise<Response> {
  // (1) Konfigurace secretu — bez ní nelze webhook bezpečně ověřit (R7.3).
  const secret = resolveWebhookSecret(process.env);
  if (!secret) {
    // Logujeme jen kategorii — nikdy Secret_Value (R7.3).
    await serverLog.error('telegram_webhook_secret_missing', {});
    return new NextResponse(null, { status: 401 });
  }

  // (2) Ověření hlavičky v konstantním čase; žádná business logika při neshodě (R7.2).
  const header = request.headers.get(SECRET_HEADER);
  if (!isAuthorizedSecret(header, secret)) {
    return new NextResponse(null, { status: 401 });
  }

  // (3) Parsování těla; neplatné tělo → 200 bez příkazu, ať Telegram neretry-uje (R7.4).
  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  // (4) Validní update předáme doménové orchestraci (R7, R8).
  await handleTelegramUpdate(update);
  return new NextResponse(null, { status: 200 });
}
