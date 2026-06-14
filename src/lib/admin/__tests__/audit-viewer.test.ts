import { describe, expect, it } from 'vitest';

import { listAuditLog } from '@/lib/admin/audit-viewer';

import { makeFakeSupabase, type FakeRow } from './supabase-fake';

/**
 * Unit test prohlížení auditu (task 6.3 — R10.1, R10.2, R10.3, R10.4).
 *
 * Ověřuje:
 *  - sestupné řazení dle `created_at` (nejnovější nahoře, R10.1),
 *  - filtr dle typu akce (R10.2),
 *  - filtr dle časového rozsahu (R10.3),
 *  - filtr dle cílového objektu — `target_id` i `target_type` (R10.4),
 *  - normalizaci řádku (snake_case → camelCase) a propagaci chyby.
 *
 * Fake Supabase opravdu aplikuje `eq`/`gte`/`lte`/`order`.
 */

function row(overrides: Partial<FakeRow> & { id: string; created_at: string }): FakeRow {
  return {
    actor_user_id: 'admin-1',
    action_type: 'subscription_override',
    target_type: 'subscription',
    target_id: 'sub-1',
    before: null,
    after: null,
    ...overrides,
  };
}

const ROWS: FakeRow[] = [
  row({ id: 'a', created_at: '2024-06-01T10:00:00.000Z', action_type: 'coupon_create', target_type: 'coupon', target_id: 'c-1' }),
  row({ id: 'b', created_at: '2024-06-15T10:00:00.000Z', action_type: 'payment_match', target_type: 'payment', target_id: 'p-1' }),
  row({ id: 'c', created_at: '2024-06-30T10:00:00.000Z', action_type: 'subscription_override', target_type: 'subscription', target_id: 'sub-9' }),
];

describe('listAuditLog (R10.1 — sestupné řazení)', () => {
  it('vrací záznamy seřazené sestupně dle created_at', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });

    const records = await listAuditLog(supabase);

    expect(records.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    // Normalizace snake_case → camelCase.
    expect(records[0]).toMatchObject({
      id: 'c',
      actorUserId: 'admin-1',
      actionType: 'subscription_override',
      targetType: 'subscription',
      targetId: 'sub-9',
      createdAt: '2024-06-30T10:00:00.000Z',
    });
  });
});

describe('listAuditLog — filtry (R10.2, R10.3, R10.4)', () => {
  it('filtr dle typu akce (R10.2)', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });
    const records = await listAuditLog(supabase, { actionType: 'coupon_create' });
    expect(records.map((r) => r.id)).toEqual(['a']);
  });

  it('filtr dle časového rozsahu (R10.3)', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });
    const records = await listAuditLog(supabase, {
      createdFrom: '2024-06-10T00:00:00.000Z',
      createdTo: '2024-06-20T00:00:00.000Z',
    });
    expect(records.map((r) => r.id)).toEqual(['b']);
  });

  it('filtr dle typu cílového objektu (R10.4)', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });
    const records = await listAuditLog(supabase, { targetType: 'payment' });
    expect(records.map((r) => r.id)).toEqual(['b']);
  });

  it('filtr dle identifikátoru cílového objektu (R10.4)', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });
    const records = await listAuditLog(supabase, { targetId: 'sub-9' });
    expect(records.map((r) => r.id)).toEqual(['c']);
  });

  it('žádná shoda → prázdný seznam', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS });
    const records = await listAuditLog(supabase, { actionType: 'force_delete_business' });
    expect(records).toEqual([]);
  });
});

describe('listAuditLog — chyba čtení', () => {
  it('propaguje chybu jako výjimku', async () => {
    const supabase = makeFakeSupabase({ audit_log: ROWS }, 'audit_log');
    await expect(listAuditLog(supabase)).rejects.toThrow(/Načtení auditní stopy selhalo/);
  });
});
