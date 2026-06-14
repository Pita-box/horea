'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Přiřazení rezervace konkrétnímu zaměstnanci (R: tým). Owner-scoped:
 * vlastnictví ověříme čtením rezervace pod uživatelským JWT (RLS tenant
 * isolation), zaměstnance validujeme na shodný `business_id` a samotný update
 * provedeme service-role klientem (employees nemá owner-select policy).
 */
export type AssignEmployeeResult = { ok: true } | { ok: false; message: string };

export async function assignReservationEmployee(
  reservationId: string,
  employeeId: string | null,
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

  if (employeeId) {
    const { data: employee } = await admin
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .eq('business_id', reservation.business_id)
      .maybeSingle<{ id: string }>();

    if (!employee) {
      return { ok: false, message: 'Neplatný zaměstnanec.' };
    }
  }

  const { error: updateError } = await admin
    .from('reservations')
    .update({ employee_id: employeeId })
    .eq('id', reservationId);

  if (updateError) {
    return { ok: false, message: 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.' };
  }

  return { ok: true };
}
