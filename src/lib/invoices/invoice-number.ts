import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Atomické přidělení pořadového čísla faktury per kalendářní rok.
 *
 * České účetnictví vyžaduje souvislou (gap-free) striktně rostoucí číselnou řadu
 * daňových dokladů v rámci kalendářního roku. Skutečné zamykání (`SELECT ... FOR
 * UPDATE`) NEJDE přes Supabase JS klient, proto přidělení žije v plpgsql funkci
 * `public.allocate_invoice_number` (migrace 0028), která pod zámkem řádku roku
 * serializuje souběžná přidělení. Číslo se přiděluje až při přechodu Payment na
 * `paid`, takže neúspěšné pokusy nespotřebovávají čísla → žádné mezery. Viz
 * design.md, sekce *Číslování faktur*, a Property 5.
 *
 * Volá ji výhradně server-side service role (Faktura_Generator); klient se proto
 * předává jako parametr.
 */

export type AllocateInvoiceNumberResult =
  | { ok: true; year: number; sequence: number; invoiceNumber: string }
  | { ok: false; error: 'invalid_year' | 'allocation_failed' };

/**
 * Sestaví zobrazované číslo faktury z roku a pořadové sekvence.
 *
 * Formát `YYYY-NNNN` — prefix obsahuje rok (řada se na začátku roku restartuje),
 * sekvence je doplněna nulami na min. 4 číslice. Čistá deterministická funkce.
 *
 * @param year Kalendářní rok.
 * @param sequence Pořadová sekvence v daném roce (≥ 1).
 */
export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Přidělí další pořadové číslo faktury pro daný rok přes atomickou RPC.
 *
 * Vrací jak surovou `sequence` (gap-free, striktně rostoucí v rámci roku — viz
 * Property 5), tak zformátované `invoiceNumber` k uložení do `payment.invoice_url`
 * / zobrazení na faktuře.
 *
 * @param supabase Service-role Supabase klient.
 * @param year Kalendářní rok přidělení (typicky rok přechodu Payment na `paid`).
 */
export async function allocateInvoiceNumber(
  supabase: SupabaseClient,
  year: number,
): Promise<AllocateInvoiceNumberResult> {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    return { ok: false, error: 'invalid_year' };
  }

  const { data, error } = await supabase.rpc('allocate_invoice_number', { p_year: year });

  if (error || typeof data !== 'number' || !Number.isInteger(data) || data < 1) {
    return { ok: false, error: 'allocation_failed' };
  }

  return { ok: true, year, sequence: data, invoiceNumber: formatInvoiceNumber(year, data) };
}
