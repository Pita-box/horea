import { JEDEN_MESIC_SECONDS } from '@/lib/subscription/state-machine';

/**
 * Prodloužení předplatitelského období o jeden měsíc.
 *
 * Každá úspěšná platba (první, recurring i ručně spárovaná) prodlužuje
 * `current_period_end` přesně o Jeden_Mesic — délku definovanou jako 30 dní
 * (2 592 000 sekund). Konstanta se sdílí se stavovým automatem
 * ({@link JEDEN_MESIC_SECONDS}), aby nevznikly dvě nezávislé definice téže
 * hodnoty. Viz design.md, sekce *Stavový automat předplatného*, a Property 6.
 */

/**
 * Prodlouží konec období o přesně Jeden_Mesic (2 592 000 s).
 *
 * Čistá deterministická funkce: pro stejný vstup vždy vrátí stejný okamžik a
 * nemění vstupní hodnotu. Vstup i výstup pracují s UTC okamžikem (hodnota z DB).
 *
 * @param currentPeriodEnd Výchozí konec období (`Date` nebo ISO řetězec).
 * @returns Nový `Date` posunutý o Jeden_Mesic dopředu.
 * @throws Error pokud je vstupní datum neplatné.
 */
export function extendPeriod(currentPeriodEnd: Date | string): Date {
  const date = typeof currentPeriodEnd === 'string' ? new Date(currentPeriodEnd) : currentPeriodEnd;
  const ms = date.getTime();

  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro prodloužení období: "${String(currentPeriodEnd)}".`);
  }

  return new Date(ms + JEDEN_MESIC_SECONDS * 1000);
}
