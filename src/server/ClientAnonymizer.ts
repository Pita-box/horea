'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Client_Anonymizer — server action provádějící GDPR výmaz klienta při zachování
 * slotů pro historii obsazenosti (R16). Vlastní anonymizace rezervací + smazání
 * klienta probíhá ATOMICKY v jedné DB transakci uvnitř RPC `anonymize_client`
 * (migrace 0023) — TS vrstva jen ověří přihlášení a vlastnictví podniku, zavolá
 * RPC přes service role klíč a zaloguje výsledek bez PII (R16.5).
 *
 * Ownership (R1.4, R1.5): `business_id` se odvozuje z přihlášeného uživatele
 * (`businesses.owner_user_id = user.id`) pod uživatelským JWT a předává do RPC.
 * Funkce filtruje výhradně na tento `business_id`, takže cizí `clientId` nic
 * neanonymizuje ani nesmaže (vrátí 0 a žádný smazaný řádek).
 */

export type AnonymizeClientResult = { ok: true } | { ok: false; message: string };

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  failed: 'Klienta se nepodařilo smazat. Zkuste to prosím znovu.',
} as const;

type AnonymizeRpcRow = {
  anonymized_count: number | null;
};

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

export async function anonymizeClient(clientId: string): Promise<AnonymizeClientResult> {
  // (1) Přihlášení + odvození podniku majitele pod uživatelským JWT.
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  const businessId = business.id;

  // (2) Server kontext: service role klíč pro atomické RPC volání.
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, message: MESSAGES.failed };
  }

  // (3) Atomická anonymizace + smazání klienta v jedné transakci (R16.2).
  const { data, error } = await admin.rpc('anonymize_client', {
    p_business_id: businessId,
    p_client_id: clientId,
  });

  if (error) {
    await safeLog('client_anonymize_failed', { businessId, userId: user.id, clientId });
    return { ok: false, message: MESSAGES.failed };
  }

  const row: AnonymizeRpcRow | undefined = Array.isArray(data) ? data[0] : data;
  const anonymizedCount = row?.anonymized_count ?? 0;

  // (4) Log s business_id, user_id, client_id a počtem anonymizovaných rezervací,
  //     bez jména/telefonu/e-mailu (R16.5).
  await safeLog('client_anonymized', {
    businessId,
    userId: user.id,
    clientId,
    anonymized_count: anonymizedCount,
    action_type: 'anonymize_client',
  });

  return { ok: true };
}
