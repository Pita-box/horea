/**
 * Klasifikace e-mailových chyb (poskytovatel-agnostická). Vytaženo zvlášť, aby
 * na tom mohl stavět outbox i dispatcher bez cyklického importu.
 */

/**
 * Vytáhne z chyby (Resend nebo zachycená výjimka) jen ncitlivý „kód" — název a
 * HTTP status. Záměrně NEvrací volný `message` (může v test režimu obsahovat PII).
 */
export function describeResendError(error: unknown): { code: string; statusCode?: number } {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; statusCode?: unknown; status?: unknown };
    const code = typeof candidate.name === 'string' ? candidate.name : 'unknown_error';
    const statusCode =
      typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : typeof candidate.status === 'number'
          ? candidate.status
          : undefined;

    return { code, statusCode };
  }

  return { code: 'unknown_error' };
}

/**
 * Je chyba odeslání přechodná (má smysl zkusit znovu)? Přechodné: 429 (rate
 * limit / quota), 5xx a neznámý/síťový stav (statusCode undefined). Permanentní:
 * 4xx (validace, neplatný příjemce, test režim 403) — opakování nepomůže.
 */
export function isRetryableStatus(statusCode?: number): boolean {
  if (statusCode === undefined) return true;
  if (statusCode === 429) return true;
  return statusCode >= 500;
}
