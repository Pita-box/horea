'use server';

import { serverLog } from '@/lib/log-server';
import type { ReservationMutationResult } from '@/lib/reservations/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Reservation_Deleter — server action provádějící NEVRATNÝ hard delete řádku
 * v `reservations` (R10).
 *
 * Tok:
 *  1. Ověření přihlášení (zápis pod uživatelským JWT majitele; RLS
 *     `tenant_isolation` izoluje data na podnik majitele a slouží jako
 *     ownership guard).
 *  2. Hard delete `WHERE id = ?` z LIBOVOLNÉHO statusu — žádný stav
 *     nepodmiňuje smazatelnost (R10.3). Bez ovlivněného řádku (neexistuje /
 *     cizí podnik) vrátíme českou hlášku.
 *  3. Žádný e-mail klientovi (R10.4).
 *  4. Log s `business_id`, `user_id`, `reservation_id` bez PII klienta (R10.5).
 */

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  deleteFailed: 'Rezervaci se nepodařilo smazat.',
} as const;

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

export async function deleteReservation(
  reservationId: string,
): Promise<ReservationMutationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  // (2) Hard delete z libovolného statusu (R10.3). `select` vrátí smazané řádky,
  //     takže poznáme, zda něco bylo skutečně smazáno (R10.2).
  const { data, error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', reservationId)
    .select('id, business_id');

  if (error) {
    await safeLog('reservation_delete_failed', { reservationId, userId: user.id });
    return { ok: false, message: MESSAGES.deleteFailed };
  }

  const row = (data?.[0] ?? null) as { id: string; business_id: string } | null;

  if (!row) {
    // Žádný ovlivněný řádek → neexistuje nebo nepatří podniku majitele.
    return { ok: false, message: MESSAGES.deleteFailed };
  }

  // (4) Log bez PII klienta (R10.5) — žádný e-mail (R10.4).
  await safeLog('reservation_deleted', {
    businessId: row.business_id,
    userId: user.id,
    reservationId: row.id,
    action_type: 'delete',
  });

  return { ok: true };
}
