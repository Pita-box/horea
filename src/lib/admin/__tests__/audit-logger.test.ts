import { describe, expect, it } from 'vitest';

import { captureSnapshot } from '@/lib/admin/audit-logger';

/**
 * Unit test best-effort zachycení before/after (task 3.4 — R9.3, R9.4).
 *
 * Ověřuje:
 *  - úspěšné zachycení vrátí hodnotu, takže `before`/`after` odpovídá stavu před
 *    a po změně cílového objektu (R9.3),
 *  - edge-case: pokud `capture` vyhodí výjimku nebo vrátí `undefined`/`null`,
 *    vrátí {@link captureSnapshot} `null` a NEVYHODÍ — selhání zachycení kontextu
 *    nesmí shodit citlivou akci (R9.4).
 */

describe('captureSnapshot — úspěšné zachycení (R9.3)', () => {
  it('vrátí zachycenou hodnotu (sync i async capture)', async () => {
    await expect(captureSnapshot(() => ({ status: 'active' }))).resolves.toEqual({ status: 'active' });
    await expect(captureSnapshot(async () => ({ status: 'expired' }))).resolves.toEqual({ status: 'expired' });
  });

  it('before/after odpovídá změně stavu cílového objektu (R9.3)', async () => {
    const target = { status: 'active', plan: 'start' };

    // before — stav před akcí.
    const before = await captureSnapshot(() => ({ ...target }));

    // akce mění cílový objekt.
    target.status = 'expired';
    target.plan = 'max';

    // after — stav po akci.
    const after = await captureSnapshot(() => ({ ...target }));

    expect(before).toEqual({ status: 'active', plan: 'start' });
    expect(after).toEqual({ status: 'expired', plan: 'max' });
  });
});

describe('captureSnapshot — best-effort selhání (R9.4)', () => {
  it('výjimka v capture → null, bez vyhození', async () => {
    await expect(
      captureSnapshot(() => {
        throw new Error('DB nedostupná');
      }),
    ).resolves.toBeNull();
  });

  it('odmítnutý Promise → null, bez vyhození', async () => {
    await expect(captureSnapshot(async () => Promise.reject(new Error('timeout')))).resolves.toBeNull();
  });

  it('capture vrátí undefined → null', async () => {
    await expect(captureSnapshot(() => undefined)).resolves.toBeNull();
  });

  it('capture vrátí null → null', async () => {
    await expect(captureSnapshot(() => null)).resolves.toBeNull();
  });
});
