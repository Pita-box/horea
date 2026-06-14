import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromPragueInput, toPragueDisplay } from '@/lib/datetime';
import { calculateSlots } from '@/lib/slots';
import type { Reservation, SlotCalculatorInput } from '@/lib/slots';

/**
 * Sdílený most mezi DB a čistou funkcí `calculateSlots` (R9.3).
 *
 * Stejný algoritmus se volá ve dvou kontextech:
 *  - krok 2 formuláře (`AvailableSlotsService`, anon klient),
 *  - re-check před zápisem rezervace (`ReservationCreator`, admin klient).
 *
 * Aby byl výpočet IDENTICKÝ, přijímá helper Supabase klienta jako parametr a
 * sám si načte vstupy (otevírací doba, trvání služby, paralelní sloty, aktivní
 * rezervace). Doménová logika (grid, tolerance, kolize) zůstává výhradně v
 * `calculateSlots` — tento helper ji jen krmí daty.
 *
 * Pásmová pravidla: v DB je vše v UTC, sloty se počítají v lokálním čase
 * Europe/Prague (HH:mm). Den v týdnu je Po-first (0 = Po … 6 = Ne) shodně s
 * tabulkou `opening_hours`.
 */
export type LoadAvailableSlotsParams = {
  businessId: string;
  serviceId: string;
  /** Kalendářní datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
  dateISO: string;
  /**
   * Volitelné ID rezervace, kterou re-fetch aktivních rezervací VYLOUČÍ
   * (`id != excludeReservationId`). Potřeba při úpravě rezervace, aby
   * upravovaná rezervace nekolidovala se svým vlastním starým intervalem
   * (R9.3 specu reservation-management). Insert cesta parametr nepoužívá.
   */
  excludeReservationId?: string;
  /**
   * Vyžadovat publikovaný podnik (default `true`).
   *
   * - `true` (veřejná cesta, anon klient): aktivní rezervace se čtou přes
   *   SECURITY DEFINER funkci `get_active_reservation_intervals`, která vrací
   *   intervaly jen pro Published_Business (anon nemá přístup k tabulce).
   * - `false` (operace majitele — `Reservation_Editor`, `Manual_Reservation_Creator`):
   *   publikovanost se NEVYŽADUJE (R9/R12). Rezervace se čtou přímo z tabulky
   *   `reservations` přes předaného klienta (musí být service-role/admin, který
   *   obchází RLS), takže výpočet funguje i pro nepublikovaný podnik.
   */
  requirePublished?: boolean;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Po-first index dne v týdnu (0 = Po … 6 = Ne) pro kalendářní datum.
 *
 * Den v týdnu kalendářního data je nezávislý na pásmu (datum `2024-07-15` je
 * pondělí všude), proto stačí spočítat ho z UTC půlnoci daného data. JS vrací
 * 0 = Ne … 6 = So, převedeme na Po-first přes `(d + 6) % 7`.
 */
function pragueWeekday(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** Vrátí následující kalendářní den ve tvaru `YYYY-MM-DD`. */
function nextDateISO(dateISO: string): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/** "DD.MM.YYYY" reprezentace data pro porovnání s výstupem `toPragueDisplay`. */
function pragueDateLabel(dateISO: string): string {
  const [year, month, day] = dateISO.split('-');
  return `${day}.${month}.${year}`;
}

/** Postgres `time` vrací "HH:MM:SS"; `calculateSlots` očekává "HH:mm". */
function toHourMinute(pgTime: string): string {
  return pgTime.slice(0, 5);
}

export async function loadAvailableSlots(
  supabase: SupabaseClient,
  params: LoadAvailableSlotsParams,
): Promise<string[]> {
  const { businessId, serviceId, dateISO, excludeReservationId, requirePublished = true } = params;

  if (!DATE_PATTERN.test(dateISO)) {
    return [];
  }

  // Služba musí patřit danému businessu (R9.2) → její trvání.
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .eq('business_id', businessId)
    .maybeSingle<{ duration_minutes: number }>();

  if (serviceError) {
    throw serviceError;
  }
  if (!service) {
    return [];
  }

  // Nastavení paralelních slotů daného podniku.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('allow_parallel_slots')
    .eq('id', businessId)
    .maybeSingle<{ allow_parallel_slots: boolean }>();

  if (businessError) {
    throw businessError;
  }
  if (!business) {
    return [];
  }

  // Otevírací doba pro daný den. Chybějící řádek = zavřený den → žádné sloty.
  const dayOfWeek = pragueWeekday(dateISO);
  const { data: hours, error: hoursError } = await supabase
    .from('opening_hours')
    .select('opens_at,closes_at')
    .eq('business_id', businessId)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle<{ opens_at: string; closes_at: string }>();

  if (hoursError) {
    throw hoursError;
  }
  if (!hours) {
    return [];
  }

  // Aktivní rezervace v rámci Pražského dne. UTC hranice počítáme přes
  // `fromPragueInput`, takže půlnoc i přechody letního/zimního času sedí.
  const dayStartUtc = fromPragueInput(`${dateISO}T00:00`);
  const dayEndUtc = fromPragueInput(`${nextDateISO(dateISO)}T00:00`);

  // Čteme aktivní rezervace dne. Dvě cesty podle `requirePublished`:
  //  - veřejná (true): SECURITY DEFINER funkce vrací jen intervaly bez PII a jen
  //    pro Published_Business. Anon NEMÁ přímý přístup k tabulce `reservations`
  //    (migrace 0014), proto RPC.
  //  - majitel (false): publikovanost se nevyžaduje (R9/R12); čteme přímo z
  //    tabulky přes service-role klienta (obchází RLS), s vyloučením sebe sama.
  let rows: { starts_at: string; ends_at: string }[];

  if (requirePublished) {
    // `p_exclude_reservation_id` (migrace 0019) předáváme JEN když je zadán.
    const reservationArgs: Record<string, unknown> = {
      p_business_id: businessId,
      p_from: dayStartUtc.toISOString(),
      p_to: dayEndUtc.toISOString(),
    };
    if (excludeReservationId !== undefined) {
      reservationArgs.p_exclude_reservation_id = excludeReservationId;
    }

    const { data: reservationRows, error: reservationsError } = await supabase.rpc(
      'get_active_reservation_intervals',
      reservationArgs,
    );

    if (reservationsError) {
      throw reservationsError;
    }

    rows = (reservationRows ?? []) as { starts_at: string; ends_at: string }[];
  } else {
    // Majitelská cesta: přímý read z `reservations` (service-role obchází RLS),
    // bez požadavku na publikovanost, s vyloučením upravované rezervace.
    let ownerQuery = supabase
      .from('reservations')
      .select('starts_at,ends_at')
      .eq('business_id', businessId)
      .in('status', ['pending', 'approved'])
      .gte('starts_at', dayStartUtc.toISOString())
      .lt('starts_at', dayEndUtc.toISOString());

    if (excludeReservationId !== undefined) {
      ownerQuery = ownerQuery.neq('id', excludeReservationId);
    }

    const { data: ownerRows, error: ownerError } = await ownerQuery.returns<
      { starts_at: string; ends_at: string }[]
    >();

    if (ownerError) {
      throw ownerError;
    }

    rows = ownerRows ?? [];
  }

  // Každou rezervaci převedeme na lokální {start, end} v HH:mm. Rezervace, které
  // po převodu nespadají do cílového dne (DST hraniční případy), ignorujeme.
  const targetLabel = pragueDateLabel(dateISO);
  const reservations: Reservation[] = [];

  for (const row of rows) {
    const [startDate, startTime] = toPragueDisplay(row.starts_at).split(' ');

    if (startDate !== targetLabel) {
      continue;
    }

    const endTime = toPragueDisplay(row.ends_at).split(' ')[1];
    reservations.push({ start: startTime, end: endTime });
  }

  const input: SlotCalculatorInput = {
    config: {
      allowParallelSlots: business.allow_parallel_slots,
      timezone: 'Europe/Prague',
    },
    openingHours: {
      closed: false,
      opensAt: toHourMinute(hours.opens_at),
      closesAt: toHourMinute(hours.closes_at),
    },
    service: {
      durationMinutes: service.duration_minutes,
    },
    reservations,
  };

  return calculateSlots(input);
}
