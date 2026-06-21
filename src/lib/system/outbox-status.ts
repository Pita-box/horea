// Čistá agregace stavu e-mailové fronty (outbox) — bez I/O, bez PII.
// Tento modul je přímo pokrytý property-based testem (úkol 6.2).
// Záměrně neobsahuje žádné `server-only`, DB přístup ani jiné I/O;
// I/O wrapper `getOutboxStatus` je samostatný úkol (16.1).

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
