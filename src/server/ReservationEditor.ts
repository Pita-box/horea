'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromPragueInput, toPragueDisplay } from '@/lib/datetime';
import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { renderReservationModifiedEmail } from '@/lib/email/templates/reservation-modified';
import { serverLog } from '@/lib/log-server';
import {
  combinedDuration,
  combinedPrice,
  type CombinableService,
} from '@/lib/reservation/combine';
import { validateServiceCount } from '@/lib/reservation/limits';
import { atomicSlotWrite, type AtomicSlotWriteResult } from '@/lib/reservations/atomicSlotWrite';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { loadAvailableSlots } from './slots/loadAvailableSlots';

/**
 * Reservation_Editor — server action upravující čas (`starts_at`) a/nebo množinu
 * služeb (`Reservation_Service_Set`) existující rezervace (R9). Nejcitlivější
 * mutace feature: sdílí atomický blok s `ReservationCreator` přes
 * `atomicSlotWrite`, ale s jedním rozdílem — VYLUČUJE upravovanou rezervaci z
 * konfliktní kontroly (`excludeReservationId`), aby nekolidovala sama se sebou
 * (R9.5).
 *
 * Tok:
 *  1. Ověření přihlášení + příslušnosti rezervace a podniku majiteli pod
 *     uživatelským JWT (RLS izoluje data na podnik majitele; navíc ověříme
 *     `businesses.owner_user_id = user.id`).
 *  2. Rozsahová validace počtu služeb (MIN..MAX) shodná se submission handlerem (R9.6).
 *  3. Guard stavu {pending, approved} necháme na RPC `edit_reservation_multi` (`invalid`).
 *  4. Service lookup (admin) všech služeb jedním dotazem; každá musí patřit
 *     podniku (R9.4). Pořadí výběru se zachová pro e-mail. `ends_at` /
 *     `Combined_Duration` autoritativně počítá SQL pod zámkem (R9.2).
 *  5. `atomicSlotWrite` se `serviceIds` a `excludeReservationId` (pre-lock grid
 *     re-check) → RPC `edit_reservation_multi` (advisory lock + overlap re-check
 *     s vyloučením sebe sama + náhrada množiny) v jediné transakci (R9.3).
 *  6. conflict (z pre-lock listu NEBO z RPC) → 409 „Tento termín není dostupný"
 *     + aktualizovaný Available_Slot_List (R9.4); invalid → 409 s hláškou.
 *  7. Po commitu best-effort `Reservation_Modified_Email` s hodnotami PO úpravě
 *     (seznam služeb + součty). Log bez PII.
 */

export type EditReservationInput = {
  reservationId: string;
  /** ID vybraných služeb v pořadí výběru (`Reservation_Service_Set`, R9.1). */
  serviceIds: string[];
  /** Datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  date: string;
  /** Počáteční čas slotu v pásmu Europe/Prague ve tvaru `HH:mm`. */
  time: string;
};

export type EditReservationResult =
  | { ok: true }
  | { ok: false; code: 400 | 401 | 404 | 409 | 500; message: string; slots?: string[] };

const PLATFORM_BASE_URL = 'https://www.horea.cz';

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  invalidInput: 'Zkontrolujte prosím zadané údaje.',
  notFound: 'Rezervace nebyla nalezena',
  invalidState: 'Rezervaci v tomto stavu nelze upravit',
  conflict: 'Tento termín není dostupný',
  serverContext: 'Úpravu se nepodařilo uložit, zkuste to prosím znovu.',
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_czk: number | string;
};

type EditReservationRpcRow = {
  updated: boolean;
  conflict: boolean;
  invalid: boolean;
};

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

/** Mapuje DB řádek služby na vstup čistých kombinovaných helperů (R9.2). */
function toCombinable(service: ServiceRow, position: number): CombinableService {
  return {
    name: service.name,
    durationMinutes: service.duration_minutes,
    priceCzk: Number(service.price_czk),
    position,
  };
}

/**
 * Post-commit best-effort Reservation_Modified_Email s hodnotami PO úpravě.
 * Selhání e-mailu se jen zaloguje a NIKDY nezpůsobí rollback úpravy (R9.6).
 *
 * `services` je v pořadí výběru (`position`). Pro Combined_Duration /
 * Combined_Price se použijí čisté helpery; šablona dostane seznam služeb i
 * součty (R16.1, R16.3).
 */
