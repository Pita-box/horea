'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromPragueInput } from '@/lib/datetime';
import { serverLog } from '@/lib/log-server';
import { validateServiceCount } from '@/lib/reservation/limits';
import { RESERVATION_MESSAGES } from '@/lib/reservation/schema';
import { atomicSlotWrite, type AtomicSlotWriteResult } from '@/lib/reservations/atomicSlotWrite';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { upsertClientFromReservation } from './ClientUpsertor';
import { loadAvailableSlots } from './slots/loadAvailableSlots';

/**
 * Manual_Reservation_Creator — server action vytvářející rezervaci jménem majitele
 * (telefonní objednávky, R15). Sdílí atomický blok s `ReservationCreator` přes
 * `atomicSlotWrite` (insert varianta), ale s dvěma rozdíly: status je VŽDY
 * `approved` (řeší RPC `create_manual_reservation_multi`, R15.1) a klientovi se
 * neodesílá ŽÁDNÝ potvrzovací e-mail (R15.4).
 *
 * Validace (R12.2) je LEHČÍ než klientský `reservationContactSchema`: jméno je
 * povinné (1–100 po trim) a stačí ALESPOŇ JEDEN kontakt (telefon NEBO e-mail),
 * validní formát se ověřuje jen u vyplněného pole. Počet služeb musí být v
 * rozsahu [MIN, MAX] = [1, 10] (R5.4).
 *
 * Tok:
 *  1. Lehká serverová validace polí + rozsah počtu služeb (R5.4).
 *  2. Přihlášení + odvození podniku majitele (`businesses.owner_user_id = user.id`).
 *  3. Ověření, že všechny služby existují a patří podniku (R15.2); startsAt v UTC.
 *  4. `atomicSlotWrite` → RPC `create_manual_reservation_multi` (advisory lock +
 *     Combined_Duration + overlap re-check + insert se status approved). conflict →
 *     409 + Available_Slot_List (R15.5), invalid → 404 (R15.2).
 *  5. Po commitu best-effort `Client_Upsertor` (R15.1). Log bez PII.
 */

export type CreateManualReservationInput = {
  /** ID vybraných služeb v pořadí výběru (`Reservation_Service_Set`, R15.1). */
  serviceIds: string[];
  /** Datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  date: string;
  /** Počáteční čas slotu v pásmu Europe/Prague ve tvaru `HH:mm`. */
  time: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note?: string | null;
};

export type CreateManualReservationResult =
  | { ok: true }
  | { ok: false; code: 400 | 401 | 404 | 409 | 500; message: string; slots?: string[] };

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  invalidInput: 'Zkontrolujte prosím zadané údaje.',
  contactRequired: 'Zadejte alespoň jeden kontakt — telefon nebo e-mail',
  serviceMissing: 'Vybraná služba již není dostupná.',
  conflict: 'Tento termín není dostupný',
  serverContext: 'Rezervaci se nepodařilo vytvořit, zkuste to prosím znovu.',
} as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Povolené znaky telefonu: číslice, mezery, pomlčky, závorky a volitelné úvodní `+`. */
const PHONE_ALLOWED_PATTERN = /^\+?[0-9\s()-]+$/;
/** Běžný tvar e-mailové adresy `local@domain.tld`. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ServiceRow = {
  id: string;
};

type ManualReservationRpcRow = {
  reservation_id: string | null;
  conflict: boolean;
  not_published: boolean;
  invalid: boolean;
};

type ValidatedContact = {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note: string | null;
};

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

/**
 * Lehká validace pro ruční tvorbu (R12.2): jméno povinné (1–100), ALESPOŇ JEDEN
 * kontakt povinný, validní formát jen u vyplněného pole. Záměrně NEpoužívá
 * `reservationContactSchema`, který vyžaduje OBA kontakty.
 */
function validateContact(input: CreateManualReservationInput):
  | { ok: true; data: ValidatedContact }
  | { ok: false; message: string } {
  const clientName = input.clientName.trim();
  if (clientName.length === 0) {
    return { ok: false, message: RESERVATION_MESSAGES.nameRequired };
  }
  if (clientName.length > 100) {
    return { ok: false, message: RESERVATION_MESSAGES.nameMaxLength };
  }

  const clientPhone = input.clientPhone.trim();
  const clientEmail = input.clientEmail.trim();

  if (clientPhone.length === 0 && clientEmail.length === 0) {
    return { ok: false, message: MESSAGES.contactRequired };
  }

  if (clientPhone.length > 0) {
    const digitCount = (clientPhone.match(/\d/g) ?? []).length;
    if (!PHONE_ALLOWED_PATTERN.test(clientPhone) || digitCount < 9 || digitCount > 15) {
      return { ok: false, message: RESERVATION_MESSAGES.phoneInvalid };
    }
  }

  if (clientEmail.length > 0 && !EMAIL_PATTERN.test(clientEmail)) {
    return { ok: false, message: RESERVATION_MESSAGES.emailInvalid };
  }

  const note = input.note?.trim() ? input.note.trim() : null;
  if (note !== null && note.length > 500) {
    return { ok: false, message: RESERVATION_MESSAGES.noteMaxLength };
  }

  return { ok: true, data: { clientName, clientPhone, clientEmail, note } };
}

