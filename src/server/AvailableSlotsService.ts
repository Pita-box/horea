'use server';

import { serverLog } from '@/lib/log-server';
import { normalizeRouteSlug } from '@/lib/slug/route';
import { createPublicClient } from '@/lib/supabase/public';

import { loadAvailableSlotsDetailed } from './slots/loadAvailableSlots';

/**
 * Server action volaná z kroku 2 rezervačního formuláře. Tenký orchestrátor nad
 * sdíleným `loadAvailableSlots` (a tím pádem nad `Slot_Calculator`).
 *
 * Běží pod anon klíčem (R15.3). RLS povoluje čtení jen pro Published_Business,
 * navíc defenzivně ověřujeme publikovanost a existenci businessu přes RPC. Pokud
 * business neexistuje, není publikovaný, nebo služba nepatří businessu, vrací
 * prázdný seznam — klient v kroku 2 už profil nemá legitimně vidět (R9.1, R9.2).
 */
export type GetAvailableSlotsInput = {
  slug: string;
  /** Datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  date: string;
  /**
   * Uspořádaná množina vybraných služeb (R6.1). Combined_Duration = součet
   * trvání. Prázdná množina → `loadAvailableSlots` vrací `[]` (R6.4).
   */
  serviceIds: string[];
};

export type GetAvailableSlotsResult =
  | { ok: true; slots: string[]; durationExceedsDay: boolean }
  | { ok: false; message: string };

const LOAD_ERROR = 'Nepodařilo se načíst termíny, zkuste to prosím znovu.';

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci (R18.5).
  }
}

export async function getAvailableSlots(
  input: GetAvailableSlotsInput,
): Promise<GetAvailableSlotsResult> {
  try {
    const supabase = createPublicClient();
    const slug = normalizeRouteSlug(input.slug);

    // Stav profilu: rozliší 404 (žádný řádek) od nepublikovaného (published=false)
    // a vrátí bezpečné id bez úniku citlivých polí (SECURITY DEFINER funkce).
    const { data: state, error: stateError } = await supabase
      .rpc('get_public_business_state', { p_slug: slug })
      .maybeSingle<{ id: string; published: boolean }>();

    if (stateError) {
      throw stateError;
    }

    if (!state || !state.published) {
      return { ok: true, slots: [], durationExceedsDay: false };
    }

    const { slots, durationExceedsDay } = await loadAvailableSlotsDetailed(supabase, {
      businessId: state.id,
      serviceIds: input.serviceIds,
      dateISO: input.date,
    });

    return { ok: true, slots, durationExceedsDay };
  } catch (error) {
    await safeLog('available_slots_failed', { error });
    return { ok: false, message: LOAD_ERROR };
  }
}
