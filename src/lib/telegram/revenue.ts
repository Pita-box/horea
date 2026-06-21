/**
 * Revenue_Calculator — čistý výpočet měsíčních tržeb pro Telegram příkaz `/trzby`
 * (feature `telegram-operator-notifications`, Requirements 9.2, 9.3, 13.1, 13.3).
 *
 * Tento modul obsahuje výhradně čistou logiku bez I/O. Filtr na platby se
 * `status='paid'` v daném kalendářním období i čtení z DB provádí až server-only
 * I/O vrstva (doplní samostatný task), která předá už filtrovaná data této funkci.
 * Tím zůstává výpočet triviálně testovatelný a nezávislý na čase a databázi.
 */

/**
 * Minimální tvar platby pro výpočet tržeb. Čte se pouze `amount_czk`;
 * filtr `paid`/období řeší volající I/O vrstva.
 */
export interface RevenuePaymentRow {
  amount_czk: number;
}

/**
 * Čistá funkce (R13.1): součet `amount_czk` vstupních plateb. Volající (I/O vrstva)
 * předá pouze platby se `status='paid'` v daném kalendářním měsíci (R9.2).
 * Prázdný vstup → 0 (R9.3, R13.3).
 */
export function calculateRevenueCzk(payments: ReadonlyArray<RevenuePaymentRow>): number {
  return payments.reduce((total, payment) => total + payment.amount_czk, 0);
}
