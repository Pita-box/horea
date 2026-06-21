// Feature: admin-system-tools — integrační test server action recheckHealth (task 26.11).
//
// Ověřuje on-demand opětovné spuštění health checků (R21.1, R21.2):
//  - admin → `runHealthChecks` je znovu spuštěn a action vrátí `{ ok: true, report }`
//    s novým `HealthReport` včetně aktualizovaného `checkedAt`,
//  - výsledek nese u každé služby JEN klíče `service`/`label`/`status`/`latencyMs`/
//    `errorKind` (žádná Secret_Value),
//  - ne-admin → `{ ok: false }` a `runHealthChecks` se NEvolá (R21.4, defense in depth).
// Validates: Requirements 21.1, 21.2

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthReport } from '@/lib/system/health';

// requireAdmin mockujeme jako spy — jednotlivé testy si nastaví admin/ne-admin.
const requireAdminMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: requireAdminMock,
}));

// runHealthChecks mockujeme řízeným HealthReportem — odpojí reálné síťové probe.
const runHealthChecksMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/system/health', () => ({
  runHealthChecks: runHealthChecksMock,
}));

// serverLog jako spy — odpojí reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { recheckHealth } from '../actions';

const NON_ADMIN_MESSAGE = 'Nemáte oprávnění k provedení této akce.';

// Pevný čas kontroly pro deterministické porovnání `checkedAt`.
const CHECKED_AT = '2024-06-01T12:00:00.000Z';

// Řízený HealthReport: 6 služeb (pořadí jako reálné PROBES) + aggregate + checkedAt.
// Záměrně bez jakékoli Secret_Value — jen bezpečná pole.
function makeReport(): HealthReport {
  return {
    aggregate: 'down',
    services: [
      { service: 'supabase', label: 'Supabase', status: 'ok', latencyMs: 42, errorKind: null },
      { service: 'resend', label: 'Resend', status: 'ok', latencyMs: 88, errorKind: null },
      { service: 'smtp2go', label: 'SMTP2GO', status: 'degraded', latencyMs: 2200, errorKind: null },
      { service: 'gopay', label: 'GoPay', status: 'down', latencyMs: null, errorKind: 'timeout' },
      { service: 'r2', label: 'Cloudflare R2', status: 'ok', latencyMs: 120, errorKind: null },
      { service: 'google', label: 'Google', status: 'down', latencyMs: 510, errorKind: 'http_error' },
    ],
    checkedAt: CHECKED_AT,
  };
}

beforeEach(() => {
  requireAdminMock.mockResolvedValue({ ok: true, actorUserId: 'a', admin: {} });
  runHealthChecksMock.mockResolvedValue(makeReport());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('recheckHealth — admin znovu spustí health check (R21.1, R21.2)', () => {
  it('spustí runHealthChecks a vrátí { ok: true, report } s aktualizovaným checkedAt', async () => {
    const result = await recheckHealth();

    // Health check byl znovu spuštěn právě jednou.
    expect(runHealthChecksMock).toHaveBeenCalledTimes(1);

    // Vrácen je nový HealthReport s daným checkedAt.
    expect(result).toEqual({ ok: true, report: makeReport() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.checkedAt).toBe(CHECKED_AT);
    }
  });

  it('každý services[] prvek nese JEN service/label/status/latencyMs/errorKind (žádná Secret_Value)', async () => {
    const result = await recheckHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allowedKeys = ['service', 'label', 'status', 'latencyMs', 'errorKind'].sort();
    expect(result.report.services).toHaveLength(6);
    for (const entry of result.report.services) {
      // Žádné nadbytečné/citlivé klíče — striktně jen povolená pole.
      expect(Object.keys(entry).sort()).toEqual(allowedKeys);
    }
  });

  it('odráží nový běh — opětovné volání spustí runHealthChecks znovu', async () => {
    await recheckHealth();
    await recheckHealth();

    expect(runHealthChecksMock).toHaveBeenCalledTimes(2);
  });
});

describe('recheckHealth — ne-admin (R21.4, defense in depth)', () => {
  it('ne-admin → { ok: false } a runHealthChecks se NEvolá', async () => {
    requireAdminMock.mockResolvedValue({ ok: false, message: NON_ADMIN_MESSAGE });

    const result = await recheckHealth();

    expect(result).toEqual({ ok: false, message: NON_ADMIN_MESSAGE });
    expect(runHealthChecksMock).not.toHaveBeenCalled();
  });
});
