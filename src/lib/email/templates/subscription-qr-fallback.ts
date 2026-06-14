import { wrapEmail } from './base';
import { generateSpaydQrDataUrl } from '@/lib/payments/spayd';

/**
 * Subscription_QR_Fallback_Email — e-mail s QR platbou při selhání automatického
 * strhnutí (přechod do grace_period, R4.6). Obsahuje QR kód ve formátu SPAYD,
 * bankovní údaje (IBAN, částka, měna) a variabilní symbol pro ruční zaplacení
 * převodem.
 *
 * QR obrázek se generuje přes {@link generateSpaydQrDataUrl} ze `spayd.ts`
 * (round-trip bezpečné SPAYD kódování, Property 4) — proto je render
 * **asynchronní**. Protože některé e-mailové klienty blokují vložené `data:`
 * obrázky, e-mail VŽDY obsahuje i textové bankovní údaje + VS jako plnohodnotnou
 * alternativu ke QR kódu.
 */

type SubscriptionQrFallbackEmailInput = {
  /** Název podniku pro oslovení (uživatelský vstup — v HTML se escapuje). */
  businessName: string;
  /** IBAN účtu provozovatele (příjemce platby). */
  iban: string;
  /** Částka k úhradě v CZK. */
  amountCzk: number;
  /** Variabilní symbol platebního pokusu (dekadický řetězec 1–10 číslic). */
  variableSymbol: string;
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
 * Sestaví fallback e-mail s QR platbou a bankovními údaji (R4.6).
 *
 * @param input Název podniku, IBAN, částka a variabilní symbol.
 * @returns Vyrenderovaný e-mail; QR obrázek je vložen jako `data:` URL a textové
 *   bankovní údaje slouží jako alternativa pro klienty blokující obrázky.
 */
export async function renderSubscriptionQrFallbackEmail(
  input: SubscriptionQrFallbackEmailInput,
): Promise<RenderedEmail> {
  const subject = 'Platba předplatného se nezdařila — zaplaťte převodem';
  const price = formatPriceCzk(input.amountCzk);

  const qrDataUrl = await generateSpaydQrDataUrl({
    iban: input.iban,
    amountCzk: input.amountCzk,
    variableSymbol: input.variableSymbol,
  });

  const body = `<p style="margin:0 0 16px;">Dobrý den,</p>
<p style="margin:0 0 16px;">automatické strhnutí platby předplatného pro podnik <strong>${escapeHtml(input.businessName)}</strong> se nezdařilo. Předplatné prozatím zůstává aktivní — zaplaťte prosím převodem podle údajů níže.</p>
<p style="margin:0 0 16px;text-align:center;"><img src="${qrDataUrl}" alt="QR platba" width="200" height="200" style="border-radius:12px;" /></p>
<p style="margin:0 0 8px;">Pokud se QR kód nezobrazuje, zadejte platbu ručně:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;font-size:16px;line-height:1.6;">
  <tr><td style="padding-right:16px;color:#667085;">IBAN</td><td><strong>${escapeHtml(input.iban)}</strong></td></tr>
  <tr><td style="padding-right:16px;color:#667085;">Částka</td><td><strong>${price}</strong></td></tr>
  <tr><td style="padding-right:16px;color:#667085;">Měna</td><td><strong>CZK</strong></td></tr>
  <tr><td style="padding-right:16px;color:#667085;">Variabilní symbol</td><td><strong>${escapeHtml(input.variableSymbol)}</strong></td></tr>
</table>
<p style="margin:0;color:#667085;">Po připsání platby předplatné automaticky obnovíme.</p>`;

  const text = [
    'Dobrý den,',
    '',
    `automatické strhnutí platby předplatného pro podnik ${input.businessName} se nezdařilo.`,
    'Předplatné prozatím zůstává aktivní — zaplaťte prosím převodem podle údajů níže.',
    '',
    `IBAN: ${input.iban}`,
    `Částka: ${price}`,
    'Měna: CZK',
    `Variabilní symbol: ${input.variableSymbol}`,
    '',
    'Po připsání platby předplatné automaticky obnovíme.',
  ].join('\n');

  return { subject, html: wrapEmail({ subject, body }), text };
}
