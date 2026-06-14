import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC ověření platebních webhooků od GoPay.
 *
 * GoPay podepisuje payload webhooku sdíleným tajemstvím. Handler
 * (`/api/webhooks/gopay`, task 9.3) musí podpis ověřit a při neshodě požadavek
 * odmítnout s HTTP 401 bez jakékoli změny záznamů (R3.1, R3.2). Porovnání podpisu
 * probíhá v **konstantním čase** ({@link timingSafeEqual}), aby neúnik časem
 * neumožnil postupné uhodnutí podpisu.
 *
 * Tajemství se sem **předává parametrem** — čte se až ve volajícím z prostředí
 * (env), nikdy není natvrdo v kódu a nesmí se logovat. Server-only modul (node
 * `crypto`), nikdy se nesmí dostat do klientského bundlu.
 */

const ALGORITHM = 'sha256';

/**
 * Ověří HMAC podpis webhooku proti sdílenému tajemství.
 *
 * Vypočte očekávaný HMAC-SHA256 payloadu v hex zápisu a porovná ho v konstantním
 * čase s dodaným podpisem. Při jakékoli neshodě (včetně rozdílné délky) vrací
 * `false` — volající handler v takovém případě odpoví 401.
 *
 * @param payload Surové tělo webhooku (přesně tak, jak dorazilo).
 * @param signature Podpis dodaný GoPay (hex zápis HMAC-SHA256).
 * @param secret Sdílené tajemství načtené volajícím z env.
 * @returns `true` pokud podpis odpovídá, jinak `false`.
 * @throws Error pokud je tajemství prázdné (chybná konfigurace prostředí).
 */
export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  if (secret.length === 0) {
    throw new Error('HMAC tajemství webhooku není nastaveno.');
  }

  const expected = createHmac(ALGORITHM, secret).update(payload).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  // timingSafeEqual vyžaduje stejnou délku; rozdílná délka = neshoda.
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
