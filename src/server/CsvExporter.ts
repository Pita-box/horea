import 'server-only';

import { fromPragueInput, toPragueIso } from '@/lib/datetime';
import { serverLog } from '@/lib/log-server';
import {
  combinedDuration,
  combinedPrice,
  joinServiceNames,
  type CombinableService,
} from '@/lib/reservation/combine';
import {
  parseReservationFilters,
  type ReservationFilters,
} from '@/lib/reservations/filters';
import type { AttendanceStatus, ReservationStatus } from '@/lib/reservations/labels';
import { createClient } from '@/lib/supabase/server';

/**
 * CSV_Exporter (R17) — server-side komponenta vracející CSV se VŠEMI rezervacemi
 * odpovídajícími aktuálním filtrům seznamu, bez ohledu na stránkování UI (R17.5).
 *
 * Klíčové vlastnosti:
 *  - **Shodné filtry jako vykreslený seznam (R17.1):** vstupní `searchParams`
 *    se parsují stejnou funkcí `parseReservationFilters` jako `Reservations_List`
 *    a aplikují se identické predikáty jako v tabulkovém pohledu (výchozí „pouze
 *    budoucí", časový rozsah od–do inkluzivně v Europe/Prague, status — konjunktivně).
 *    Filtr služby zahrne rezervaci při neprázdném průniku jejího
 *    `Reservation_Service_Set` s vyfiltrovanými službami (R14.3). Jediný rozdíl
 *    oproti seznamu je VYNECHÁNÍ stránkování.
 *  - **Kombinované rezervace (R14):** `service_name` spojuje názvy všech služeb
 *    v `Reservation_Service_Set` oddělovačem ` + ` v pořadí `position`; sloupce
 *    `combined_duration_minutes` a `combined_price_czk` nesou součty ze snapshotů.
 *  - **Izolace na `business_id` majitele (R17.4):** čte pod uživatelským JWT,
 *    RLS `tenant_isolation` navíc izoluje řádky na podnik majitele.
 *  - **UTF-8 s BOM + RFC 4180 (R17.2, R17.3):** hodnoty s čárkou, uvozovkou nebo
 *    novým řádkem se obalí uvozovkami se zdvojením vnitřních uvozovek.
 *  - **Streaming po řádcích:** řádky se z DB čtou po dávkách a CSV se generuje
 *    řádek po řádku (generátor), aby se velký export nemusel držet celý v paměti.
 *  - **Log bez PII (R17.6):** loguje se jen `business_id`, `user_id` a počet
 *    exportovaných řádků — nikdy jméno/telefon/e-mail/poznámka.
 */

/** UTF-8 BOM — zajistí správné rozpoznání kódování v Excelu (R17.2). */
export const UTF8_BOM = '\uFEFF';

/** Velikost dávky při čtení z DB (Supabase limituje jeden request). */
const FETCH_BATCH_SIZE = 1000;

/**
 * Hlavička CSV v přesném pořadí sloupců (R17.3, R14.2). Časová pole `starts_at`,
 * `ends_at` a `created_at` jsou ISO 8601 v Europe/Prague s offsetem.
 *
 * Sloupce `combined_duration_minutes` a `combined_price_czk` jsou umístěny hned
 * za `service_name`, aby zůstaly všechny údaje o službách rezervace pohromadě
 * (R14.2). `service_name` nově obsahuje názvy VŠECH služeb v Reservation_Service_Set
 * spojené ` + ` v pořadí `position` (R14.1).
 */
export const CSV_COLUMNS = [
  'id',
  'starts_at',
  'ends_at',
  'service_name',
  'combined_duration_minutes',
  'combined_price_czk',
  'client_name',
  'client_phone',
  'client_email',
  'note',
  'status',
  'attendance',
  'created_at',
] as const;

/** Vnořený řádek `reservation_services` se snapshotem délky/ceny a pořadím. */
type ReservationServiceExportRow = {
  position: number;
  price_czk_snapshot: number;
  duration_minutes_snapshot: number;
  services: { name: string } | { name: string }[] | null;
};

