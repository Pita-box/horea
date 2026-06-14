import { describe, expect, it } from 'vitest';

import { shouldShowParallelToggle } from './visibility';

// Pokrývá Requirementy 5.6 a 5.7 — viditelnost přepínače paralelních termínů
// v závislosti na dostupnosti vysvětlujícího textu a aktuální hodnotě.
describe('shouldShowParallelToggle', () => {
  it('skryje přepínač, když vysvětlení chybí a hodnota je false (R5.6)', () => {
    expect(shouldShowParallelToggle(false, false)).toBe(false);
  });

  it('zobrazí přepínač, když vysvětlení chybí, ale hodnota je true (R5.7)', () => {
    expect(shouldShowParallelToggle(false, true)).toBe(true);
  });

  it('zobrazí přepínač vždy, když je vysvětlení dostupné', () => {
    expect(shouldShowParallelToggle(true, false)).toBe(true);
    expect(shouldShowParallelToggle(true, true)).toBe(true);
  });
});
