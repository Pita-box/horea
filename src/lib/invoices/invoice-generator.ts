import 'server-only';

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';

import { allocateInvoiceNumber } from '@/lib/invoices/invoice-number';
import { toPragueDisplay } from '@/lib/datetime';

/**
 * Faktura_Generator — generování PDF faktury, uložení do Supabase Storage a zápis
 * odkazu do `payment.invoice_url` (R7.1, R7.5, R7.6).
 *
 * Číslo faktury se přiděluje atomicky až ve chvíli přechodu Payment na `paid`
 * přes {@link allocateInvoiceNumber} (gap-free per rok, viz invoice-number.ts a
 * Property 5). PDF se vykresluje knihovnou `pdf-lib` (čistý JS, bez nativních
 * závislostí). Standardní font Helvetica používá WinAnsi kódování, které
 * nepokrývá českou diakritiku (č, ř, ž, ě, ů, …); text faktury proto převádíme
 * na ASCII transliteraci ({@link toPdfSafe}) — bez nutnosti přibalovat TTF font.
 * Plná čeština zůstává v e-mailech a UI.
 *
 * Faktura se ukládá do privátního Storage bucketu (název z env
 * `SUPABASE_INVOICES_BUCKET`, default `invoices`) pod cestou `YYYY/<číslo>.pdf`.
 * Do `payment.invoice_url` ukládáme **cestu objektu** (stabilní, bez expirace);
 * stažení/odkaz do e-mailu se řeší podepsanou URL přes
 * {@link createInvoiceSignedUrl}. Volá výhradně server-side service role.
 *
 * Viz design.md, sekce *Faktura_Generator*, *Číslování faktur* a Requirement 7.
 */

const DEFAULT_BUCKET = 'invoices';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hodina — pro odkaz v e-mailu / stažení.

/** Údaje provozovatele platformy (vystavovatel faktury). */
const PLATFORM_SUPPLIER = {
  name: 'Horea',
  note: 'Platforma pro online rezervace',
} as const;

/** Vstup pro vygenerování a uložení faktury. */
export interface GenerateInvoiceInput {
  /** ID platby (`payments.id`), ke které faktura patří. */
  paymentId: string;
  /** Okamžik vystavení — určuje rok číselné řady (typicky čas přechodu na `paid`). */
  issuedAt: Date | string;
  /** Název podniku (odběratel). */
  businessName: string;
  /** Popis položky (např. „Předplatné Horea — tarif Start"). */
  description: string;
  /** Částka v CZK. */
  amountCzk: number;
  /** Variabilní symbol platby. */
  variableSymbol: string;
}

export type GenerateInvoiceResult =
  | { ok: true; invoiceNumber: string; storagePath: string; signedUrl: string | null }
  | { ok: false; error: 'allocation_failed' | 'pdf_failed' | 'upload_failed' | 'write_failed' };

function invoicesBucket(): string {
  return process.env.SUPABASE_INVOICES_BUCKET || DEFAULT_BUCKET;
}

/**
 * Transliteruje český text na ASCII (odstraní diakritiku) pro bezpečné vykreslení
 * standardním fontem Helvetica (WinAnsi). NFD rozloží znaky s diakritikou na
 * základní písmeno + kombinující značku, kterou odstraníme.
 */
