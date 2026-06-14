import { NextResponse, type NextRequest } from 'next/server';

import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processGopayWebhook, type GopayWebhookEvent } from '@/lib/webhooks/handler';
import { verifyHmac } from '@/lib/webhooks/hmac';

/**
 * Route handler POST `/api/webhooks/gopay` (R3.1–R3.6).
 *
 * Tenký adaptér mezi HTTP a doménovou logikou ({@link processGopayWebhook}).
 * Odpovědnost route handleru:
 *
 *  1. **HMAC ověření** surového těla proti sdílenému tajemství z env
 *     ({@link verifyHmac}); při neshodě HTTP 401 a žádná změna (R3.1, R3.2).
 *  2. Normalizace payloadu na `gopay_payment_id` + stav.
 *  3. Předání service-role klienta doménové logice (webhook nemá uživatelský
 *     kontext, běží server-to-server).
 *
 * Idempotence a mapování stavů řeší {@link processGopayWebhook}. Neznámé
 * `gopay_payment_id` vrací HTTP 200 bez změny (R3.4). Tajemství ani PII se
 * nikdy nelogují — logují se jen kategorie/identifikátory.
 */

/** Hlavička s HMAC podpisem webhooku od GoPay. */
const SIGNATURE_HEADER = 'x-gopay-signature';

type WebhookBody = {
  /** GoPay nativní ID platby. */
  id?: unknown;
  /** Alternativní název pole (kompatibilita). */
  gopay_payment_id?: unknown;
  /** Stav platby hlášený GoPay. */
  state?: unknown;
};

function extractPaymentId(body: WebhookBody): string | null {
  if (typeof body.id === 'string' && body.id.length > 0) {
    return body.id;
  }
  if (typeof body.id === 'number') {
    return String(body.id);
  }
  if (typeof body.gopay_payment_id === 'string' && body.gopay_payment_id.length > 0) {
    return body.gopay_payment_id;
  }
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.GOPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Chybná konfigurace prostředí — nelze bezpečně ověřit podpis.
    await serverLog.error('webhook_secret_missing', {});
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // (1) HMAC ověření surového těla (R3.1, R3.2).
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER) ?? '';

  if (!verifyHmac(rawBody, signature, secret)) {
    await serverLog.warn('webhook_hmac_mismatch', {});
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // (2) Normalizace payloadu.
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const gopayPaymentId = extractPaymentId(body);
  if (gopayPaymentId === null || typeof body.state !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const event: GopayWebhookEvent = { gopayPaymentId, state: body.state };

  // (3) Doménová logika se service-role klientem.
  const result = await processGopayWebhook(createAdminClient(), event);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ outcome: result.outcome }, { status: 200 });
}