/** Surový řádek rezervace načtený z DB pro export. */
type ReservationExportRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  note: string | null;
  created_at: string;
  reservation_services: ReservationServiceExportRow[] | null;
};

export type CsvExportResult =
  | { ok: true; csv: string; rowCount: number }
  | { ok: false; message: string };

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  exportFailed: 'Export se nepodařilo vytvořit. Zkuste to prosím znovu.',
} as const;

const SELECT_COLUMNS =
  'id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,note,created_at,reservation_services(position,price_czk_snapshot,duration_minutes_snapshot,services(name))';

function serviceName(
  services: ReservationServiceExportRow['services'],
): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
}

/**
 * Převede vnořené řádky `reservation_services` na `CombinableService[]` pro
 * sdílené doménové helpery (`joinServiceNames`, `combinedDuration`,
 * `combinedPrice`). Řádky mohou přijít z PostgRESTu nesetříděné — pořadí podle
 * `position` zajistí až `joinServiceNames`; součty délky a ceny jsou na pořadí
 * nezávislé.
 */
function toCombinableServices(
  services: ReservationExportRow['reservation_services'],
): CombinableService[] {
  if (!services) {
    return [];
  }

  return services.map((row) => ({
    name: serviceName(row.services) ?? '',
    durationMinutes: row.duration_minutes_snapshot,
    priceCzk: row.price_czk_snapshot,
    position: row.position,
  }));
}

/**
 * RFC 4180 escaping jednoho pole (R17.2): hodnotu obsahující čárku, uvozovku
 * nebo nový řádek (`\n` i `\r`) obalí dvojitými uvozovkami a vnitřní uvozovky
 * zdvojí. `null`/`undefined` se serializuje jako prázdné pole.
 */
export function encodeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/** Sestaví jeden CSV řádek (bez ukončovacího CRLF) ze surového DB řádku. */
export function reservationToCsvRow(row: ReservationExportRow): string {
  const services = toCombinableServices(row.reservation_services);

  const fields: (string | null)[] = [
    row.id,
    toPragueIso(row.starts_at),
    toPragueIso(row.ends_at),
    joinServiceNames(services),
    String(combinedDuration(services)),
    String(combinedPrice(services)),
    row.client_name,
    row.client_phone,
    row.client_email,
    row.note,
    row.status,
    row.attendance,
    toPragueIso(row.created_at),
  ];

  return fields.map(encodeCsvField).join(',');
}

/**
 * Generuje CSV řádek po řádku (R17 — streaming): nejprve hlavička, poté jeden
 * řádek na rezervaci. Oddělovač řádků je CRLF dle RFC 4180.
 */
export function* generateCsvLines(rows: Iterable<ReservationExportRow>): Generator<string> {
  yield CSV_COLUMNS.join(',');
  for (const row of rows) {
    yield reservationToCsvRow(row);
  }
}

/**
 * Aplikuje na dotaz stejné predikáty jako tabulkový pohled `Reservations_List`
 * (R17.1) — výchozí „pouze budoucí", časový rozsah od–do inkluzivně
 * v Europe/Prague (přepisuje výchozí pravidlo) a status konjunktivně.
 * Stránkování se zde VYNECHÁVÁ (R17.5).
 *
 * Filtr služby se NEAPLIKUJE zde — řeší ho `collectServiceFilterReservationIds`
 * nad množinou `reservation_services` (test neprázdného průniku, R14.3), protože
 * PostgREST neumí filtrovat rodičovské řádky podle shody ve vnořeném embedu.
 */
function applyFilters<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; in: (c: string, v: readonly string[]) => T }>(
  query: T,
  filters: ReservationFilters,
): T {
  let next = query;

  if (filters.statuses.length > 0) {
    next = next.in('status', filters.statuses);
  }

  if (filters.from || filters.to) {
    if (filters.from) {
      next = next.gte('starts_at', fromPragueInput(`${filters.from}T00:00:00`).toISOString());
    }
    if (filters.to) {
      next = next.lte('starts_at', fromPragueInput(`${filters.to}T23:59:59`).toISOString());
    }
  } else {
    next = next.gte('starts_at', new Date().toISOString());
  }

  return next;
}

