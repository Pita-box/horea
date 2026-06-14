'use server';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { loadPlanFeatureMatrix, planHasFeature } from '@/lib/plans/feature-matrix';
import type { ClientSearchResponse } from '@/lib/search/types';
import { SEARCH_MIN_QUERY_LENGTH } from '@/lib/search/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const CLIENT_RESULT_LIMIT = 6;

type ClientRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

/** Odstraní znaky, které by rozbily PostgREST `or`/`ilike` filtr. */
function sanitizeQuery(query: string): string {
  return query.replace(/[%,()*]/g, ' ').trim();
}

/**
 * Vyhledá klienty podniku přihlášeného majitele podle jména, e-mailu nebo telefonu.
 * Tenant izolaci zajišťuje `business_id` + RLS. Dostupnost řídí matice entitlements
 * (`plan_features` → `planHasFeature(..., 'client_search')`), kterou spravuje admin.
 */
export async function searchClientsAction(rawQuery: string): Promise<ClientSearchResponse> {
  const query = sanitizeQuery(rawQuery);
  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return { ok: true, results: [] };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: 'unauthorized' };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, reason: 'error' };
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('business_id', business.id)
    .maybeSingle<{ plan: SubscriptionPlan | null }>();

  // Gating dle matice entitlements (admin nastavuje per tarif). Free / bez tarifu
  // (plan = null) zatím neomezujeme; placené tarify respektují matici `client_search`.
  const plan = subscription?.plan ?? null;
  if (plan !== null) {
    const matrix = await loadPlanFeatureMatrix(createAdminClient());
    if (!planHasFeature(matrix, plan, 'client_search')) {
      return { ok: false, reason: 'locked' };
    }
  }

  const pattern = `%${query}%`;
  const { data: rows, error: clientsError } = await supabase
    .from('clients')
    .select('id,name,email,phone')
    .eq('business_id', business.id)
    .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
    .order('name', { ascending: true })
    .limit(CLIENT_RESULT_LIMIT)
    .returns<ClientRow[]>();

  if (clientsError) {
    return { ok: false, reason: 'error' };
  }

  return {
    ok: true,
    results: rows.map((row) => ({
      id: row.id,
      group: 'clients' as const,
      title: row.name ?? 'Neznámý klient',
      subtitle: row.email ?? row.phone ?? undefined,
      href: `/dashboard/clients/${row.id}`,
    })),
  };
}
