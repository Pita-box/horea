import { wrapEmail } from './base';

/**
 * Subscription_Invoice_Email — e-mail s fakturou po úspěšné platbě předplatného
 * (R7.7). Obsahuje číslo faktury, částku a odkaz na PDF uložené v Supabase
 * Storage (podepsaná URL, kterou předává volající — viz `createInvoiceSignedUrl`
 * ve Faktura_Generatoru).
 */

type SubscriptionInvoiceEmailInput = {
  /** Název podniku pro oslovení (uživatelský vstup — v HTML se escapuje). */
  businessName: string;
  /** Pořadové číslo faktury (formát `YYYY-NNNN`). */
  invoiceNumber: string;
  /** Částka faktury v CZK. */
  amountCzk: number;
  /** Odkaz na PDF faktury (podepsaná URL / cesta ke stažení). */
  invoiceUrl: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPriceCzk(value: number): string {
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(value)} Kč`;
}

/**
 * Sestaví e-mail s fakturou za předplatné (R7.7).
 *
 * @param input Název podniku, číslo faktury, částka a odkaz na PDF.
 */
export function renderSubscriptionInvoiceEmail(
  input: SubscriptionInvoiceEmailInput,
): RenderedEmail {
  const subject = `Faktura ${input.invoiceNumber} — Horea`;
  const price = formatPriceCzk(input.amountCzk);
  const safeUrl = escapeHtml(input.invoiceUrl);

  const body = `<p style="margin:0 0 16px;">Dobrý den,</p>
<p style="margin:0 0 16px;">děkujeme za platbu předplatného Horea pro podnik <strong>${escapeHtml(input.businessName)}</strong>.</p>
<p style="margin:0 0 8px;">Číslo faktury: <strong>${escapeHtml(input.invoiceNumber)}</strong></p>
<p style="margin:0 0 24px;">Uhrazená částka: <strong>${price}</strong></p>
<p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;border-radius:12px;background:#592eff;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">Stáhnout fakturu (PDF)</a></p>
<p style="margin:0 0 8px;">Pokud tlačítko nefunguje, otevřete tento odkaz:</p>
<p style="margin:0;word-break:break-all;"><a href="${safeUrl}" style="color:#592eff;">${safeUrl}</a></p>`;

  const text = [
    'Dobrý den,',
    '',
    `děkujeme za platbu předplatného Horea pro podnik ${input.businessName}.`,
    '',
    `Číslo faktury: ${input.invoiceNumber}`,
    `Uhrazená částka: ${price}`,
    '',
    `Fakturu (PDF) stáhnete zde: ${input.invoiceUrl}`,
  ].join('\n');

  return { subject, html: wrapEmail({ subject, body }), text };
}
