import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyHmac } from '@/lib/webhooks/hmac';

/**
 * Unit test HMAC ověření webhooků (task 9.2 — R3.1, R3.2).
 *
 * Ověřuje, že validní HMAC-SHA256 podpis je akceptován (`true`), zatímco
 * neplatný podpis, podpis jiné délky i podpis pod jiným tajemstvím je odmítnut
 * (`false`). Handler v případě `false` odpoví 401 a nic nezmění (R3.2).
 */

const SECRET = 'test-webhook-secret';
const PAYLOAD = '{"id":"PAY-123","state":"PAID"}';

/** Spočte správný hex HMAC-SHA256 podpis payloadu (referenční hodnota). */
function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyHmac (R3.1, R3.2)', () => {
  it('validní podpis → true', () => {
    const signature = sign(PAYLOAD, SECRET);

    expect(verifyHmac(PAYLOAD, signature, SECRET)).toBe(true);
  });

  it('neplatný podpis stejné délky → false', () => {
    const valid = sign(PAYLOAD, SECRET);
    // Změníme poslední znak, délka zůstane stejná.
    const tampered = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');

    expect(tampered).toHaveLength(valid.length);
    expect(verifyHmac(PAYLOAD, tampered, SECRET)).toBe(false);
  });

  it('podpis jiné délky → false', () => {
    expect(verifyHmac(PAYLOAD, 'abcd', SECRET)).toBe(false);
  });

  it('podpis spočtený pod jiným tajemstvím → false', () => {
    const signature = sign(PAYLOAD, 'jine-tajemstvi');

    expect(verifyHmac(PAYLOAD, signature, SECRET)).toBe(false);
  });

  it('pozměněný payload neodpovídá původnímu podpisu → false', () => {
    const signature = sign(PAYLOAD, SECRET);

    expect(verifyHmac('{"id":"PAY-123","state":"CANCELED"}', signature, SECRET)).toBe(false);
  });

  it('prázdné tajemství je chybná konfigurace → vyhodí výjimku', () => {
    expect(() => verifyHmac(PAYLOAD, sign(PAYLOAD, SECRET), '')).toThrow();
  });
});
