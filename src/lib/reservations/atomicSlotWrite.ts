import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { loadAvailableSlots } from '@/server/slots/loadAvailableSlots';

/**
 * Sdílená TS orchestrace atomického slot-zápisu (R9.3, R12.3 specu
 * reservation-management).
 *
 * Skutečná atomicita NEŽIJE v TypeScriptu — Supabase JS klient neumí držet
 * jednu DB transakci přes více volání. Žije v plpgsql SECURITY DEFINER funkci
 * (např. `public.create_reservation`, migrace 0015), která pod
 * `pg_advisory_xact_lock` provede overlap re-check + zápis v JEDNÉ transakci.
 *
 * Tato funkce je proto TS orchestrátor sdílený mezi:
 *  - `ReservationCreator` (insert nové rezervace, veřejná cesta),
 *  - budoucí `Reservation_Editor` (update s vyloučením sebe sama),
 *  - budoucí `Manual_Reservation_Creator` (ruční insert).
 *
 * Orchestrace má dva kroky:
 *  1. Pre-lock grid re-check přes sdílený `loadAvailableSlots` (`Slot_Calculator`).
 *     Pokud zvolený `time` není v aktuálním listu, vrátí `{ ok: false,
 *     kind: 'conflict', slots }` a `write` se VŮBEC nevolá.
 *  2. Jinak zavolá `write()` (konkrétní DB zápis — RPC) a vrátí jeho výsledek
 *     zabalený do `{ ok: true, value }`.
 *
 * Logování i interpretaci výsledku `write` (kódy chyb, post-commit e-maily)
 * řeší volající — tento modul zůstává čistým orchestrátorem bez vedlejších
 * efektů kromě čtení slotů a delegovaného zápisu.
 */
export type AtomicSlotWriteParams<T> = {
  supabase: SupabaseClient;
  businessId: string;
  /**
   * ID vybraných služeb v uloženém pořadí (`Reservation_Service_Set`, R5.1).
   * Předá se do `loadAvailableSlots`, kde se z nich spočítá `Combined_Duration`
   * pro pre-lock grid re-check (R7.2, R15.2).
   */
  serviceIds: string[];
  /** Kalendářní datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  dateISO: string;
  /** Počáteční čas slotu v pásmu Europe/Prague ve tvaru `HH:mm`. */
  time: string;
  /**
   * Volitelné ID rezervace vyloučené z konfliktní kontroly (vyloučení sebe sama
   * při úpravě, R9.3). Insert cesta ho nechává `undefined`.
   */
  excludeReservationId?: string;
  /**
   * Vyžadovat publikovaný podnik při pre-lock grid checku (default `true`).
   * Operace majitele (`Reservation_Editor`, `Manual_Reservation_Creator`) předají
   * `false` — publikovanost se u nich nevyžaduje (R9/R12) a rezervace se čtou
   * přímo přes service-role klienta.
   */
  requirePublished?: boolean;
  /** Konkrétní DB zápis pod zámkem (RPC). Volá se jen při dostupném slotu. */
  write: () => PromiseLike<T>;
};

export type AtomicSlotWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'conflict'; slots: string[] };

export async function atomicSlotWrite<T>(
  params: AtomicSlotWriteParams<T>,
): Promise<AtomicSlotWriteResult<T>> {
  const { supabase, businessId, serviceIds, dateISO, time, excludeReservationId, requirePublished, write } =
    params;

  // (1) Pre-lock grid re-check přes sdílený Slot_Calculator (R9.3).
  const slots = await loadAvailableSlots(supabase, {
    businessId,
    serviceIds,
    dateISO,
    excludeReservationId,
    requirePublished,
  });

  if (!slots.includes(time)) {
    return { ok: false, kind: 'conflict', slots };
  }

  // (2) Slot je dostupný → deleguj konkrétní atomický DB zápis.
  const value = await write();
  return { ok: true, value };
}
