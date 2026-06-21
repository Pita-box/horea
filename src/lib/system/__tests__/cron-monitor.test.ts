// Feature: admin-system-tools — příkladové unit testy I/O funkce getCronStatuses.
//
// Ověřuje, že funkce pro každý ze 4 cron jobů přečte poslední běh z `cron_runs`
// (order by started_at desc limit 1) a namapuje ho na ne-PII `CronRunRecord`,
// že job bez záznamu dá `lastRun: null` („bez zaznamenaného běhu"), a že
// jakákoli chyba dotazu způsobí fallback na celé `null` (R13.4). Také ověřuje,
// že výsledek nese jen ne-PII pole.
// Validates: Requirements 11.1, 11.2, 11.3, 13.4

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CronJobName } from '@/lib/system/cron-schedule';

// Zachycené argumenty volání mock klienta — pro ověření tvaru dotazu (R11.1).
const fromCalls = vi.hoisted(() => [] as string[]);
const selectCalls = vi.hoisted(() => [] as string[]);
const orderCalls = vi.hoisted(() => [] as { column: string; options: unknown }[]);
const limitCalls = vi.hoisted(() => [] as number[]);

// Řízené výsledky `from().select().eq().order().limit()` per job — měníme je v testech.
// Klíč je název jobu (zachycený z `.eq('job', <job>)`), hodnota je `{ data, error }`.
const resultsByJob = vi.hoisted(
  () => ({ value: {} as Record<string, { data: unknown; error: unknown }> }),
);

// Mock service-role klienta: chainovatelný builder, kde `.limit()` rozhodne podle
// jobu zachyceného v `.eq('job', <job>)`, jaký řízený výsledek vrátit.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      // Stav buildu pro tento dotaz — drží zachycený job mezi voláními v chainu.
      const queryState: { job: string | null } = { job: null };
      const builder = {
        select: (columns: string) => {
          selectCalls.push(columns);
          return builder;
        },
        eq: (column: string, value: string) => {
          if (column === 'job') {
            queryState.job = value;
          }
          return builder;
        },
        order: (column: string, options: unknown) => {
          orderCalls.push({ column, options });
          return builder;
        },
        limit: (count: number) => {
          limitCalls.push(count);
          const job = queryState.job ?? '';
          // Výchozí (nenastaveno) → prázdný výsledek bez chyby.
          const result = resultsByJob.value[job] ?? { data: [], error: null };
          return Promise.resolve(result);
        },
      };
      return builder;
    },
  }),
}));

import { getCronStatuses } from '../cron-monitor';

// Čtyři monitorované joby (musí odpovídat pořadí v cron-monitor.ts).
const JOBS: CronJobName[] = ['cleanup', 'billing', 'warnings', 'email-retry'];

