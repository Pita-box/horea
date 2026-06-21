import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integrační testy renderu server komponenty `/admin/system` (`AdminSystemPage`)
 * — feature `admin-system-tools`, task 28.2.
 *
 * JAK TESTUJEME RSC: `AdminSystemPage` je `async` server komponenta. V projektu
 * zatím neexistuje setup pro RSC testy, takže komponentu vykreslíme přímo
 * vzorem `render(await AdminSystemPage())` — async funkci zavoláme, počkáme na
 * její výsledek (React element) a ten předáme `render` z `@testing-library/react`
 * (běží v jsdom dle `vitest.config.ts`).
 *
 * DETERMINISMUS A BEZ I/O: všechny gettery (`runHealthChecks`, `getDeployInfo`,
 * `getOutboxStatus`, `getBackupStatus`, `getWebhookFreshness`,
 * `getOperationalMetrics`, `getConfigReport`, `getCronStatuses`) i ověření
 * `requireAdmin` jsou mockované přes `vi.hoisted` + `vi.mock`. Klientské panely
 * (`RevalidatePanel`, `HealthRecheckButton`, `CronTriggerPanel`,
 * `PruneCronRunsPanel`, `TestEmailPanel`) jsou nahrazeny prostými stuby, ať
 * render server komponenty nezávisí na klientských hooku.
 *
 * Čisté moduly rozvrhu cronů (`@/lib/system/cron-schedule`) a `@/lib/datetime`
 * záměrně NEmockujeme — jsou deterministické a tvoří součást renderu (rozvrh
 * v tabulce, „žádný drift", formát času).
 */

// Mock funkce sdílené napříč testy (mění se v `beforeEach` / jednotlivých testech).
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  runHealthChecks: vi.fn(),
  getDeployInfo: vi.fn(),
  getOutboxStatus: vi.fn(),
  getBackupStatus: vi.fn(),
  getWebhookFreshness: vi.fn(),
  getOperationalMetrics: vi.fn(),
  getConfigReport: vi.fn(),
  getCronStatuses: vi.fn(),
}));

// Gettery a ověření admina → deterministické mocky bez I/O.
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/system/health', () => ({ runHealthChecks: mocks.runHealthChecks }));
vi.mock('@/lib/system/build-info', () => ({ getDeployInfo: mocks.getDeployInfo }));
vi.mock('@/lib/system/outbox-status', () => ({ getOutboxStatus: mocks.getOutboxStatus }));
vi.mock('@/lib/system/backup-status', () => ({ getBackupStatus: mocks.getBackupStatus }));
vi.mock('@/lib/system/webhook-freshness', () => ({
  getWebhookFreshness: mocks.getWebhookFreshness,
  WEBHOOK_FRESHNESS_THRESHOLD_HOURS: 48,
}));
vi.mock('@/lib/system/metrics', () => ({ getOperationalMetrics: mocks.getOperationalMetrics }));
vi.mock('@/lib/system/config-report', () => ({ getConfigReport: mocks.getConfigReport }));
vi.mock('@/lib/system/cron-monitor', () => ({ getCronStatuses: mocks.getCronStatuses }));

// Klientské panely → prosté stuby (render server komponenty na nich nezávisí).
vi.mock('../RevalidatePanel', () => ({
  RevalidatePanel: () => <div data-testid="revalidate-panel" />,
}));
vi.mock('../HealthRecheckButton', () => ({
  HealthRecheckButton: () => <div data-testid="health-recheck" />,
}));
vi.mock('../CronTriggerPanel', () => ({
  CronTriggerPanel: () => <div data-testid="cron-trigger" />,
}));
vi.mock('../PruneCronRunsPanel', () => ({
  PruneCronRunsPanel: () => <div data-testid="prune-cron" />,
}));
vi.mock('../TestEmailPanel', () => ({
  TestEmailPanel: () => <div data-testid="test-email" />,
}));

import AdminSystemPage from '../page';

