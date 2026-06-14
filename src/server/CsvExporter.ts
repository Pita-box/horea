import 'server-only';

import { fromPragueInput, toPragueIso } from '@/lib/datetime';
import { serverLog } from '@/lib/log-server';
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
 *    budoucí", časový rozsah od–do inkluzivně v Europe/Prague, status, služba —
 *    konjunktivně). Jediný rozdíl je VYNECHÁNÍ stránkování.
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
 * Hlavička CSV v přesném pořadí sloupců (R17.3). Časová pole `starts_at`,
 * `ends_at` a `created_at` jsou ISO 8601 v Europe/Prague s offsetem.
 */
export const CSV_COLUMNS = [
  'id',
  'starts_at',
  'ends_at',
  'service_name',
  'client_name',
  'client_phone',
  'client_email',
  'note',
  'status',
  'attendance',
  'created_at',
] as const;

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
  services: { name: string } | { name: string }[] | null;
};

export type CsvExportResult =
  | { ok: true; csv: string; rowCount: number }
  | { ok: false; message: string };

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  exportFailed: 'Export se nepodařilo vytvořit. Zkuste to prosím znovu.',
} as const;

const SELECT_COLUMNS =
  'id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,note,created_at,services(name)';

function serviceName(services: ReservationExportRow['services']): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
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
  const fields: (string | null)[] = [
    row.id,
    toPragueIso(row.starts_at),
    toPragueIso(row.ends_at),
    serviceName(row.services),
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
 * v Europe/Prague (přepisuje výchozí pravidlo), status a služba konjunktivně.
 * Stránkování se zde VYNECHÁVÁ (R17.5).
 */
function applyFilters<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; in: (c: string, v: readonly string[]) => T }>(
  query: T,
  filters: ReservationFilters,
): T {
  let next = query;

  if (filters.statuses.length > 0) {
    next = next.in('status', filters.statuses);
  }
  if (filters.serviceIds.length > 0) {
    next = next.in('service_id', filters.serviceIds);
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

  // Čteme VŠECHNY vyfiltrované řádky po dávkách (R17.5) — bez UI stránkování.
  const rows: ReservationExportRow[] = [];
  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    const baseQuery = supabase
      .from('reservations')
      .select(SELECT_COLUMNS)
      .eq('business_id', business.id);

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
