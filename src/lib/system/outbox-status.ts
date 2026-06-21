import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// Čistá agregace stavu e-mailové fronty (outbox) — bez I/O, bez PII.
// Tento modul je přímo pokrytý property-based testem (úkol 6.2);
// `server-only` je ve vitestu stubnuté, takže import čisté `summarizeOutbox` projde.
// I/O wrapper `getOutboxStatus` (úkol 16.1) je níže a NIKDY nečte PII sloupce.

/** Neidentifikující řádek outboxu pro agregaci — jen stav a časy (R17.5). */
export type OutboxRowMeta = {
  status: 'pending' | 'sent' | 'dead';
  createdAt: string; // ISO
  nextAttemptAt: string | null; // ISO; null u sent/dead
};

export type OutboxStatus = {
  counts: { pending: number; sent: number; dead: number };
  /** created_at nejstaršího pending řádku, nebo null pokud žádný pending (R17.2, R17.4). */
  oldestPendingAt: string | null;
  /** Počet pending řádků s next_attempt_at <= now (připravené k retry) (R17.3). */
  readyToRetry: number;
};

/**
 * Agreguje metadata řádků outboxu k času `now`:
 *  - `counts` rozdělí řádky podle stavu (součet counts == počet vstupních řádků) (R17.1),
 *  - `oldestPendingAt` = nejmenší created_at mezi pending, jinak null (R17.2, R17.4),
 *  - `readyToRetry` = počet pending s nextAttemptAt <= now (R17.3).
 * Vstup ani výstup neobsahuje žádné PII (R17.5). Funkce je čistá, bez I/O.
 */
export function summarizeOutbox(rows: OutboxRowMeta[], now: Date): OutboxStatus {
  const counts = { pending: 0, sent: 0, dead: 0 };
  let oldestPendingMs: number | null = null;
  let oldestPendingAt: string | null = null;
  let readyToRetry = 0;

  const nowMs = now.getTime();

  for (const row of rows) {
    counts[row.status] += 1;

    if (row.status !== 'pending') {
      continue;
    }

    // Nejstarší pending podle created_at (nejmenší časová hodnota).
    const createdMs = new Date(row.createdAt).getTime();
    if (oldestPendingMs === null || createdMs < oldestPendingMs) {
      oldestPendingMs = createdMs;
      oldestPendingAt = row.createdAt;
    }

    // Připraveno k retry: pending s next_attempt_at <= now.
    if (row.nextAttemptAt !== null && new Date(row.nextAttemptAt).getTime() <= nowMs) {
      readyToRetry += 1;
    }
  }

  return { counts, oldestPendingAt, readyToRetry };
}

/** Stavy řádku v DB tabulce `email_outbox` (1:1 s `OutboxRowMeta['status']`). */
const OUTBOX_STATUSES: readonly OutboxRowMeta['status'][] = ['pending', 'sent', 'dead'];

/** Tvar ne-PII řádku načteného z `email_outbox` (jen stav a časy). */
type OutboxStatusRow = {
  status: string;
  created_at: string;
  next_attempt_at: string | null;
};

/**
 * I/O wrapper: přes service-role klienta načte z `email_outbox` POUZE ne-PII
 * sloupce `status, created_at, next_attempt_at` (NIKDY `to_email`/`subject`/
 * `html_body`/`text_body`) a předá je čisté `summarizeOutbox` (R17.1, R17.5, R17.6).
 * Vrací `null`, pokud je zdroj nedostupný — volající pak zobrazí
 * „stav e-mailové fronty je momentálně nedostupný" místo pádu stránky (R17.7).
 */
export async function getOutboxStatus(): Promise<OutboxStatus | null> {
  try {
    const supabase = createAdminClient();

    // Záměrně jen ne-PII sloupce — žádný obsah e-mailu ani adresáta (R17.5).
    const { data, error } = await supabase
      .from('email_outbox')
      .select('status, created_at, next_attempt_at');

    if (error || !data) {
      return null;
    }

    // Mapování DB řádků na ne-PII metadata; neznámé stavy se bezpečně ignorují.
    const rows: OutboxRowMeta[] = (data as OutboxStatusRow[])
      .filter((row): row is OutboxStatusRow & { status: OutboxRowMeta['status'] } =>
        (OUTBOX_STATUSES as readonly string[]).includes(row.status),
      )
      .map((row) => ({
        status: row.status,
        createdAt: row.created_at,
        nextAttemptAt: row.next_attempt_at,
      }));

    return summarizeOutbox(rows, new Date());
  } catch {
    // Např. chybějící service-role env nebo síťová chyba → nedostupné (R17.7).
    return null;
  }
}
