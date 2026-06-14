import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

import { CURRENT_DPA_VERSION } from './version';
import { needsReacceptance } from './state';

export { needsReacceptance, nextDpaAcceptanceState, type DpaAcceptanceState } from './state';

export async function recordAcceptance(userId: string, acceptedAt = new Date()): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('users')
    .select('dpa_version_accepted,dpa_accepted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !needsReacceptance(data.dpa_version_accepted)) {
    return;
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({
      dpa_version_accepted: CURRENT_DPA_VERSION,
      dpa_accepted_at: acceptedAt.toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }
}