async function dispatchModifiedEmail(args: {
  admin: SupabaseClient;
  businessId: string;
  reservationId: string;
  services: ServiceRow[];
  startsAt: Date;
}): Promise<void> {
  const { admin, businessId, reservationId, services, startsAt } = args;

  const { data: business } = await admin
    .from('businesses')
    .select('name, slug')
    .eq('id', businessId)
    .maybeSingle<{ name: string; slug: string }>();

  const { data: reservation } = await admin
    .from('reservations')
    .select('client_name, client_email')
    .eq('id', reservationId)
    .maybeSingle<{ client_name: string; client_email: string | null }>();

  if (!business || !reservation?.client_email) {
    return;
  }

  const combinable = services.map((service, index) => toCombinable(service, index));
  const [reservationDate, reservationTime] = toPragueDisplay(startsAt).split(' ');

  const email = renderReservationModifiedEmail({
    clientName: reservation.client_name,
    businessName: business.name,
    services: combinable.map((service) => ({
      name: service.name,
      durationMinutes: service.durationMinutes,
    })),
    combinedDurationMinutes: combinedDuration(combinable),
    combinedPriceCzk: combinedPrice(combinable),
    reservationDate,
    reservationTime,
    businessUrl: `${PLATFORM_BASE_URL}/${business.slug}`,
  });

  await dispatchTransactionalEmail({
    reservationId,
    emailType: 'reservation_modified',
    to: reservation.client_email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export async function editReservation(
  input: EditReservationInput,
): Promise<EditReservationResult> {
  if (!DATE_PATTERN.test(input.date) || !TIME_PATTERN.test(input.time)) {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }

  // (2) Rozsahová validace počtu služeb shodná se submission handlerem (R9.6).
  const countCheck = validateServiceCount(input.serviceIds.length);
  if (!countCheck.ok) {
    return { ok: false, code: 400, message: countCheck.message };
  }

  // (1) Přihlášení + příslušnost rezervace majiteli pod uživatelským JWT (RLS).
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, code: 401, message: MESSAGES.notAuthenticated };
  }

  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select('id, business_id')
    .eq('id', input.reservationId)
    .maybeSingle<{ id: string; business_id: string }>();

  if (reservationError) {
    await safeLog('reservation_edit_lookup_failed', { reservationId: input.reservationId });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!reservation) {
    return { ok: false, code: 404, message: MESSAGES.notFound };
  }

  // Ověření vlastnictví podniku (defense-in-depth nad RLS) — majitel přes owner_user_id.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', reservation.business_id)
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, code: 404, message: MESSAGES.notFound };
  }

  const businessId = reservation.business_id;

  // (2) Server kontext: service role klíč pro advisory-lock zápis (jako ReservationCreator).
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  // (4) Všechny služby musí patřit podniku → načteme je jedním dotazem.
  //     Pořadí výběru zachováme pro e-mail; SQL autoritativně počítá délku/cenu.
  const { data: serviceRows, error: serviceError } = await admin
    .from('services')
    .select('id, name, duration_minutes, price_czk')
    .in('id', input.serviceIds)
    .eq('business_id', businessId)
    .returns<ServiceRow[]>();

  if (serviceError) {
    await safeLog('reservation_edit_service_lookup_failed', { businessId });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  // Některá služba chybí / nepatří podniku (i duplicity v `serviceIds`) →
  // neplatná úprava (R9.4). Zachováme pořadí výběru a ověříme úplnost.
  const serviceById = new Map((serviceRows ?? []).map((row) => [row.id, row]));
  const orderedServices: ServiceRow[] = [];
  for (const serviceId of input.serviceIds) {
    const row = serviceById.get(serviceId);
    if (!row) {
      return { ok: false, code: 409, message: MESSAGES.conflict };
    }
    orderedServices.push(row);
  }

  let startsAt: Date;
  try {
    startsAt = fromPragueInput(`${input.date}T${input.time}`);
  } catch {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }

  // (5) Atomický blok: pre-lock grid re-check s vyloučením sebe sama → RPC
  //     edit_reservation_multi. `ends_at` / Combined_Duration počítá SQL pod
  //     zámkem (NEPŘEDÁVÁME p_ends_at).
  type EditRpcResponse = Awaited<ReturnType<typeof admin.rpc>>;
  let writeResult: AtomicSlotWriteResult<EditRpcResponse>;
  try {
    writeResult = await atomicSlotWrite<EditRpcResponse>({
      supabase: admin,
      businessId,
      serviceIds: input.serviceIds,
      dateISO: input.date,
      time: input.time,
      excludeReservationId: input.reservationId,
      requirePublished: false,
      write: () =>
        admin.rpc('edit_reservation_multi', {
          p_reservation_id: input.reservationId,
          p_business_id: businessId,
          p_service_ids: input.serviceIds,
          p_starts_at: startsAt.toISOString(),
        }),
    });
  } catch (error) {
    await safeLog('reservation_edit_slot_recompute_failed', { businessId, error });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!writeResult.ok) {
    // Slot nebyl v pre-lock listu → RPC se NEVOLAL (R9.4).
    await safeLog('reservation_edit_slot_unavailable', { businessId });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: writeResult.slots };
  }

  const { data: rpcData, error: rpcError } = writeResult.value;

  if (rpcError) {
    await safeLog('reservation_edit_failed', { businessId });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  const row: EditReservationRpcRow | undefined = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (!row) {
    await safeLog('reservation_edit_failed', { businessId, reason: 'empty_rpc_result' });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (row.invalid) {
    return { ok: false, code: 409, message: MESSAGES.invalidState };
  }

  if (row.conflict || !row.updated) {
    // Slot byl pod zámkem obsazen — vrátíme aktualizovaný list (R9.4).
    let freshSlots: string[] = [];
    try {
      freshSlots = await loadAvailableSlots(admin, {
        businessId,
        serviceIds: input.serviceIds,
        dateISO: input.date,
        excludeReservationId: input.reservationId,
        requirePublished: false,
      });
    } catch {
      // Recompute je best-effort; při selhání vrátíme prázdný list.
    }
    await safeLog('reservation_edit_slot_unavailable', { businessId });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: freshSlots };
  }

  await safeLog('reservation_edited', {
    businessId,
    reservationId: input.reservationId,
    action_type: 'edit',
  });

  // (7) Post-commit best-effort e-mail s hodnotami PO úpravě (R9.6).
  await dispatchModifiedEmail({
    admin,
    businessId,
    reservationId: input.reservationId,
    services: orderedServices,
    startsAt,
  });

  return { ok: true };
}
