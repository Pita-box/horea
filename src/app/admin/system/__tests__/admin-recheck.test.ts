import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Integrační test server-side admin re-checku a side-effect guardů pro server
 * actions stránky `/admin/system` (feature `admin-system-tools`, task 26.6).
 *
 * Cíl (defense in depth, R2.4): i kdyby Access_Guard middleware selhal, každá
 * z pěti actions MUSÍ při ne-adminovi nezávisle odmítnout (`ok: false`) a
 * **nesmí** provést žádný side-effect:
 *  - `revalidateTarget`  → žádné `revalidatePath`/`revalidateTag` (R15.1),
 *  - `triggerCron`       → žádný `fetch` interního cron endpointu (R15.1),
 *  - `pruneCronRuns`     → žádné `cron_runs.delete()` (R19.6),
 *  - `recheckHealth`     → žádné `runHealthChecks` (R21.4),
 *  - `sendTestEmail`     → žádné `sendEmail` ani upsert (R22.7).
 *
 * Ne-admin session simulujeme mockem `requireAdmin`, který vrací odmítnutí
 * `{ ok: false, message }` (stejný tvar jako reálná implementace). Všechny
 * side-effect kanály jsou špehované, abychom ověřili, že nebyly volány.
 */

// Ne-admin: requireAdmin vrací odmítnutí bez service-role klienta (jako reálně).
const NON_ADMIN_MESSAGE = 'Nemáte oprávnění k provedení této akce.';
const requireAdminMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: requireAdminMock,
}));

// Side-effect kanály — vše jako spy, aby šlo ověřit, že NEbyly volány.
const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));

const runHealthChecksMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/system/health', () => ({
  runHealthChecks: runHealthChecksMock,
}));

const sendEmailMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/email/client', () => ({
  sendEmail: sendEmailMock,
}));

// Service-role klient: `from()` vrací builder, jehož `delete()`/`upsert()` jsou
// špehy. Při ne-adminovi se sem actions nikdy nedostanou — to právě ověřujeme.
const deleteMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      delete: deleteMock,
      upsert: upsertMock,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  })),
}));

// Odpojí reálnou závislost na `next/headers` při logování.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { pruneCronRuns, recheckHealth, revalidateTarget, sendTestEmail, triggerCron } from '../actions';

// Globální `fetch` špehujeme zvlášť (triggerCron volá interní cron endpoint).
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  vi.clearAllMocks();
  // Výchozí stav: ne-admin pro každý test (jednotlivé testy si mohou přenastavit).
  requireAdminMock.mockResolvedValue({ ok: false, message: NON_ADMIN_MESSAGE });
});

describe('admin/system server actions — re-check oprávnění a side-effect guardy (ne-admin)', () => {
  // Před každým testem nastav ne-admin výchozí stav (afterEach běží až po testu).
  requireAdminMock.mockResolvedValue({ ok: false, message: NON_ADMIN_MESSAGE });

  it('revalidateTarget: ne-admin → ok:false a nedotkne se cache', async () => {
    const result = await revalidateTarget({ kind: 'path', value: '/admin' });

    expect(result).toEqual({ ok: false, message: NON_ADMIN_MESSAGE });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('triggerCron: ne-admin → ok:false a neprovede žádný fetch', async () => {
    const result = await triggerCron('cleanup');

    expect(result).toEqual({ ok: false, message: NON_ADMIN_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pruneCronRuns: ne-admin → ok:false a nesmaže žádné cron_runs', async () => {
    const result = await pruneCronRuns(30);

    expect(result).toEqual({ ok: false, message: NON_ADMIN_MESSAGE });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('recheckHealth: ne-admin → ok:false a nespustí health checky', async () => {
    const result = await recheckHealth();

    expect(result).toEqual({ ok: false, message: NON_ADMIN_MESSAGE });
    expect(runHealthChecksMock).not.toHaveBeenCalled();
  });

  it('sendTestEmail: ne-admin → ok:false (not_authorized) a neodešle e-mail', async () => {
    const result = await sendTestEmail();

    expect(result).toEqual({ ok: false, reason: 'not_authorized', message: NON_ADMIN_MESSAGE });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('admin re-check je server-only: require-admin importuje "server-only"', () => {
    // Guard `requireAdmin` musí běžet výhradně server-side — ověříme přítomnost
    // `import 'server-only'` ve zdroji modulu (server-side boundary, R15.1).
    const requireAdminPath = join(process.cwd(), 'src/lib/admin/require-admin.ts');
    const source = readFileSync(requireAdminPath, 'utf8');

    expect(source).toMatch(/import\s+['"]server-only['"]/);
  });
});
