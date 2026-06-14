import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Ochrana cron endpointů sdíleným tajemstvím (R10.6).
 *
 * Vercel Cron volá interní endpointy s hlavičkou `Authorization: Bearer
 * <CRON_SECRET>` (tajemství z env `CRON_SECRET`). Tento helper ověří, že příchozí
 * požadavek nese správné tajemství — veřejné volání bez tajemství je odmítnuto,
 * aby cron logiku (strhávání, mazání dat, e-maily) nešlo spustit zvenčí.
 *
 * Tajemství se NIKDY neloguje a porovnává se v konstantním čase
 * ({@link timingSafeEqual}), aby z doby odpovědi nešlo tajemství odvodit.
 * Při chybějící konfiguraci (`CRON_SECRET` není nastaveno) vrací `not_configured`
 * — route to mapuje na HTTP 500 a žádnou akci neprovede (fail-safe: bez tajemství
 * raději nic nespouštět než běžet nechráněně).
 */

export type CronAuthResult = { ok: true } | { ok: false; reason: 'not_configured' | 'unauthorized' };

const BEARER_PREFIX = 'Bearer ';

/** Konstantní-časové porovnání dvou řetězců (bez úniku délky přes early-return). */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Ověří `Authorization: Bearer <CRON_SECRET>` hlavičku proti env `CRON_SECRET`.
 *
 * @param request Příchozí HTTP požadavek cron endpointu.
 * @returns `{ ok: true }` při shodě; jinak `not_configured` (chybí env) nebo
 *   `unauthorized` (chybí/nesedí hlavička).
 */
export function verifyCronAuthorization(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, reason: 'not_configured' };
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith(BEARER_PREFIX)) {
    return { ok: false, reason: 'unauthorized' };
  }

  const token = header.slice(BEARER_PREFIX.length);
  if (!safeEqual(token, secret)) {
    return { ok: false, reason: 'unauthorized' };
  }

  return { ok: true };
}