export function toPdfSafe(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Naformátuje částku v CZK do ASCII tvaru pro PDF (např. „199,00 Kc"). */
function formatAmountPdf(amountCzk: number): string {
  return `${amountCzk.toFixed(2).replace('.', ',')} Kc`;
}

/** Datum vystavení v Praze ve tvaru `DD.MM.YYYY`. */
function issueDate(issuedAt: Date | string): string {
  return toPragueDisplay(issuedAt).split(' ')[0];
}

/**
 * Vykreslí PDF faktury do bajtů. Čistá funkce (bez DB/Storage) — usnadňuje
 * testování i znovupoužití. Veškerý text prochází {@link toPdfSafe}.
 */
export async function buildInvoicePdf(
  input: GenerateInvoiceInput & { invoiceNumber: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 v bodech.
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.13, 0.09, 0.3);
  const muted = rgb(0.4, 0.4, 0.45);
  const left = 56;
  let y = 785;

  const line = (
    text: string,
    options: { size?: number; bold?: boolean; color?: typeof ink; x?: number; gap?: number } = {},
  ) => {
    const size = options.size ?? 11;
    page.drawText(toPdfSafe(text), {
      x: options.x ?? left,
      y,
      size,
      font: options.bold ? fontBold : font,
      color: options.color ?? ink,
    });
    y -= options.gap ?? size + 8;
  };

  line('FAKTURA - DANOVY DOKLAD', { size: 20, bold: true, gap: 34 });

  line(`Cislo faktury: ${input.invoiceNumber}`, { bold: true });
  line(`Datum vystaveni: ${issueDate(input.issuedAt)}`, { color: muted, gap: 26 });

  line('Dodavatel', { bold: true, color: muted, size: 10 });
  line(PLATFORM_SUPPLIER.name, { bold: true });
  line(PLATFORM_SUPPLIER.note, { color: muted, gap: 26 });

  line('Odberatel', { bold: true, color: muted, size: 10 });
  line(input.businessName, { bold: true, gap: 30 });

  // Položka faktury.
  line('Popis', { bold: true, color: muted, size: 10, gap: 18 });
  line(input.description);
  line(`Castka: ${formatAmountPdf(input.amountCzk)}`, { gap: 26 });

  line(`Celkem k uhrade: ${formatAmountPdf(input.amountCzk)}`, { size: 14, bold: true, gap: 24 });

  line(`Variabilni symbol: ${input.variableSymbol}`, { color: muted });

  return doc.save();
}

/**
 * Vytvoří podepsanou URL pro stažení faktury z privátního bucketu (pro e-mail /
 * download). Vrací `null`, pokud se URL nepodaří vytvořit.
 *
 * @param supabase Service-role Supabase klient.
 * @param storagePath Cesta objektu uložená v `payment.invoice_url`.
 * @param expiresInSeconds Platnost odkazu (default 1 hodina).
 */
export async function createInvoiceSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(invoicesBucket())
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Vygeneruje fakturu pro zaplacenou platbu, uloží PDF do Supabase Storage a
 * zapíše číslo i odkaz do `payments` (R7.1, R7.5, R7.6).
 *
 * Postup:
 *  1. Přidělí pořadové číslo faktury pro rok vystavení ({@link allocateInvoiceNumber}).
 *  2. Vykreslí PDF ({@link buildInvoicePdf}).
 *  3. Nahraje PDF do privátního bucketu pod `YYYY/<číslo>.pdf`.
 *  4. Zapíše `invoice_number` a `invoice_url` (= cesta objektu) k platbě.
 *  5. Vrátí číslo, cestu a podepsanou URL k okamžitému odeslání e-mailem.
 *
 * @param supabase Service-role Supabase klient.
 * @param input Údaje platby a podniku pro fakturu.
 */
export async function generateAndStoreInvoice(
  supabase: SupabaseClient,
  input: GenerateInvoiceInput,
): Promise<GenerateInvoiceResult> {
  const issued = typeof input.issuedAt === 'string' ? new Date(input.issuedAt) : input.issuedAt;
  if (Number.isNaN(issued.getTime())) {
    return { ok: false, error: 'allocation_failed' };
  }
  const year = issued.getUTCFullYear();

  const allocation = await allocateInvoiceNumber(supabase, year);
  if (!allocation.ok) {
    return { ok: false, error: 'allocation_failed' };
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildInvoicePdf({ ...input, invoiceNumber: allocation.invoiceNumber });
  } catch {
    return { ok: false, error: 'pdf_failed' };
  }

  const storagePath = `${year}/${allocation.invoiceNumber}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(invoicesBucket())
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    return { ok: false, error: 'upload_failed' };
  }

  const { data, error: updateError } = await supabase
    .from('payments')
    .update({ invoice_number: allocation.invoiceNumber, invoice_url: storagePath })
    .eq('id', input.paymentId)
    .select('id')
    .maybeSingle();

  if (updateError || !data) {
    return { ok: false, error: 'write_failed' };
  }

  const signedUrl = await createInvoiceSignedUrl(supabase, storagePath);

  return { ok: true, invoiceNumber: allocation.invoiceNumber, storagePath, signedUrl };
}
