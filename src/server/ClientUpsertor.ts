import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { serverLog } from '@/lib/log-server';

/**
 * Client_Upsertor (R15) — sdílená server-side komponenta volaná PO COMMITU
 * transakce rezervace (z veřejné cesty `ReservationCreator` i z
 * `Manual_Reservation_Creator`). Páruje kontakt klienta proti tabulce `clients`
 * v rámci stejného `business_id` a buď aktualizuje existující řádek, nebo vkládá
 * nový.
 *
 * KLÍČOVÉ vlastnosti:
 *  - **Best-effort (R15.5):** funkce NIKDY nevyhazuje výjimku. Jakákoli chyba se
 *    pouze zaloguje (`serverLog.warn` s `businessId` + chybou, bez jména/telefonu/
 *    e-mailu — R20/PII) a operace skončí. Selhání upsertu NESMÍ způsobit rollback
 *    už úspěšně vytvořené rezervace.
 *  - **Izolace na `business_id` (R15.6):** veškeré čtení i zápis do `clients`
 *    probíhá výhradně v rámci `business_id` rezervace.
 *
 * Párovací pravidlo (deterministické pořadí, R15.2):
 *  1. Je-li `clientPhone` vyplněn → hledá klienta podle NORMALIZOVANÉHO telefonu.
 *  2. Není-li nalezen podle telefonu NEBO telefon prázdný → hledá podle e-mailu
 *     (case-insensitive).
 *  3. Není-li nalezen ani jedním → INSERT nového klienta.
 */

export type UpsertClientFromReservationArgs = {
  supabase: SupabaseClient;
  businessId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
};

/** Řádek `clients` načtený jako kandidát pro párování. */
export type ClientCandidate = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Normalizace telefonu pro POROVNÁNÍ (ne pro uložení): odstraní mezery, pomlčky,
 * závorky a volitelný úvodní `+`. Díky tomu se `+420 777 888 999`,
 * `420777888999` i `(420) 777-888-999` napárují na téhož klienta (R15.2).
 * V DB zůstává `phone` v původním tvaru.
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }
  const stripped = phone.replace(/[\s\-()]/g, '');
  return stripped.startsWith('+') ? stripped.slice(1) : stripped;
}

/**
 * Čistá párovací logika (R15.2) nad množinou kandidátů jednoho podniku.
 * Telefon má prioritu před e-mailem; e-mail se porovnává case-insensitive.
 * Vrací první shodu nebo `null`.
 */
export function matchClient(
  candidates: ClientCandidate[],
  clientPhone: string,
  clientEmail: string,
): ClientCandidate | null {
  const normPhone = normalizePhone(clientPhone);
  if (normPhone) {
    const byPhone = candidates.find(
      (candidate) => candidate.phone && normalizePhone(candidate.phone) === normPhone,
    );
    if (byPhone) {
      return byPhone;
    }
  }

  const email = clientEmail.trim().toLowerCase();
  if (email) {
    const byEmail = candidates.find(
      (candidate) => candidate.email && candidate.email.trim().toLowerCase() === email,
    );
    if (byEmail) {
      return byEmail;
    }
  }

  return null;
}

/** Patch aplikovaný na nalezeného klienta. */
export type ClientPatch = {
  name?: string;
  phone?: string;
  email?: string;
};

/**
 * Čistě spočítá změny nad existujícím klientem (R15.3): `name` se aktualizuje na
 * hodnotu z rezervace; chybějící kontakt (`phone`/`email`) se doplní tam, kde byl
 * prázdný; již vyplněné kontakty se NEPŘEPISUJÍ. Prázdný patch znamená, že
 * rezervace nepřináší nic nového a řádek se ponechá beze změny.
 */
export function computeClientPatch(
  existing: ClientCandidate,
  clientName: string,
  clientPhone: string,
  clientEmail: string,
): ClientPatch {
  const patch: ClientPatch = {};

  if (clientName && existing.name !== clientName) {
    patch.name = clientName;
  }
  if (!existing.phone && clientPhone) {
    patch.phone = clientPhone;
  }
  if (!existing.email && clientEmail) {
    patch.email = clientEmail;
  }

  return patch;
}

async function safeWarn(businessId: string, error: unknown): Promise<void> {
  try {
    // Logujeme jen identifikátor podniku a chybu — NIKDY jméno/telefon/e-mail (R20/PII).
    await serverLog.warn('client_upsert_failed', { businessId, error });
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

export async function upsertClientFromReservation(
  args: UpsertClientFromReservationArgs,
): Promise<void> {
  const { supabase, businessId, clientName, clientPhone, clientEmail } = args;

  try {
    // Načteme kandidáty výhradně v rámci business_id (R15.6) a párujeme v JS,
    // protože `phone` je v DB uložen v původním (nenormalizovaném) tvaru.
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,phone,email')
      .eq('business_id', businessId);

    if (error) {
      await safeWarn(businessId, error);
      return;
    }

    const candidates: ClientCandidate[] = Array.isArray(data) ? (data as ClientCandidate[]) : [];
    const match = matchClient(candidates, clientPhone, clientEmail);

    if (match) {
      const patch = computeClientPatch(match, clientName, clientPhone, clientEmail);
      if (Object.keys(patch).length === 0) {
        // Rezervace nepřináší nic nového — řádek ponecháme beze změny (R15.3).
        return;
      }

      const { error: updateError } = await supabase
        .from('clients')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', match.id)
        .eq('business_id', businessId);

      if (updateError) {
        await safeWarn(businessId, updateError);
      }
      return;
    }

    // Nenalezen ani podle telefonu, ani e-mailu → INSERT nového klienta (R15.4).
    const { error: insertError } = await supabase.from('clients').insert({
      business_id: businessId,
      name: clientName,
      phone: clientPhone ? clientPhone : null,
      email: clientEmail ? clientEmail : null,
    });

    if (insertError) {
      await safeWarn(businessId, insertError);
    }
  } catch (error) {
    // Best-effort izolace: jakákoli chyba (vč. neočekávaných) se jen zaloguje,
    // rezervace zůstává zachována (R15.5).
    await safeWarn(businessId, error);
  }
}
