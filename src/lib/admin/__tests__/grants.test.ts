import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import { grantComp, grantFreeTrial } from '@/lib/admin/grants';

/**
 * Unit test cílových hodnot udělení Free_Trial / Comp_Ucet (task 11.3 — R5.3, R5.4).
 *
 * All-or-nothing atomicita (Property 6) žije v plpgsql funkcích, ne v TS. Tento
 * test ověřuje reálně testovatelnou TS logiku wrapperů:
 *  - `grantFreeTrial` volá RPC `admin_grant_free_trial` s actorem, předplatným a
 *    koncem zkušebního období (`trialEnd` jako ISO),
 *  - `grantComp` volá RPC `admin_grant_comp` s actorem a předplatným,
 *  - mapování návratu: ok (status + current_period_end) / `not_found` / `grant_failed`.
 *
 * RPC se mockuje (žádná reálná DB).
 */

type RpcResponse = { data: unknown; error: { message: string } | null };

function makeRpcClient(response: RpcResponse) {
  const rpc = vi.fn(async () => response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('grantFreeTrial (R5.3)', () => {
  it('volá admin_grant_free_trial s actorem, předplatným a koncem trialu (ISO)', async () => {
    const { client, rpc } = makeRpcClient({
      data: { subscription_id: 's-1', business_id: 'b-1', status: 'active', current_period_end: '2025-03-15T00:00:00.000Z' },
      error: null,
    });

    await grantFreeTrial(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      trialEnd: new Date('2025-03-15T00:00:00.000Z'),
    });

    expect(rpc).toHaveBeenCalledWith('admin_grant_free_trial', {
      p_actor_user_id: 'admin-1',
      p_subscription_id: 's-1',
      p_trial_end: '2025-03-15T00:00:00.000Z',
    });
  });

  it('úspěch → ok se stavem active a koncem zkušebního období', async () => {
    const { client } = makeRpcClient({
      data: [{ subscription_id: 's-1', business_id: 'b-1', status: 'active', current_period_end: '2025-03-15T00:00:00.000Z' }],
      error: null,
    });

    const result = await grantFreeTrial(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      trialEnd: '2025-03-15T00:00:00.000Z',
    });

    expect(result).toEqual({
      ok: true,
      subscriptionId: 's-1',
      businessId: 'b-1',
      status: 'active',
      currentPeriodEnd: '2025-03-15T00:00:00.000Z',
    });
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: null, error: null });

    const result = await grantFreeTrial(client, {
      actorUserId: 'admin-1',
      subscriptionId: 'neznamy',
      trialEnd: '2025-03-15T00:00:00.000Z',
    });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('chyba RPC → grant_failed (úplný rollback)', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'rollback' } });

    const result = await grantFreeTrial(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      trialEnd: '2025-03-15T00:00:00.000Z',
    });

    expect(result).toEqual({ ok: false, error: 'grant_failed' });
  });
});

describe('grantComp (R5.4)', () => {
  it('volá admin_grant_comp s actorem a předplatným (bez konce období)', async () => {
    const { client, rpc } = makeRpcClient({
      data: { subscription_id: 's-1', business_id: 'b-1', status: 'active', current_period_end: null },
      error: null,
    });

    await grantComp(client, { actorUserId: 'admin-1', subscriptionId: 's-1' });

    expect(rpc).toHaveBeenCalledWith('admin_grant_comp', {
      p_actor_user_id: 'admin-1',
      p_subscription_id: 's-1',
    });
  });

  it('úspěch → ok se stavem active (comp účet bez konce období)', async () => {
    const { client } = makeRpcClient({
      data: [{ subscription_id: 's-1', business_id: 'b-1', status: 'active', current_period_end: null }],
      error: null,
    });

    const result = await grantComp(client, { actorUserId: 'admin-1', subscriptionId: 's-1' });

    expect(result).toEqual({
      ok: true,
      subscriptionId: 's-1',
      businessId: 'b-1',
      status: 'active',
      currentPeriodEnd: null,
    });
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: [], error: null });

    const result = await grantComp(client, { actorUserId: 'admin-1', subscriptionId: 'neznamy' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('chyba RPC → grant_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'selhání' } });

    const result = await grantComp(client, { actorUserId: 'admin-1', subscriptionId: 's-1' });

    expect(result).toEqual({ ok: false, error: 'grant_failed' });
  });
});
