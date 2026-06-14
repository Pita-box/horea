import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import { overrideSubscription, suspendBusiness } from '@/lib/admin/subscription-override';

/**
 * Unit test override předplatného a pozastavení podniku (task 10.3 — R5.1, R5.2,
 * R5.5, R5.7).
 *
 * Wrappery `overrideSubscription` / `suspendBusiness` delegují atomickou „akce +
 * auditní záznam" na plpgsql funkce (`admin_override_subscription`,
 * `admin_suspend_business`). Jediná reálně testovatelná TS logika je tedy:
 *  - předání actora a správných parametrů do RPC (cílové `plan`/`status`/
 *    `current_period_end`; pozastavení → `is_published=false`),
 *  - mapování návratu RPC: ok / `not_found` při prázdném výsledku / chyba.
 *
 * RPC se mockuje (žádná reálná DB), ve stylu existujících server testů.
 */

type RpcResponse = { data: unknown; error: { message: string } | null };

/** Fake Supabase klient, který zaznamená volání `rpc` a vrátí připravenou odpověď. */
function makeRpcClient(response: RpcResponse) {
  const rpc = vi.fn(async () => response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('overrideSubscription (R5.1, R5.2, R5.7)', () => {
  it('předá actora a cílové hodnoty plan/status/current_period_end do RPC', async () => {
    const { client, rpc } = makeRpcClient({
      data: {
        subscription_id: 's-1',
        business_id: 'b-1',
        plan: 'max',
        status: 'active',
        current_period_end: '2025-01-31T00:00:00.000Z',
      },
      error: null,
    });

    await overrideSubscription(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      plan: 'max',
      status: 'active',
      currentPeriodEnd: new Date('2025-01-31T00:00:00.000Z'),
    });

    expect(rpc).toHaveBeenCalledWith('admin_override_subscription', {
      p_actor_user_id: 'admin-1',
      p_subscription_id: 's-1',
      p_plan: 'max',
      p_status: 'active',
      p_current_period_end: '2025-01-31T00:00:00.000Z',
    });
  });

  it('předá null pro plan i current_period_end beze změny', async () => {
    const { client, rpc } = makeRpcClient({
      data: { subscription_id: 's-1', business_id: 'b-1', plan: null, status: 'free', current_period_end: null },
      error: null,
    });

    await overrideSubscription(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      plan: null,
      status: 'free',
      currentPeriodEnd: null,
    });

    expect(rpc).toHaveBeenCalledWith('admin_override_subscription', {
      p_actor_user_id: 'admin-1',
      p_subscription_id: 's-1',
      p_plan: null,
      p_status: 'free',
      p_current_period_end: null,
    });
  });

  it('mapuje úspěšný řádek na ok výsledek s perzistovanými hodnotami', async () => {
    const { client } = makeRpcClient({
      data: [
        {
          subscription_id: 's-1',
          business_id: 'b-1',
          plan: 'pokrocily',
          status: 'grace_period',
          current_period_end: '2025-02-28T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const result = await overrideSubscription(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      plan: 'pokrocily',
      status: 'grace_period',
      currentPeriodEnd: '2025-02-28T00:00:00.000Z',
    });

    expect(result).toEqual({
      ok: true,
      subscriptionId: 's-1',
      businessId: 'b-1',
      plan: 'pokrocily',
      status: 'grace_period',
      currentPeriodEnd: '2025-02-28T00:00:00.000Z',
    });
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: null, error: null });

    const result = await overrideSubscription(client, {
      actorUserId: 'admin-1',
      subscriptionId: 'neznamy',
      plan: 'start',
      status: 'active',
      currentPeriodEnd: null,
    });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('chyba RPC → override_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'transakce selhala' } });

    const result = await overrideSubscription(client, {
      actorUserId: 'admin-1',
      subscriptionId: 's-1',
      plan: 'start',
      status: 'active',
      currentPeriodEnd: null,
    });

    expect(result).toEqual({ ok: false, error: 'override_failed' });
  });
});

describe('suspendBusiness (R5.5, R5.7)', () => {
  it('předá actora a cílový podnik do RPC admin_suspend_business', async () => {
    const { client, rpc } = makeRpcClient({
      data: { business_id: 'b-1', is_published: false },
      error: null,
    });

    await suspendBusiness(client, { actorUserId: 'admin-1', businessId: 'b-1' });

    expect(rpc).toHaveBeenCalledWith('admin_suspend_business', {
      p_actor_user_id: 'admin-1',
      p_business_id: 'b-1',
    });
  });

  it('úspěch → is_published nastaveno na false', async () => {
    const { client } = makeRpcClient({
      data: [{ business_id: 'b-1', is_published: false }],
      error: null,
    });

    const result = await suspendBusiness(client, { actorUserId: 'admin-1', businessId: 'b-1' });

    expect(result).toEqual({ ok: true, businessId: 'b-1', isPublished: false });
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: [], error: null });

    const result = await suspendBusiness(client, { actorUserId: 'admin-1', businessId: 'neznamy' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('chyba RPC → suspend_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'selhání' } });

    const result = await suspendBusiness(client, { actorUserId: 'admin-1', businessId: 'b-1' });

    expect(result).toEqual({ ok: false, error: 'suspend_failed' });
  });
});