export async function createManualReservation(
  input: CreateManualReservationInput,
): Promise<CreateManualReservationResult> {
  // (1) Lehká serverová validace polí (R12.2).
  const validated = validateContact(input);
  if (!validated.ok) {
    return { ok: false, code: 400, message: validated.message };
  }

  // Rozsahová validace počtu služeb [MIN, MAX] = [1, 10] (R5.4).
  const countCheck = validateServiceCount(input.serviceIds.length);
  if (!countCheck.ok) {
    return { ok: false, code: 400, message: countCheck.message };
  }

  if (!DATE_PATTERN.test(input.date) || !TIME_PATTERN.test(input.time)) {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }

  // (2) Přihlášení + odvození podniku majitele pod uživatelským JWT.
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, code: 401, message: MESSAGES.notAuthenticated };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError) {
    await safeLog('manual_reservation_business_lookup_failed', { userId: user.id });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!business) {
    return { ok: false, code: 404, message: MESSAGES.notAuthenticated };
  }

  const businessId = business.id;

  // (3) Server kontext: service role klíč pro advisory-lock zápis.
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  // Všechny služby musí existovat a patřit danému podniku (R15.2). Jedním
  // dotazem; finální autoritativní kontrolu i Combined_Duration řeší RPC.
  const { data: services, error: serviceError } = await admin
    .from('services')
    .select('id')
    .in('id', input.serviceIds)
    .eq('business_id', businessId)
    .returns<ServiceRow[]>();

  if (serviceError) {
    await safeLog('manual_reservation_service_lookup_failed', { businessId });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  // Porovnání s počtem unikátních ID — chybějící / cizí služba → 404 (R15.2).
  const uniqueServiceIds = new Set(input.serviceIds);
  if (!services || services.length !== uniqueServiceIds.size) {
    return { ok: false, code: 404, message: MESSAGES.serviceMissing };
  }

  let startsAt: Date;
  try {
    startsAt = fromPragueInput(`${input.date}T${input.time}`);
  } catch {
    return { ok: false, code: 400, message: MESSAGES.invalidInput };
  }

  const { clientName, clientPhone, clientEmail, note } = validated.data;

  // (4) Atomický blok: pre-lock grid re-check → RPC create_manual_reservation.
  type ManualRpcResponse = Awaited<ReturnType<typeof admin.rpc>>;
  let writeResult: AtomicSlotWriteResult<ManualRpcResponse>;
  try {
    writeResult = await atomicSlotWrite<ManualRpcResponse>({
      supabase: admin,
      businessId,
      serviceIds: input.serviceIds,
      dateISO: input.date,
      time: input.time,
      requirePublished: false,
      write: () =>
        admin.rpc('create_manual_reservation_multi', {
          p_business_id: businessId,
          p_service_ids: input.serviceIds,
          p_starts_at: startsAt.toISOString(),
          p_client_name: clientName,
          p_client_phone: clientPhone ? clientPhone : null,
          p_client_email: clientEmail ? clientEmail : null,
          p_note: note,
        }),
    });
  } catch (error) {
    await safeLog('manual_reservation_slot_recompute_failed', { businessId, error });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (!writeResult.ok) {
    // Slot nebyl v pre-lock listu → RPC se NEVOLAL (R12.6).
    await safeLog('manual_reservation_slot_unavailable', { businessId });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: writeResult.slots };
  }

  const { data: rpcData, error: rpcError } = writeResult.value;

  if (rpcError) {
    await safeLog('manual_reservation_create_failed', { businessId });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  const row: ManualReservationRpcRow | undefined = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  if (!row) {
    await safeLog('manual_reservation_create_failed', { businessId, reason: 'empty_rpc_result' });
    return { ok: false, code: 500, message: MESSAGES.serverContext };
  }

  if (row.not_published || row.invalid) {
    // Operace majitele nikdy nenastaví not_published; invalid značí chybějící /
    // cizí službu nebo počet mimo rozsah pod zámkem (R15.2).
    return { ok: false, code: 404, message: MESSAGES.serviceMissing };
  }

  if (row.conflict || !row.reservation_id) {
    // Slot byl pod zámkem obsazen — vrátíme aktualizovaný list (R15.5).
    let freshSlots: string[] = [];
    try {
      freshSlots = await loadAvailableSlots(admin, {
        businessId,
        serviceIds: input.serviceIds,
        dateISO: input.date,
        requirePublished: false,
      });
    } catch {
      // Recompute je best-effort; při selhání vrátíme prázdný list.
    }
    await safeLog('manual_reservation_slot_unavailable', { businessId });
    return { ok: false, code: 409, message: MESSAGES.conflict, slots: freshSlots };
  }

  await safeLog('manual_reservation_created', {
    businessId,
    reservationId: row.reservation_id,
    action_type: 'manual_create',
  });

  // (5) Post-commit best-effort upsert klienta (R15.1). Žádný e-mail klientovi (R15.4).
  await upsertClientFromReservation({
    supabase: admin,
    businessId,
    clientName,
    clientPhone,
    clientEmail,
  });

  return { ok: true };
}
