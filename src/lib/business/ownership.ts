import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Vrací `true`, pokud je aktuálně přihlášený uživatel majitelem daného podniku.
 *
 * Čte session přes cookies (`createClient`) → render/akce je dynamická. Vlastnictví
 * se ověří admin klientem (service role) proti `businesses.owner_user_id`. Slouží
 * k „owner náhledu" nepublikovaného profilu (plný profil + náhled rezervace, ale
 * bez dokončení) a k povolení výpočtu termínů i pro nepublikovaný podnik.
 */
export async function viewerOwnsBusiness(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('businesses')
    .select('owner_user_id')
    .eq('id', businessId)
    .maybeSingle<{ owner_user_id: string }>();

  return data?.owner_user_id === user.id;
}
