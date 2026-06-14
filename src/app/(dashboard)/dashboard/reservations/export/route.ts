import { exportReservationsCsv } from '@/server/CsvExporter';

/**
 * Route handler GET `/dashboard/reservations/export` (R17.1).
 *
 * `CSV_Exporter` (`exportReservationsCsv`) je `server-only`, ne server action —
 * proto ho zpřístupníme přes route handler. Filtry se přebírají z `searchParams`
 * URL (shodné s aktuálně vykresleným seznamem) a parsují se uvnitř exportéru
 * stejnou funkcí jako `Reservations_List`. Výstup je stahovaný CSV soubor.
 *
 * Autorizaci řeší `Active_Subscription_Gate` (middleware nad `/dashboard/*`) a
 * uvnitř exportéru ověření přihlášení + izolace na `business_id` majitele.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Převod `URLSearchParams` na tvar, který očekává `parseReservationFilters`
  // (string nebo pole pro opakované klíče).
  const searchParams: Record<string, string | string[] | undefined> = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    searchParams[key] = values.length > 1 ? values : values[0];
  }

  const result = await exportReservationsCsv(searchParams);

  if (!result.ok) {
    return new Response(result.message, {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(result.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rezervace.csv"',
    },
  });
}
