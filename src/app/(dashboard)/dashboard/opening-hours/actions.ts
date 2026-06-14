'use server';

import { WEEK_DAYS } from '@/lib/onboarding/data';
import { openingHoursWeekSchema } from '@/lib/opening-hours/schema';
import type { OpeningHoursWeek } from '@/lib/opening-hours/schema';
import type { ListOpeningHoursResult, OpeningHoursActionResult } from '@/lib/opening-hours/types';
import { revalidatePublicPage } from '@/lib/revalidate';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodError } from 'zod';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';

type BusinessContext = {
  business: {
    id: string;
    slug: string;
  };
  supabase: SupabaseClient;
  userId: string;
};

type OpeningHoursRow = {
  day_of_week: number;
  opens_at: string;
  closes_at: string;
};

function formatTime(value: string): string {
  // Postgres `time` is returned as `HH:MM:SS`; the UI works with `HH:mm`.
  return value.slice(0, 5);
}

async function logOpeningHoursOperation(
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logging is best-effort and must not block the main DB operation.
  }
}

function validationError(error: ZodError, week: OpeningHoursWeek): OpeningHoursActionResult {
  const fieldErrors: Record<number, string> = {};
  let generalMessage: string | undefined;

  for (const issue of error.issues) {
    const index = issue.path[0];

    if (typeof index === 'number') {
      const dayOfWeek = week[index]?.dayOfWeek ?? index;

      if (!(dayOfWeek in fieldErrors)) {
        fieldErrors[dayOfWeek] = issue.message;
      }
    } else if (generalMessage === undefined) {
      generalMessage = issue.message;
    }
  }

  return {
    ok: false,
    message: generalMessage ?? error.issues[0]?.message ?? GENERIC_ERROR,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
  };
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
    .select('id,slug')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string; slug: string }>();

  if (businessError) {
    await logOpeningHoursOperation('opening_hours_business_lookup_failed', {
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
      business,
      supabase,
      userId: user.id,
    },
  };
}

export async function listOpeningHours(): Promise<ListOpeningHoursResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return contextResult;
  }

  const { business, supabase, userId } = contextResult.context;
  const { data, error } = await supabase
    .from('opening_hours')
    .select('day_of_week,opens_at,closes_at')
    .eq('business_id', business.id)
    .returns<OpeningHoursRow[]>();

  if (error) {
    await logOpeningHoursOperation('opening_hours_list_failed', {
      businessId: business.id,
      error,
      userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  const byDay = new Map<number, OpeningHoursRow>();
  for (const row of data) {
    byDay.set(row.day_of_week, row);
  }

  // A missing row for a given day means the day is closed.
  const week: OpeningHoursWeek = WEEK_DAYS.map(({ dayOfWeek }) => {
    const row = byDay.get(dayOfWeek);

    if (!row) {
      return { dayOfWeek, closed: true };
    }

    return {
      dayOfWeek,
      closed: false,
      opensAt: formatTime(row.opens_at),
      closesAt: formatTime(row.closes_at),
    };
  });

  return { ok: true, week };
}

export async function saveOpeningHours(week: OpeningHoursWeek): Promise<OpeningHoursActionResult> {
  const parsed = openingHoursWeekSchema.safeParse(week);

  if (!parsed.success) {
    return validationError(parsed.error, week);
  }

  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const { business, supabase, userId } = contextResult.context;

  const openRows = parsed.data
    .filter((day): day is Extract<OpeningHoursWeek[number], { closed: false }> => !day.closed)
    .map((day) => ({
      business_id: business.id,
      day_of_week: day.dayOfWeek,
      opens_at: day.opensAt,
      closes_at: day.closesAt,
    }));
  const closedDays = parsed.data.filter((day) => day.closed).map((day) => day.dayOfWeek);

  const { error: upsertError } = await supabase
    .from('opening_hours')
    .upsert(openRows, { onConflict: 'business_id,day_of_week' });

  if (upsertError) {
    await logOpeningHoursOperation('opening_hours_save_failed', {
      businessId: business.id,
      error: upsertError,
      userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  if (closedDays.length > 0) {
    const { error: deleteError } = await supabase
      .from('opening_hours')
      .delete()
      .eq('business_id', business.id)
      .in('day_of_week', closedDays);

    if (deleteError) {
      await logOpeningHoursOperation('opening_hours_save_failed', {
        businessId: business.id,
        error: deleteError,
        userId,
      });
      return { ok: false, message: GENERIC_ERROR };
    }
  }

  await logOpeningHoursOperation('opening_hours_saved', {
    businessId: business.id,
    closedDays,
    openDays: openRows.map((row) => row.day_of_week),
    userId,
  });
  revalidatePublicPage(business.slug);

  return { ok: true };
}
