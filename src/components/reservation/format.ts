/**
 * Drobné formátovací helpery sdílené napříč kroky formuláře. Ceny v Kč podle
 * českého locale (R17.3), datum v českém tvaru pro souhrn (R8.1).
 */

const priceFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

/** Cena v Kč v českém formátu (oddělovač tisíců, desetinná místa jen když jsou). */
export function formatPriceCzk(value: number): string {
  return `${priceFormatter.format(value)} Kč`;
}

/**
 * Datum z tvaru `YYYY-MM-DD` (kalendářní den v Europe/Prague) na čitelný český
 * tvar `D. M. YYYY`. Pracujeme jen nad řetězcem — žádný `Date`, aby nedošlo k
 * posunu dne kvůli časovému pásmu.
 */
export function formatDateCs(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${Number(day)}. ${Number(month)}. ${year}`;
}
