'use server';

import { revalidatePath } from 'next/cache';

import { matchPayment } from '@/lib/admin/payment-matcher';
import { requireAdmin } from '@/lib/admin/require-admin';

/**
 * Server action ručního párování plateb admin dashboardu `/admin/payments`
 * (feature `admin-dashboard`, Requirement 8, task 15.2).
 *
 * Nejprve ověří přihlášeného administrátora ({@link requireAdmin}, R1.5) — bez
 * admin oprávnění se párování neprovede — a teprve poté volá
 * {@link matchPayment} se service-role klientem a actorem (admin user id z auth
 * kontextu). Vlastní efekt prodloužení předplatného i auditní zápis žijí v DB
 * funkci (znovupoužití ze `subscription-payments`); tato vrstva pouze deleguje a
 * překládá výsledek na českou hlášku (R8.4).
 */

/** Výsledek párování pro client komponentu. */
export type MatchPaymentActionResult = { ok: true } | { ok: false; message: string };

const MATCH_FAILED_MESSAGE = 'Platbu se nepodařilo spárovat, zkuste to prosím znovu.';

export async function matchPaymentAction(paymentId: string): Promise<MatchPaymentActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await matchPayment(auth.admin, {
    actorUserId: auth.actorUserId,
    paymentId,
  });

  if (!result.ok) {
    return { ok: false, message: MATCH_FAILED_MESSAGE };
  }

  revalidatePath('/admin/payments');
  return { ok: true };
}
