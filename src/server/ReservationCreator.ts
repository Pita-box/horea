'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromPragueInput } from '@/lib/datetime';
import { serverLog } from '@/lib/log-server';
import { reservationContactSchema } from '@/lib/reservation/schema';
import type { ReservationContactValues } from '@/lib/reservation/schema';
import { normalizeRouteSlug } from '@/lib/slug/route';
import { createAdminClient } from '@/lib/supabase/admin';

import { upsertClientFromReservation } from './ClientUpsertor';
import { sendReservationConfirmation, sendReservationNotification } from './EmailNotifier';
import { loadAvailableSlots } from './slots/loadAvailableSlots';
import { atomicSlotWrite, type AtomicSlotWriteResult } from '@/lib/reservations/atomicSlotWrite';

/**
 * Server action volaná z kroku 5 formuláře. KRITICKÝ komponent feature —
 * odpovídá za atomicitu vytvoření rezervace.
 *
 * Tok (dle R9):
 *  1. Vstupní validace všech polí znovu serverově (R7.7).
 *  2. Server kontext: bez service role klíče operaci ZABLOKUJEME (R15.5),
 *     nikdy nepřepneme na anon zápis.
 *  3. Business existuje a je Published_Business (R9.1); služba k němu patří (R9.2).
 *  4. Výpočet startsAt/endsAt v UTC z Pražského data + času (R17.4).
 *  5. Pre-lock grid re-check přes sdílený Slot_Calculator (R9.3); konflikt → 409.
 *  6. Atomický blok: RPC create_reservation drží advisory lock + overlap re-check
 *     pod zámkem a vloží rezervaci (R9.5–R9.7).
 *  7. Post-commit best-effort e-maily (selhání nezpůsobí rollback — R10.3, R11.3).
 *  8. Logování bez citlivých polí klienta (R18.1–R18.4).
 *  9. Návrat statusu klientovi (R9.9).
 */
export type CreateReservationInput = {
  slug: string;
  serviceId: string;
  /** Datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  date: string;
  /** Počáteční čas slotu v pásmu Europe/Prague ve tvaru `HH:mm`. */
  time: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note?: string | null;
  /** Volitelně vybraný zaměstnanec (R: výběr zaměstnance klientem). */
  employeeId?: string | null;
};

export type ReservationStatus = 'pending' | 'approved';

export type CreateReservationResult =
  | { ok: true; status: ReservationStatus }
  | { ok: false; code: 400 | 404 | 409 | 500; message: string; slots?: string[] };

const PLATFORM_BASE_URL = 'https://www.horea.cz';

const MESSAGES = {
  invalidInput: 'Zkontrolujte prosím zadané údaje.',
  serverContext: 'Rezervaci se nepodařilo odeslat, zkuste to prosím znovu.',
  notPublished: 'Tento podnik aktuálně nepřijímá rezervace.',
  serviceMissing: 'Vybraná služba již není dostupná.',
  conflict: 'Tento termín byl právě obsazen, vyberte prosím jiný',
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  contact_email: string | null;
  auto_approve_reservations: boolean;
  owner_user_id: string;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_czk: number | string;
};

type CreateReservationRpcRow = {
  reservation_id: string | null;
  status: ReservationStatus | 'rejected' | 'cancelled' | null;
  conflict: boolean;
  not_published: boolean;
};

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci (R18.5).
  }
}

/**
 * Post-commit dispatch obou transakčních e-mailů. Best-effort — `EmailNotifier`
 * nikdy nehází výjimku, takže selhání e-mailu nemůže ovlivnit už vytvořenou
 * rezervaci (R10.3, R11.3). Oba e-maily běží souběžně.
 */
