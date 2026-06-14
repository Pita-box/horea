/**
 * Generátor variabilního symbolu platebního pokusu.
 *
 * Variabilni_Symbol je číselný identifikátor (1–10 číslic) sloužící k jednoznačnému
 * ručnímu spárování příchozí platby. Aby byla unikátnost *zaručená* (ne pouze
 * pravděpodobnostní jako u náhody), odvozuje se VS z **monotónní sekvence** —
 * typicky z databázové sekvence / counteru. Dekadický zápis nezáporného celého
 * čísla bez vodicích nul je injektivní zobrazení, takže různé sekvenční hodnoty
 * dávají vždy různé variabilní symboly. Viz design.md, sekce *Variabilní symbol*,
 * a Property 3.
 */

/** Nejvyšší přípustná sekvenční hodnota — 10 číslic (9 999 999 999). */
export const MAX_VARIABLE_SYMBOL_VALUE = 9_999_999_999;

/**
 * Převede monotónní sekvenční hodnotu na variabilní symbol (dekadický řetězec
 * o délce 1–10 číslic, bez vodicích nul).
 *
 * Funkce je čistá a deterministická: stejný vstup vždy vrátí stejný VS a různé
 * sekvenční hodnoty vrátí různé VS. Zdroj monotónnosti a unikátnosti sekvence
 * (DB counter) leží mimo tuto funkci.
 *
 * @param sequence Nezáporné celé číslo z monotónní sekvence (0 až 9 999 999 999).
 * @throws Error pokud sekvence není nezáporné celé číslo nebo přesahuje 10 číslic.
 */
export function generateVariableSymbol(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(
      `Sekvenční hodnota variabilního symbolu musí být nezáporné celé číslo, dostáno: "${String(sequence)}".`,
    );
  }

  if (sequence > MAX_VARIABLE_SYMBOL_VALUE) {
    throw new Error(
      `Sekvenční hodnota variabilního symbolu přesahuje 10 číslic (max ${MAX_VARIABLE_SYMBOL_VALUE}): ${sequence}.`,
    );
  }

  return String(sequence);
}