/**
 * Posbírá `reservation_id` všech rezervací podniku majitele, jejichž
 * `Reservation_Service_Set` má neprázdný průnik s vyfiltrovanými službami
 * (R14.3, R14.4). Čte z join tabulky `reservation_services` s inner joinem na
 * `reservations` kvůli izolaci na `business_id`; výsledné id pak omezí hlavní
 * dotaz na rezervace. Vrací `null` při chybě dotazu.
 */
async function collectServiceFilterReservationIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  serviceIds: string[],
): Promise<string[] | null> {
  const ids = new Set<string>();

  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    const { data, error } = await supabase
      .from('reservation_services')
      .select('reservation_id,reservations!inner(business_id)')
      .eq('reservations.business_id', businessId)
      .in('service_id', serviceIds)
      .range(offset, offset + FETCH_BATCH_SIZE - 1)
      .returns<{ reservation_id: string }[]>();

    if (error) {
      return null;
    }

    for (const row of data) {
      ids.add(row.reservation_id);
    }

    if (data.length < FETCH_BATCH_SIZE) {
      break;
    }
  }

  return Array.from(ids);
}

/**
 * Export aktuálně vyfiltrovaného seznamu rezervací do CSV (R17).
 *
 * @param searchParams Surové `searchParams` shodné s `Reservations_List` —
 *   parsují se stejnou funkcí, takže export odpovídá vykreslenému seznamu.
 */
export async function exportReservationsCsv(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CsvExportResult> {
  const filters = parseReservationFilters(searchParams);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  // Podnik přihlášeného majitele (R17.4) — RLS navíc izoluje řádky.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: MESSAGES.exportFailed };
  }

  // Filtr služby (R14.3, R14.4): rezervace se zahrne při neprázdném průniku
  // jejího Reservation_Service_Set s vyfiltrovanými službami. Id posbíráme
  // předem z join tabulky a hlavní dotaz pak omezíme na `id IN (...)`.
  const serviceFilterActive = filters.serviceIds.length > 0;
  let matchedReservationIds: string[] = [];
  if (serviceFilterActive) {
    const matched = await collectServiceFilterReservationIds(
      supabase,
      business.id,
      filters.serviceIds,
    );

    if (matched === null) {
      return { ok: false, message: MESSAGES.exportFailed };
    }

    matchedReservationIds = matched;
  }

  // Čteme VŠECHNY vyfiltrované řádky po dávkách (R17.5) — bez UI stránkování.
  const rows: ReservationExportRow[] = [];
  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    let baseQuery = supabase
      .from('reservations')
      .select(SELECT_COLUMNS)
      .eq('business_id', business.id);

    if (serviceFilterActive) {
      baseQuery = baseQuery.in('id', matchedReservationIds);
    }

    const { data, error } = await applyFilters(baseQuery, filters)
      .order('starts_at', { ascending: true })
      .range(offset, offset + FETCH_BATCH_SIZE - 1)
      .returns<ReservationExportRow[]>();

    if (error) {
      return { ok: false, message: MESSAGES.exportFailed };
    }

    rows.push(...data);

    if (data.length < FETCH_BATCH_SIZE) {
      break;
    }
  }

  // Generování CSV řádek po řádku + UTF-8 BOM (R17.2).
  const body = Array.from(generateCsvLines(rows)).join('\r\n');
  const csv = `${UTF8_BOM}${body}\r\n`;

  // Log bez PII — jen počet exportovaných řádků (R17.6).
  try {
    await serverLog.info('reservations_csv_exported', {
      businessId: business.id,
      userId: user.id,
      row_count: rows.length,
      action_type: 'csv_export',
    });
  } catch {
    // Logování je best-effort a nesmí shodit export.
  }

  return { ok: true, csv, rowCount: rows.length };
}