async function dispatchEmails(args: {
  admin: SupabaseClient;
  business: BusinessRow;
  service: ServiceRow;
  reservationId: string;
  status: ReservationStatus;
  startsAt: Date;
  contact: ReservationContactValues;
  employeeName?: string | null;
}): Promise<void> {
  const { admin, business, service, reservationId, status, startsAt, contact, employeeName } = args;

  // E-mail majitele přes users propojené businesses.owner_user_id (R11.1).
  let ownerEmail: string | null = null;
  try {
    const { data: owner } = await admin
      .from('users')
      .select('email')
      .eq('id', business.owner_user_id)
      .maybeSingle<{ email: string }>();
    ownerEmail = owner?.email ?? null;
  } catch {
    ownerEmail = null;
  }

  const servicePriceCzk = Number(service.price_czk);
  const businessUrl = `${PLATFORM_BASE_URL}/${business.slug}`;
  const dashboardUrl = `${PLATFORM_BASE_URL}/dashboard/reservations`;

  const tasks: Promise<unknown>[] = [
    sendReservationConfirmation({
      reservationId,
      recipientEmail: contact.clientEmail,
      clientName: contact.clientName,
      businessName: business.name,
      serviceName: service.name,
      serviceDurationMinutes: service.duration_minutes,
      servicePriceCzk,
      startsAt,
      status,
      businessPhone: business.phone,
      businessEmail: business.contact_email,
      businessUrl,
    }),
  ];

  if (ownerEmail) {
    tasks.push(
      sendReservationNotification({
        reservationId,
        recipientEmail: ownerEmail,
        businessName: business.name,
        serviceName: service.name,
        serviceDurationMinutes: service.duration_minutes,
        servicePriceCzk,
        startsAt,
        status,
        clientName: contact.clientName,
        clientPhone: contact.clientPhone,
        clientEmail: contact.clientEmail,
        clientNote: contact.note,
        employeeName: employeeName ?? null,
        dashboardUrl,
      }),
    );
  }

  await Promise.allSettled(tasks);
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  // (1) Vstupní validace kontaktních polí (R7.2–R7.6, znovu serverově dle R7.7).
  const parsed = reservationContactSchema.safeParse({
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    clientEmail: input.clientEmail,
    note: input.note ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      code: 400,
      message: parsed.error.issues[0]?.message ?? MESSAGES.invalidInput,
    };
  }

  if (!DATE_PATTERN.test(input.date) || !TIME_PATTERN.test(input.time)) {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }

  // (2) Server kontext: service role klíč. Bez něj operaci kompletně zablokujeme
  //     (R15.5) — žádný fallback na anon klíč pro zápis.
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  const slug = normalizeRouteSlug(input.slug);

  // (3) Business podle slug (admin obchází RLS).
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id,slug,name,phone,contact_email,auto_approve_reservations,owner_user_id')
    .eq('slug', slug)
    .maybeSingle<BusinessRow>();

  if (businessError) {
    await safeLog('reservation_business_lookup_failed', { error: businessError });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!business) {
    await safeLog('reservation_rejected', { reason: 'business_not_found' });
    return { ok: false, code: 404, message: MESSAGES.notPublished };
  }

  const { data: published, error: publishedError } = await admin.rpc('is_business_published', {
    b_id: business.id,
  });

  if (publishedError) {
    await safeLog('reservation_published_check_failed', {
      businessId: business.id,
      error: publishedError,
    });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (published !== true) {
    await safeLog('reservation_rejected', { businessId: business.id, reason: 'not_published' });
    return { ok: false, code: 404, message: MESSAGES.notPublished };
  }

  const { data: service, error: serviceError } = await admin
    .from('services')
    .select('id,name,duration_minutes,price_czk')
    .eq('id', input.serviceId)
    .eq('business_id', business.id)
    .maybeSingle<ServiceRow>();

  if (serviceError) {
    await safeLog('reservation_service_lookup_failed', {
      businessId: business.id,
      error: serviceError,
    });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!service) {
    await safeLog('reservation_rejected', { businessId: business.id, reason: 'service_not_found' });
    return { ok: false, code: 404, message: MESSAGES.serviceMissing };
  }

  // (4) UTC hranice slotu z Pražského data + času (R17.4).
  let startsAt: Date;
  try {
    startsAt = fromPragueInput(`${input.date}T${input.time}`);
  } catch {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);

  // (5+6) Atomický blok delegovaný na sdílený orchestrátor `atomicSlotWrite`:
  //       pre-lock grid re-check přes Slot_Calculator (R9.3) + dispatch RPC
  //       create_reservation, který pod advisory lockem provede overlap re-check
  //       a insert v jediné transakci (R9.5–R9.7). Insert cesta nevylučuje žádnou
  //       rezervaci (`excludeReservationId` = undefined).
  type CreateReservationRpcResponse = Awaited<ReturnType<typeof admin.rpc>>;
  let writeResult: AtomicSlotWriteResult<CreateReservationRpcResponse>;
  try {
    writeResult = await atomicSlotWrite<CreateReservationRpcResponse>({
      supabase: admin,
      businessId: business.id,
      serviceId: service.id,
      dateISO: input.date,
      time: input.time,
      write: () =>
        admin.rpc('create_reservation', {
          p_business_id: business.id,
          p_service_id: service.id,
          p_starts_at: startsAt.toISOString(),
          p_ends_at: endsAt.toISOString(),
          p_client_name: parsed.data.clientName,
          p_client_phone: parsed.data.clientPhone,
          p_client_email: parsed.data.clientEmail,
          p_note: parsed.data.note,
        }),
    });
  } catch (error) {
    await safeLog('reservation_slot_recompute_failed', {
      businessId: business.id,
      serviceId: service.id,
      error,
    });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!writeResult.ok) {
    // Slot nebyl v pre-lock listu → RPC create_reservation se NEVOLAL (R9.3/9.4).
    await safeLog('slot_unavailable', { businessId: business.id, serviceId: service.id });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: writeResult.slots };
  }

  const { data: rpcData, error: rpcError } = writeResult.value;

  if (rpcError) {
    await safeLog('reservation_create_failed', {
      businessId: business.id,
      serviceId: service.id,
      error: rpcError,
    });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  const row: CreateReservationRpcRow | undefined = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (!row) {
    await safeLog('reservation_create_failed', {
      businessId: business.id,
      serviceId: service.id,
      reason: 'empty_rpc_result',
    });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (row.not_published) {
    await safeLog('reservation_rejected', { businessId: business.id, reason: 'not_published' });
    return { ok: false, code: 404, message: MESSAGES.notPublished };
  }

  if (row.conflict || !row.reservation_id) {
    // Slot byl pod zámkem obsazen — vrátíme aktualizovaný list (R9.4).
    let freshSlots: string[] = [];
    try {
      freshSlots = await loadAvailableSlots(admin, {
        businessId: business.id,
        serviceId: service.id,
        dateISO: input.date,
      });
    } catch {
      // Recompute je best-effort; při selhání vrátíme prázdný list.
    }
    await safeLog('slot_unavailable', { businessId: business.id, serviceId: service.id });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: freshSlots };
  }

  const reservationId = row.reservation_id;
  const status: ReservationStatus = row.status === 'approved' ? 'approved' : 'pending';

  // (6b) Volitelné přiřazení zaměstnance (post-commit, best-effort). Není součástí
  //      atomického slot-write — zaměstnanec je jen atribut, ne kapacitní zámek.
  //      Neplatný/cizí employee_id ignorujeme; selhání neshodí už vytvořenou rezervaci.
  let assignedEmployeeName: string | null = null;
  if (input.employeeId) {
    try {
      const { data: employee } = await admin
        .from('employees')
        .select('id,name')
        .eq('id', input.employeeId)
        .eq('business_id', business.id)
        .maybeSingle<{ id: string; name: string }>();
      if (employee) {
        assignedEmployeeName = employee.name;
        await admin
          .from('reservations')
          .update({ employee_id: input.employeeId })
          .eq('id', reservationId);
      }
    } catch {
      // best-effort
    }
  }

  // (8) Log úspěchu bez citlivých polí klienta (R18.1, R18.4).
  await safeLog('reservation_created', {
    businessId: business.id,
    serviceId: service.id,
    reservationId,
  });

  // (7) Post-commit best-effort e-maily — selhání nezpůsobí rollback.
  await dispatchEmails({
    admin,
    business,
    service,
    reservationId,
    status,
    startsAt,
    contact: parsed.data,
    employeeName: assignedEmployeeName,
  });

  // (7b) Post-commit upsert klienta do evidence `clients` (R15.1). Best-effort —
  //      `upsertClientFromReservation` nikdy nevyhazuje, takže selhání nemůže
  //      ovlivnit už úspěšný výsledek rezervace (R15.5).
  await upsertClientFromReservation({
    supabase: admin,
    businessId: business.id,
    clientName: parsed.data.clientName,
    clientPhone: parsed.data.clientPhone,
    clientEmail: parsed.data.clientEmail,
  });

  // (9) Návrat statusu klientovi (R9.9).
  return { ok: true, status };
}
