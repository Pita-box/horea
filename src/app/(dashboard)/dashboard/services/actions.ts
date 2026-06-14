'use server';

import { serviceSchema } from '@/lib/services/schema';
import type {
  ListServicesResult,
  ReservationCountResult,
  ServiceActionResult,
  ServiceField,
  ServiceRecord,
} from '@/lib/services/types';
import { revalidatePublicPage } from '@/lib/revalidate';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceInput } from '@/lib/services/schema';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';
const FORBIDDEN_SERVICE_ERROR = 'Služba nebyla nalezena nebo k ní nemáte přístup.';

type BusinessContext = {
  business: {
    id: string;
    slug: string;
  };
  supabase: SupabaseClient;
  userId: string;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_czk: number | string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function mapService(row: ServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.duration_minutes,
    priceCzk: Number(row.price_czk),
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validationError(error: {
  issues: { message: string; path: PropertyKey[] }[];
}): ServiceActionResult {
  const fieldErrors: Partial<Record<ServiceField, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !(field in fieldErrors)) {
      fieldErrors[field as ServiceField] = issue.message;
    }
  }

  return {
    ok: false,
    message: error.issues[0]?.message ?? GENERIC_ERROR,
    fieldErrors,
  };
}

async function logServiceOperation(
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logging is best-effort and must not block the main DB operation.
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
    .select('id,slug')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string; slug: string }>();

  if (businessError) {
    await logServiceOperation('services_business_lookup_failed', {
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

async function ensureOwnService(
  context: BusinessContext,
  serviceId: string,
): Promise<ServiceActionResult> {
  const { data: service, error } = await context.supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('business_id', context.business.id)
    .maybeSingle<{ id: string }>();

  if (error) {
    await logServiceOperation('service_lookup_failed', {
      businessId: context.business.id,
      error,
      serviceId,
      userId: context.userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!service) {
    return { ok: false, message: FORBIDDEN_SERVICE_ERROR };
  }

  return { ok: true };
}

async function countReservationsForService(
  context: BusinessContext,
  serviceId: string,
): Promise<ReservationCountResult> {
  const { business, supabase, userId } = context;
  const { count, error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('service_id', serviceId);

  if (error) {
    await logServiceOperation('service_reservation_count_failed', {
      businessId: business.id,
      error,
      serviceId,
      userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true, count: count ?? 0 };
}

export async function listServices(): Promise<ListServicesResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return contextResult;
  }

  const { business, supabase, userId } = contextResult.context;
  const { data, error } = await supabase
    .from('services')
    .select('id,name,duration_minutes,price_czk,description,created_at,updated_at')
    .eq('business_id', business.id)
    .order('created_at', { ascending: true })
    .returns<ServiceRow[]>();

  if (error) {
    await logServiceOperation('services_list_failed', { businessId: business.id, error, userId });
    return { ok: false, message: GENERIC_ERROR };
  }

  return {
    ok: true,
    services: data.map(mapService),
  };
}

export async function createService(input: ServiceInput): Promise<ServiceActionResult> {
  const parsed = serviceSchema.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const { business, supabase, userId } = contextResult.context;
  const { data, error } = await supabase
    .from('services')
    .insert({
      business_id: business.id,
      description: parsed.data.description,
      duration_minutes: parsed.data.durationMinutes,
      name: parsed.data.name,
      price_czk: parsed.data.priceCzk,
    })
    .select('id,name,duration_minutes,price_czk,description,created_at,updated_at')
    .single<ServiceRow>();

  if (error) {
    await logServiceOperation('service_create_failed', { businessId: business.id, error, userId });
    return { ok: false, message: GENERIC_ERROR };
  }

  await logServiceOperation('service_created', {
    businessId: business.id,
    serviceId: data.id,
    userId,
  });
  revalidatePublicPage(business.slug);

  return { ok: true, service: mapService(data) };
}

export async function updateService(
  serviceId: string,
  input: ServiceInput,
): Promise<ServiceActionResult> {
  const parsed = serviceSchema.safeParse(input);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const context = contextResult.context;
  const ownService = await ensureOwnService(context, serviceId);

  if (!ownService.ok) {
    return ownService;
  }

  const { business, supabase, userId } = context;
  const { data, error } = await supabase
    .from('services')
    .update({
      description: parsed.data.description,
      duration_minutes: parsed.data.durationMinutes,
      name: parsed.data.name,
      price_czk: parsed.data.priceCzk,
    })
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .select('id,name,duration_minutes,price_czk,description,created_at,updated_at')
    .single<ServiceRow>();

  if (error) {
    await logServiceOperation('service_update_failed', {
      businessId: business.id,
      error,
      serviceId,
      userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  await logServiceOperation('service_updated', { businessId: business.id, serviceId, userId });
  revalidatePublicPage(business.slug);

  return { ok: true, service: mapService(data) };
}

export async function getReservationCount(serviceId: string): Promise<ReservationCountResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const context = contextResult.context;
  const ownService = await ensureOwnService(context, serviceId);

  if (!ownService.ok) {
    return { ok: false, message: ownService.message };
  }

  return countReservationsForService(context, serviceId);
}

export async function deleteService(serviceId: string): Promise<ServiceActionResult> {
  const contextResult = await getBusinessContext();

  if (!contextResult.ok) {
    return { ok: false, message: contextResult.message };
  }

  const context = contextResult.context;
  const ownService = await ensureOwnService(context, serviceId);

  if (!ownService.ok) {
    return ownService;
  }

  const reservationCount = await countReservationsForService(context, serviceId);

  if (!reservationCount.ok) {
    return { ok: false, message: reservationCount.message };
  }

  const { business, supabase, userId } = context;
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', serviceId)
    .eq('business_id', business.id);

  if (error) {
    await logServiceOperation('service_delete_failed', {
      businessId: business.id,
      error,
      serviceId,
      userId,
    });
    return { ok: false, message: GENERIC_ERROR };
  }

  await logServiceOperation('service_deleted', {
    businessId: business.id,
    deletedReservationCount: reservationCount.count,
    serviceId,
    userId,
  });
  revalidatePublicPage(business.slug);

  return { ok: true, deletedReservationCount: reservationCount.count };
}