/** Šťastná cesta: validní data pro každou sekci. */
function setHappyDefaults() {
  mocks.requireAdmin.mockResolvedValue({
    ok: true,
    actorUserId: 'admin-1',
    admin: {},
  });
  mocks.runHealthChecks.mockResolvedValue({
    aggregate: 'ok',
    services: [
      { service: 'google', label: 'Google', status: 'ok', latencyMs: 10, errorKind: null },
    ],
    checkedAt: '2024-01-01T00:00:00.000Z',
  });
  mocks.getDeployInfo.mockReturnValue({
    commitSha: 'abc1234',
    gitRef: 'main',
    environment: 'production',
    deployId: 'dpl_test',
    nodeVersion: 'v22.12.0',
  });
  mocks.getOutboxStatus.mockResolvedValue({
    counts: { pending: 3, sent: 42, dead: 1 },
    oldestPendingAt: '2024-01-01T00:00:00.000Z',
    readyToRetry: 2,
  });
  mocks.getBackupStatus.mockReturnValue({
    configured: true,
    driveStatus: 'ok',
    info:
      'Automatizovaná zálohovací úloha není v této aplikaci implementována a ' +
      'nevyskytuje se mezi registrovanými cronovými úlohami. Stránka proto ' +
      'nezobrazuje čas poslední zálohy ani neumožňuje ruční spuštění zálohy.',
  });
  mocks.getWebhookFreshness.mockResolvedValue({
    hasActivity: true,
    lastActivityAt: '2024-01-01T00:00:00.000Z',
    stale: false,
    isProxy: true,
  });
  mocks.getOperationalMetrics.mockResolvedValue({
    db: { businesses: 5, reservations: 10, clients: 7 },
    storage: { available: false },
  });
  mocks.getConfigReport.mockReturnValue({
    logLevel: 'info',
    env: [
      { key: 'NEXT_PUBLIC_SUPABASE_URL', isSet: true },
      { key: 'CRON_SECRET', isSet: false },
    ],
    logLocationInfo:
      'Aplikační logy jdou do výstupu konzole, který čtou Vercel logy a log drains. ' +
      'Logy se neukládají do perzistentního souborového úložiště a aplikace je nemaže.',
  });
  mocks.getCronStatuses.mockResolvedValue([
    {
      job: 'billing',
      lastRun: {
        id: 'run-1',
        job: 'billing',
        startedAt: '2024-01-01T00:00:00.000Z',
        finishedAt: '2024-01-01T00:01:00.000Z',
        status: 'ok',
        trigger: 'scheduled',
        detail: null,
      },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setHappyDefaults();
});

afterEach(() => {
  cleanup();
});

describe('AdminSystemPage (/admin/system) — render', () => {
  it('šťastná cesta: vykreslí všechny sekce s daty (R16, R17, R18, R20, R23, R7, R8, R9, R24)', async () => {
    render(await AdminSystemPage());

    // Nasazení: prostředí jako textový label (R16.3).
    expect(screen.getByText('Prostředí')).toBeTruthy();
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('abc1234')).toBeTruthy();

    // Outbox: počty + souvislost s /api/cron/email-retry (R17).
    expect(screen.getByText('3')).toBeTruthy(); // pending
    expect(screen.getByText('42')).toBeTruthy(); // sent
    expect(screen.getByText(/\/api\/cron\/email-retry/)).toBeTruthy();

    // Zálohy: text „job není implementován" + žádná akce ruční zálohy (R18.3, R18.4).
    expect(screen.getByText(/není v této aplikaci implementována/)).toBeTruthy();
    expect(screen.queryByText(/Spustit ruční zálohu/i)).toBeNull();

    // Webhook: proxy label + stav „čerstvé" (R20.2, R20.6).
    expect(screen.getByText('čerstvé')).toBeTruthy();
    expect(screen.getByText(/odvozenou \(proxy\)/)).toBeTruthy();

    // Metriky: počty + storage „nedostupné" (R23.1, R23.3).
    expect(screen.getByText('Počet podniků')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy(); // businesses
    expect(screen.getByText('nedostupné')).toBeTruthy(); // storage

    // Konfigurace: nastaveno/nenastaveno + log info (R7, R8).
    expect(screen.getByText('NEXT_PUBLIC_SUPABASE_URL')).toBeTruthy();
    expect(screen.getByText('nastaveno')).toBeTruthy();
    expect(screen.getByText('nenastaveno')).toBeTruthy();
    expect(screen.getByText(/Aplikační logy jdou do výstupu konzole/)).toBeTruthy();

    // Hranice auditu: odkaz na /admin/audit (R9).
    const auditLink = screen.getByRole('link', {
      name: 'Otevřít auditní stopu (/admin/audit)',
    });
    expect(auditLink.getAttribute('href')).toBe('/admin/audit');

    // Cron rozvrh + drift: tabulka s rozvrhem a „žádný drift" (R24).
    expect(screen.getByText('0 3 * * *')).toBeTruthy(); // rozvrh billing
    expect(screen.getByText(/žádný drift/)).toBeTruthy();

    // Klientské panely jsou vykreslené (stuby).
    expect(screen.getByTestId('revalidate-panel')).toBeTruthy();
    expect(screen.getByTestId('cron-trigger')).toBeTruthy();
  });

  it('fallbacky: null/„nedostupné" gettery zobrazí české hlášky a zbytek stránky funguje (R13.4, R17.7, R20.7, R23.5)', async () => {
    mocks.getOutboxStatus.mockResolvedValue(null);
    mocks.getWebhookFreshness.mockResolvedValue(null);
    mocks.getCronStatuses.mockResolvedValue(null);
    mocks.getOperationalMetrics.mockResolvedValue({
      db: null,
      storage: { available: false },
    });

    render(await AdminSystemPage());

    // České hlášky o nedostupnosti jednotlivých sekcí.
    expect(screen.getByText('Stav e-mailové fronty je momentálně nedostupný.')).toBeTruthy();
    expect(screen.getByText('Čerstvost webhooku je momentálně nedostupná.')).toBeTruthy();
    expect(screen.getByText('Metriky databáze jsou momentálně nedostupné.')).toBeTruthy();
    expect(screen.getByText('Stav cron úloh je momentálně nedostupný.')).toBeTruthy();

    // Zbytek stránky funguje: nasazení, audit odkaz, rozvrh cronu.
    expect(screen.getByText('production')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Otevřít auditní stopu (/admin/audit)' }),
    ).toBeTruthy();
    expect(screen.getByText('0 3 * * *')).toBeTruthy();
  });

  it('health throw: sekce stavu služeb zobrazí fallback, zbytek funguje (R13.4)', async () => {
    mocks.runHealthChecks.mockRejectedValue(new Error('probe selhal'));

    render(await AdminSystemPage());

    // Fallback sekce stavu služeb (loadHealthReport zachytí výjimku → null).
    expect(screen.getByText('Stav služeb je momentálně nedostupný.')).toBeTruthy();

    // Zbytek stránky funguje dál (defense in depth, izolace selhání).
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('čerstvé')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Otevřít auditní stopu (/admin/audit)' }),
    ).toBeTruthy();
  });
});
