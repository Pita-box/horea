'use server';

import { revalidatePublicPage } from '@/lib/revalidate';
import { serverLog } from '@/lib/log-server';
import { loadBusinessFeatureChecker } from '@/lib/plans/business-feature';
import type {
  GetSettingsResult,
  SettingKey,
  UpdateSettingResult,
} from '@/lib/settings/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';
const FEATURE_LOCKED_ERROR = 'Tato funkce není dostupná ve vašem tarifu.';

/** Mapování přepínače na entitlement (`plan_features`). */
const FEATURE_BY_KEY: Record<SettingKey, 'parallel_slots' | 'auto_approve'> = {
  allowParallelSlots: 'parallel_slots',
  autoApproveReservations: 'auto_approve',
};

// Mapování camelCase přepínačů na konkrétní sloupce tabulky `businesses`.
const COLUMN_BY_KEY: Record<SettingKey, 'allow_parallel_slots' | 'auto_approve_reservations'> = {
  allowParallelSlots: 'allow_parallel_slots',
  autoApproveReservations: 'auto_approve_reservations',
};

type BusinessContext = {
  business: {
    id: string;
    slug: string;
    allowParallelSlots: boolean;
    autoApproveReservations: boolean;
  };
  supabase: SupabaseClient;
  userId: string;
};

type BusinessRow = {
  id: string;
  slug: string;
  allow_parallel_slots: boolean;
  auto_approve_reservations: boolean;
};

async function logSettingsOperation(
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí blokovat hlavní DB operaci.
  }
}

async function getBusinessContext(): Promise<
  | {
      ok: true;
      context: BusinessContext;
    }
  | {
      ok: false;
      message: string;
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,slug,allow_parallel_slots,auto_approve_reservations')
    .eq('owner_user_id', user.id)
    .maybeSingle<BusinessRow>();

  if (businessError) {
    await logSettingsOperation('settings_business_lookup_failed', {
      error: businessError,
      userId: user.id,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!business) {
    return { ok: false, message: BUSINESS_MISSING_ERROR };
  }

  return {
    ok: true,
    context: {
      business: {
        id: business.id,
        slug: business.slug,
        allowParallelSlots: business.allow_parallel_slots,
        autoApproveReservations: business.auto_approve_reservations,
      },
      supabase,
      userId: user.id,
    },
  };
}

export async function getSettings(): Promise<GetSettingsResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return contextResult;
  }

  const { business } = contextResult.context;

  const has = await loadBusinessFeatureChecker(createAdminClient(), business.id);

  return {
    ok: true,
    settings: {
      allowParallelSlots: business.allowParallelSlots,
      autoApproveReservations: business.autoApproveReservations,
    },
    entitlements: {
      autoApprove: has('auto_approve'),
      parallelSlots: has('parallel_slots'),
    },
  };
}

export async function updateSetting(
  key: SettingKey,
  value: boolean,
): Promise<UpdateSettingResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const { business, supabase, userId } = contextResult.context;
  const column = COLUMN_BY_KEY[key];

  // Zapnutí funkce, kterou tarif nemá (`plan_features`), zablokujeme serverově —
  // i kdyby klient toggle obešel. Vypnutí (`false`) je vždy povolené.
  if (value === true) {
    const has = await loadBusinessFeatureChecker(createAdminClient(), business.id);
    if (!has(FEATURE_BY_KEY[key])) {
      return { ok: false, message: FEATURE_LOCKED_ERROR };
    }
  }

  // Defenzivní kontrola nad RLS: zapisujeme výhradně na řádek podniku
  // přihlášeného majitele (ověřený přes owner_user_id v getBusinessContext).
  const { error } = await supabase
    .from('businesses')
    .update({ [column]: value })
    .eq('id', business.id)
    .eq('owner_user_id', userId);

  if (error) {
    await logSettingsOperation('setting_update_failed', {
      businessId: business.id,
      error,
      setting: key,
      userId,
      value,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  await logSettingsOperation('setting_updated', {
    businessId: business.id,
    setting: key,
    userId,
    value,
  });
  revalidatePublicPage(business.slug);

  return { ok: true };
}
