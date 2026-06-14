import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { cancelAutoRenew, enableAutoRenew } from '@/lib/subscription/auto-renew';

/**
 * Unit test přepínání automatické obnovy (task 14.2 — R11.1, R11.4).
 *
 * Ověřuje:
 *  - {@link cancelAutoRenew}: `auto_renew = false`, status zůstává `active`
 *    (funkce přepíná jen příznak, status se nedotýká, R11.1),
 *  - {@link enableAutoRenew}: `auto_renew = true` (R11.4),
 *  - obě operace fungují jen nad předplatným ve stavu `active` → jinak `not_active`.
 *
 * Supabase je mockovaný — zachycujeme update payloady k ověření, že se mění
 * pouze `auto_renew` a nikoli `status`.
 */

type Response = { data: unknown; error: unknown };

/** Fake Supabase: chainable builder, `maybeSingle()` vrátí daný řádek; update se zaznamená. */
function makeSupabase(response: Response, updatePayloads: Record<string, unknown>[]): SupabaseClient {
  return {
    from: () => {
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

describe('cancelAutoRenew (R11.1)', () => {
  it('nastaví auto_renew = false, status nechává beze změny', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase({ data: { auto_renew: false }, error: null }, updates);

    const result = await cancelAutoRenew(supabase, 'sub-1');

    expect(result).toEqual({ ok: true, autoRenew: false });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ auto_renew: false });
    // Funkce status nemění — žádný `status` v update payloadu.
    expect(updates[0]).not.toHaveProperty('status');
  });

  it('předplatné mimo stav active → not_active', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase({ data: null, error: null }, updates);

    const result = await cancelAutoRenew(supabase, 'sub-1');

    expect(result).toEqual({ ok: false, error: 'not_active' });
  });
});

describe('enableAutoRenew (R11.4)', () => {
  it('nastaví auto_renew = true', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase({ data: { auto_renew: true }, error: null }, updates);

    const result = await enableAutoRenew(supabase, 'sub-1');

    expect(result).toEqual({ ok: true, autoRenew: true });
    expect(updates[0]).toEqual({ auto_renew: true });
  });

  it('chyba zápisu → write_failed', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = makeSupabase({ data: null, error: { message: 'boom' } }, updates);

    const result = await enableAutoRenew(supabase, 'sub-1');

    expect(result).toEqual({ ok: false, error: 'write_failed' });
  });
});
