/**
 * Rozhoduje, zda zobrazit přepínač paralelních termínů (Requirement 5.6–5.7):
 * - bez dostupného vysvětlení a hodnota `false` → přepínač skrýt (nelze zapnout bez vysvětlení),
 * - bez vysvětlení a hodnota `true` → přepínač zobrazit (aby šlo funkci kdykoli vypnout),
 * - s dostupným vysvětlením → přepínač zobrazit vždy.
 */
export function shouldShowParallelToggle(
  explanationAvailable: boolean,
  currentValue: boolean,
): boolean {
  return explanationAvailable || currentValue;
}
