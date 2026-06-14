import type { SubscriptionStatus } from '@/lib/auth/free-user-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AppUserGuardState = {
  isAdmin: boolean;
  dpaVersionAccepted: string | null;
  hasBusiness: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  draftCurrentStep: number | null;
};

/**
 * Zjistí stav aplikačního uživatele potřebný pro access guard (admin, DPA verze,
 * existence podniku, stav předplatného, krok onboardingu). Vrací `null`, pokud
 * profil chybí nebo selže DB dotaz — volající to interpretuje jako fail-closed
 * (middleware → redirect na `/error`). Sdíleno mezi middlewarem a `/error` stránkou.
 */
export async function resolveAppUserGuardState(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppUserGuardState | null> {
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_admin,dpa_version_accepted')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  const isAdmin = profile.is_admin === true;
  const dpaVersionAccepted =
    typeof profile.dpa_version_accepted === 'string' ? profile.dpa_version_accepted : null;

  if (isAdmin) {
    return {
      isAdmin,
      dpaVersionAccepted,
      hasBusiness: false,
      subscriptionStatus: null,
      draftCurrentStep: null,
    };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (businessError) {
    return null;
  }

  if (business?.id) {
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('business_id', business.id)
      .maybeSingle();

    if (subscriptionError) {
      return null;
    }

    return {
      isAdmin,
      dpaVersionAccepted,
      hasBusiness: true,
      subscriptionStatus: (subscription?.status as SubscriptionStatus | undefined) ?? null,
      draftCurrentStep: null,
    };
  }

  const { data: draft, error: draftError } = await supabase
    .from('onboarding_drafts')
    .select('current_step')
    .eq('user_id', userId)
    .maybeSingle();

  if (draftError) {
    return null;
  }

  return {
    isAdmin,
    dpaVersionAccepted,
    hasBusiness: false,
    subscriptionStatus: null,
    draftCurrentStep: typeof draft?.current_step === 'number' ? draft.current_step : null,
  };
}
