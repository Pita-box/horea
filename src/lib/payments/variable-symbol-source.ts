import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { generateVariableSymbol } from '@/lib/payments/variable-symbol';

/**
 * Server-side zdroj variabilního symbolu platebního pokusu.
 *
 * Spojuje monotónní DB sekvenci (`public.payment_variable_symbol_seq`, migrace
 * 0029) s čistou konverzí {@link generateVariableSymbol}. Sekvence je striktně
 * rostoucí a souběhu-bezpečná (`nextval`), takže výsledný VS je *zaručeně*
 * unikátní napříč `payments` — ne pouze pravděpodobnostně (design.md, sekce
 * *Variabilní symbol*, Property 3).
 *
 * Reuse: Checkout (task 8.3, první platba) i Billing_Engine (task 10.2, měsíční
 * charge) potřebují před vložením Payment přidělit VS. Volá výhradně server-side
 * service role; klient se proto předává jako parametr.
 */

export type NextVariableSymbolResult =
  | { ok: true; variableSymbol: string }
  | { ok: false; error: 'allocation_failed' };

/** Převede hodnotu vrácenou RPC (number nebo bigint jako string) na číslo. */
function toSequenceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Přidělí další variabilní symbol z monotónní sekvence.
 *
 * Zavolá RPC `next_payment_variable_symbol` (vrací další `nextval`) a převede
 * sekvenční hodnotu na dekadický VS. Selhání RPC, nečíselná návratová hodnota
 * nebo překročení 10 číslic se mapuje na `allocation_failed`.
 *
 * @param supabase Service-role Supabase klient.
 */
export async function nextVariableSymbol(
  supabase: SupabaseClient,
): Promise<NextVariableSymbolResult> {
  const { data, error } = await supabase.rpc('next_payment_variable_symbol');

  if (error) {
    return { ok: false, error: 'allocation_failed' };
  }

  const sequence = toSequenceNumber(data);
  if (sequence === null) {
    return { ok: false, error: 'allocation_failed' };
  }

  try {
    return { ok: true, variableSymbol: generateVariableSymbol(sequence) };
  } catch {
    return { ok: false, error: 'allocation_failed' };
  }
}
