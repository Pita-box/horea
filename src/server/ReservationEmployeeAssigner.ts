'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Přiřazení MNOŽINY zaměstnanců k rezervaci (více lidí na jednu rezervaci, např.
 * služba vyžaduje více lidí nebo rezervace obsahuje více služeb). Owner-scoped:
 * vlastnictví ověříme čtením rezervace pod uživatelským JWT (RLS tenant
 * isolation), zaměstnance validujeme na shodný `business_id` a zápis provedeme
 * service-role klientem (employees/reservation_employees nemají owner-write policy).
 *
 * Množina se nahrazuje celá (delete + insert). `reservations.employee_id` se drží
 * v synchronizaci jako denormalizovaný primary (první přiřazený, nebo NULL).
 */
export type AssignEmployeeResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';

export async function setReservationEmployees(
  reservationId: string,
  employeeIds: string[],
): Promise<AssignEmployeeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  // RLS pustí jen rezervaci podniku přihlášeného majitele.
  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id,business_id')
    .eq('id', reservationId)
    .maybeSingle<{ id: string; business_id: string }>();

  if (error || !reservation) {
    return { ok: false, message: 'Rezervace nebyla nalezena.' };
  }

  const admin = createAdminClient();
  const uniqueIds = Array.from(new Set(employeeIds));

  // Všichni vybraní zaměstnanci musí patřit témuž podniku.
  if (uniqueIds.length > 0) {
    const { data: owned } = await admin
      .from('employees')
      .select('id')
      .eq('business_id', reservation.business_id)
      .in('id', uniqueIds)
      .returns<{ id: string }[]>();

    if (!owned || owned.length !== uniqueIds.length) {
      return { ok: false, message: 'Neplatný zaměstnanec.' };
    }
  }

  // Náhrada celé množiny: smaž stávající přiřazení a vlož nové.
  const { error: deleteError } = await admin
    .from('reservation_employees')
    .delete()
    .eq('reservation_id', reservationId);

  if (deleteError) {
    return { ok: false, message: GENERIC_ERROR };
  }

  if (uniqueIds.length > 0) {
    const { error: insertError } = await admin
      .from('reservation_employees')
      .insert(uniqueIds.map((employee_id) => ({ reservation_id: reservationId, employee_id })));

    if (insertError) {
      return { ok: false, message: GENERIC_ERROR };
    }
  }

  // Denormalizovaný primary kvůli zpětné kompatibilitě: první přiřazený (nebo NULL).
  const { error: updateError } = await admin
    .from('reservations')
    .update({ employee_id: uniqueIds[0] ?? null })
    .eq('id', reservationId);

  if (updateError) {
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true };
}