// Pomocný řádek `cron_runs` (ne-PII) pro daný job.
function row(job: CronJobName, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${job}`,
    job,
    started_at: '2024-06-01T03:00:00.000Z',
    finished_at: '2024-06-01T03:00:05.000Z',
    status: 'ok',
    trigger: 'scheduled',
    detail: { processed: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  fromCalls.length = 0;
  selectCalls.length = 0;
  orderCalls.length = 0;
  limitCalls.length = 0;
  resultsByJob.value = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getCronStatuses — tvar dotazu (R11.1)', () => {
  it('pro každý ze 4 jobů čte cron_runs s order by started_at desc limit 1', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [], error: null };
    }

    await getCronStatuses();

    // Právě 4 dotazy, všechny do tabulky cron_runs.
    expect(fromCalls).toEqual(['cron_runs', 'cron_runs', 'cron_runs', 'cron_runs']);
    // Každý dotaz řadí podle started_at sestupně a bere jen poslední běh.
    expect(orderCalls).toHaveLength(4);
    for (const call of orderCalls) {
      expect(call.column).toBe('started_at');
      expect(call.options).toEqual({ ascending: false });
    }
    expect(limitCalls).toEqual([1, 1, 1, 1]);
  });
});

describe('getCronStatuses — poslední běh per job (R11.1, R11.2)', () => {
  it('namapuje poslední běh každého jobu na ne-PII CronRunRecord', async () => {
    resultsByJob.value = {
      cleanup: { data: [row('cleanup', { trigger: 'manual', detail: { deleted: 7 } })], error: null },
      billing: { data: [row('billing', { status: 'error', detail: null })], error: null },
      warnings: { data: [row('warnings')], error: null },
      'email-retry': {
        data: [row('email-retry', { finished_at: null, status: 'ok' })],
        error: null,
      },
    };

    const result = await getCronStatuses();

    expect(result).not.toBeNull();
    expect(result).toHaveLength(4);

    const byJob = Object.fromEntries(result!.map((s) => [s.job, s]));

    // cleanup — manuální spuštění, číselný detail.
    expect(byJob.cleanup.lastRun).toEqual({
      id: 'id-cleanup',
      job: 'cleanup',
      startedAt: '2024-06-01T03:00:00.000Z',
      finishedAt: '2024-06-01T03:00:05.000Z',
      status: 'ok',
      trigger: 'manual',
      detail: { deleted: 7 },
    });

    // billing — chybový status se zachová, detail může být null.
    expect(byJob.billing.lastRun).toMatchObject({
      job: 'billing',
      status: 'error',
      trigger: 'scheduled',
      detail: null,
    });

    // email-retry — dosud neukončený běh má finishedAt null.
    expect(byJob['email-retry'].lastRun).toMatchObject({
      job: 'email-retry',
      finishedAt: null,
      status: 'ok',
    });
  });

  it('neznámý status/trigger se mapuje na bezpečné výchozí hodnoty (ok/scheduled)', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [], error: null };
    }
    resultsByJob.value.cleanup = {
      data: [row('cleanup', { status: 'whatever', trigger: 'bogus' })],
      error: null,
    };

    const result = await getCronStatuses();

    const cleanup = result!.find((s) => s.job === 'cleanup');
    expect(cleanup!.lastRun).toMatchObject({ status: 'ok', trigger: 'scheduled' });
  });
});

describe('getCronStatuses — bez zaznamenaného běhu (R11.3)', () => {
  it('job bez záznamu (prázdné pole) dá lastRun: null', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [], error: null };
    }
    // Jen cleanup má běh; ostatní jsou prázdné.
    resultsByJob.value.cleanup = { data: [row('cleanup')], error: null };

    const result = await getCronStatuses();

    expect(result).not.toBeNull();
    const byJob = Object.fromEntries(result!.map((s) => [s.job, s]));

    expect(byJob.cleanup.lastRun).not.toBeNull();
    expect(byJob.billing.lastRun).toBeNull();
    expect(byJob.warnings.lastRun).toBeNull();
    expect(byJob['email-retry'].lastRun).toBeNull();
  });

  it('všechny joby bez záznamu dají čtyři položky s lastRun: null', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [], error: null };
    }

    const result = await getCronStatuses();

    expect(result).toHaveLength(4);
    expect(result!.every((s) => s.lastRun === null)).toBe(true);
    expect(result!.map((s) => s.job)).toEqual(JOBS);
  });
});

describe('getCronStatuses — fallback při nedostupnosti (R13.4)', () => {
  it('vrací null, když kterýkoli dotaz vrátí chybu', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [row(job)], error: null };
    }
    // Jediný job (warnings) selže → celá sekce je nedostupná.
    resultsByJob.value.warnings = { data: null, error: { message: 'spojení selhalo' } };

    const result = await getCronStatuses();

    expect(result).toBeNull();
  });
});

describe('getCronStatuses — žádné PII ve výstupu (R13.4 / ne-PII kontrakt)', () => {
  it('serializovaný výsledek nese jen ne-PII pole', async () => {
    for (const job of JOBS) {
      resultsByJob.value[job] = { data: [row(job)], error: null };
    }

    const result = await getCronStatuses();
    const allowedKeys = new Set([
      'job',
      'lastRun',
      'id',
      'startedAt',
      'finishedAt',
      'status',
      'trigger',
      'detail',
      'processed',
    ]);

    // Projdi všechny klíče napříč výsledkem a ověř, že žádný není mimo allowlist.
    const seenKeys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        // Pole procházíme po prvcích — indexy nejsou doménové klíče.
        for (const item of value) {
          walk(item);
        }
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          seenKeys.add(key);
          walk(child);
        }
      }
    };
    walk(result);

    for (const key of seenKeys) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});
