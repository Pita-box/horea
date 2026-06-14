import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyPlanChange,
  cancelPlanChange,
  requestPlanChange,
} from '@/lib/subscription/plan-change';

/**
 * Unit test změny tarifu (task 13.3 — R8.1, R8.2, R8.3, R8.4).
 *
 * Ověřuje:
 *  - {@link requestPlanChange}: zaznamená `pending_plan_change` BEZ změny `plan`
 *    (žádná prorace, R8.1/R8.3),
 *  - {@link applyPlanChange}: na konci období nastaví `plan` na cílový a vynuluje
 *    nevyřízenou změnu (R8.2); bez nevyřízené změny nic nemění,
 *  - {@link cancelPlanChange}: zruší nevyřízenou změnu (R8.4).
 *
 * Supabase je mockovaný — zachycujeme update payloady, abychom ověřili, že se
 * `plan` nemění při pouhé žádosti.
 */

type Response = { data: unknown; error: unknown };

/**
 * Fake Supabase, kde každé `from()` vrátí chainable builder rozhodující
 * `maybeSingle()` podle pořadí volání `from()`. Update payloady se zaznamenávají.
 */
function makeSupabase(responses: Response[], updatePayloads: Record<string, unknown>[]): SupabaseClient {
  let index = 0;
  return {
    from: () => {
      const response = responses[index] ?? { data: null, error: null };
      index += 1;
      const builder: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => response,
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('requestPlanChange (R8.1, R8.3)', () => {
  it('zaznamená pending_plan_change bez změny plan (žádná prorace)', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase([{ data: { pending_plan_change: 'max' }, error: null }], updates);

    const result = await requestPlanChange(supabase, 'sub-1', 'max');

    expect(result).toEqual({ ok: true, pendingPlanChange: 'max' });
    // Klíčové: update nastavil JEN pending_plan_change, nikoli plan (žádná prorace).
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ pending_plan_change: 'max' });
    expect(updates[0]).not.toHaveProperty('plan');
  });

  it('předplatné mimo stav active → not_active', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase([{ data: null, error: null }], updates);

    const result = await requestPlanChange(supabase, 'sub-1', 'start');

    expect(result).toEqual({ ok: false, error: 'not_active' });
  });
});

describe('cancelPlanChange (R8.4)', () => {
  it('zruší nevyřízenou změnu nastavením pending_plan_change = null', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase([{ data: { pending_plan_change: null }, error: null }], updates);

    const result = await cancelPlanChange(supabase, 'sub-1');

    expect(result).toEqual({ ok: true, pendingPlanChange: null });
    expect(updates[0]).toEqual({ pending_plan_change: null });
  });
});

describe('applyPlanChange (R8.2)', () => {
  it('s nevyřízenou změnou nastaví plan na cílový a vynuluje pending_plan_change', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase(
      [
        { data: { plan: 'start', pending_plan_change: 'max' }, error: null }, // select
        { data: { plan: 'max' }, error: null }, // update
      ],
      updates,
    );

    const result = await applyPlanChange(supabase, 'sub-1');

    expect(result).toEqual({ ok: true, applied: true, plan: 'max' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ plan: 'max', pending_plan_change: null });
  });

  it('bez nevyřízené změny nic nemění (applied = false)', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase([{ data: { plan: 'start', pending_plan_change: null }, error: null }], updates);

    const result = await applyPlanChange(supabase, 'sub-1');

    expect(result).toEqual({ ok: true, applied: false, plan: 'start' });
    expect(updates).toHaveLength(0);
  });

  it('neexistující předplatné → not_found', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase([{ data: null, error: null }], updates);

    const result = await applyPlanChange(supabase, 'sub-1');

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});
