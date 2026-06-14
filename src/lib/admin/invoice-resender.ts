import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { sendBestEffort } from '@/lib/email/outbox';
import { renderSubscriptionInvoiceEmail } from '@/lib/email/templates/subscription-invoice';
import { createInvoiceSignedUrl } from '@/lib/invoices/invoice-generator';
import { serverLog } from '@/lib/log-server';

/**
 * InvoiceResender — opětovné odeslání poslední faktury podniku na e-mail vlastníka
 * (feature `admin-dashboard`, Requirement 11).
 *
 * Před odesláním ověří, že podnik má alespoň jeden `payment` se stavem `paid` a
 * vyplněným `invoice_url`, a teprve poté odešle **nejnovější** takovou fakturu
 * (R11.1). Bez faktury akci neprovede a vrátí českou informační hlášku (R11.2).
 *
 * Faktura se odesílá přes Resend (znovupoužití `sendEmail` + šablony
 * `renderSubscriptionInvoiceEmail`). `invoice_url` typicky drží **cestu objektu**
 * ve Storage — v takovém případě se před odesláním vytvoří podepsaná URL přes
 * {@link createInvoiceSignedUrl}. Pokud `invoice_url` je již plná URL, použije se
 * přímo.
 *
 * Opětovné odeslání faktury **není** mezi citlivými akcemi (Requirement 9), proto
 * se NEAUDITUJE. Běží výhradně server-side se service-role klientem.
 */

/** Česká hláška, když podnik nemá žádnou vystavenou fakturu (R11.2). */
export const NO_INVOICE_MESSAGE = 'Podnik nemá žádnou vystavenou fakturu k odeslání.';
/** Česká hláška při selhání odeslání faktury. */
export const SEND_FAILED_MESSAGE = 'Fakturu se nepodařilo odeslat, zkuste to prosím znovu.';

export type ResendInvoiceResult =
  | { ok: true }
  | { ok: false; reason: 'no_invoice'; message: string }
  | { ok: false; reason: 'send_failed'; message: string };

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Opětovně odešle nejnovější zaplacenou fakturu podniku na e-mail vlastníka.
 *
 * @param supabase Service-role Supabase klient.
 * @param businessId Identifikátor podniku.
 */
export async function resendLatestInvoice(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ResendInvoiceResult> {
  // Nejnovější platba se stavem `paid` a vyplněným invoice_url (R11.1).
  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount_czk, invoice_url, invoice_number, created_at')
    .eq('business_id', businessId)
    .eq('status', 'paid')
    .not('invoice_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment || !payment.invoice_url) {
    return { ok: false, reason: 'no_invoice', message: NO_INVOICE_MESSAGE };
  }

  // Podnik a e-mail vlastníka.
  const { data: business } = await supabase
    .from('businesses')
    .select('name, owner_user_id')
    .eq('id', businessId)
    .maybeSingle();

  if (!business?.owner_user_id) {
    return { ok: false, reason: 'send_failed', message: SEND_FAILED_MESSAGE };
  }

  const { data: owner } = await supabase
    .from('users')
    .select('email')
    .eq('id', business.owner_user_id)
    .maybeSingle();

  if (!owner?.email) {
    return { ok: false, reason: 'send_failed', message: SEND_FAILED_MESSAGE };
  }

  // invoice_url je buď plná URL, nebo cesta ve Storage → podepsaná URL.
  let downloadUrl = payment.invoice_url as string;
  if (!isAbsoluteUrl(downloadUrl)) {
    const signedUrl = await createInvoiceSignedUrl(supabase, downloadUrl);
    if (!signedUrl) {
      await serverLog.warn('admin_invoice_resend_failed', {
        reason: 'signed_url_failed',
        paymentId: payment.id,
      });
      return { ok: false, reason: 'send_failed', message: SEND_FAILED_MESSAGE };
    }
    downloadUrl = signedUrl;
  }

  const email = renderSubscriptionInvoiceEmail({
    businessName: business.name,
    invoiceNumber: (payment.invoice_number as string | null) ?? '',
    amountCzk: Number(payment.amount_czk),
    invoiceUrl: downloadUrl,
  });

  const result = await sendBestEffort({
    category: 'invoice',
    to: owner.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    refId: payment.id as string,
    logLabel: 'admin_invoice_resend',
  });

  if (!result.ok) {
    return { ok: false, reason: 'send_failed', message: SEND_FAILED_MESSAGE };
  }

  return { ok: true };
}
