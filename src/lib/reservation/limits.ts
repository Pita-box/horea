/**
 * Sdílený zdroj pravdy o limitech počtu služeb v jedné rezervaci.
 *
 * Konstanty {@link MIN_SERVICES_PER_RESERVATION} a
 * {@link MAX_SERVICES_PER_RESERVATION} se používají z klienta (krok 1
 * rezervačního formuláře), ze serveru (validace zápisu) i v komentáři SQL
 * migrace `0049`. Jediný zdroj pravdy zabrání rozjetí limitu mezi vrstvami
 * (viz design.md, sekce *Konstanta limitů*; Requirements 5.1, 5.2, 5.3,
 * 1.5, 1.6).
 */

/** Nejnižší povolený počet služeb v jedné rezervaci. */
export const MIN_SERVICES_PER_RESERVATION = 1;

/** Nejvyšší povolený počet služeb v jedné rezervaci. */
export const MAX_SERVICES_PER_RESERVATION = 10;

/** Důvod, proč je počet služeb mimo povolený rozsah. */
export type ServiceCountInvalidReason = 'too_few' | 'too_many';

/** České chybové hlášky pro počet služeb mimo rozsah (R5.2, R5.3, R1.6). */
export const SERVICE_COUNT_ERROR_MESSAGES: Record<ServiceCountInvalidReason, string> = {
  too_few: 'Vyberte alespoň jednu službu',
  too_many: `Najednou lze vybrat nejvýše ${MAX_SERVICES_PER_RESERVATION} služeb`,
};

/**
 * Výsledek rozsahové validace počtu služeb.
 *
 * Tvar `{ ok: true } | { ok: false; reason; message }` je ergonomický pro
 * klient i server: klient zobrazí `message`, server mapuje `reason` na
 * validační chybu.
 */
export type ServiceCountValidationResult =
  | { ok: true }
  | { ok: false; reason: ServiceCountInvalidReason; message: string };

/**
 * Čistá rozsahová validace počtu služeb (R5.1, R5.2, R5.3, R1.5, R1.6).
 *
 * Počet je přijat právě tehdy, když platí
 * `MIN_SERVICES_PER_RESERVATION <= n <= MAX_SERVICES_PER_RESERVATION`.
 * Neceločíselné hodnoty se zaokrouhlí dolů (`Math.floor`) — defenzivně pro
 * případ nečekaného vstupu.
 *
 * @param n Počet vybraných služeb.
 */
export function validateServiceCount(n: number): ServiceCountValidationResult {
  const count = Math.floor(n);

  if (count < MIN_SERVICES_PER_RESERVATION) {
    return {
      ok: false,
      reason: 'too_few',
      message: SERVICE_COUNT_ERROR_MESSAGES.too_few,
    };
  }

  if (count > MAX_SERVICES_PER_RESERVATION) {
    return {
      ok: false,
      reason: 'too_many',
      message: SERVICE_COUNT_ERROR_MESSAGES.too_many,
    };
  }

  return { ok: true };
}
