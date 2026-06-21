// src/lib/system/email-cooldown.ts — ČISTÁ funkce (bez I/O)
//
// Vyhodnocení cooldownu pro odeslání testovacího e-mailu (R22.4).
// Soubor obsahuje pouze čistou funkci, typ a konstantu — žádné I/O,
// žádný `server-only`, žádné čtení `process.env` ani DB.

/** Délka cooldownu testovacího e-mailu v sekundách (Test_Email_Cooldown, R22.4). */
export const TEST_EMAIL_COOLDOWN_SECONDS = 60;

/** Stav cooldownu: buď povoleno, nebo zakázáno s kladným počtem zbývajících sekund. */
export type CooldownState =
  | { allowed: true }
  | { allowed: false; remainingSeconds: number };

/**
 * Vyhodnotí cooldown: odeslání je povoleno právě tehdy, když od posledního
 * úspěšného odeslání (`lastSentAt`) uplynulo alespoň `cooldownSeconds`.
 * Když je zakázáno, vrátí kladný počet zbývajících sekund zaokrouhlený nahoru (R22.4).
 * `lastSentAt = null` (nikdy neodesláno) → vždy povoleno.
 *
 * @param lastSentAt ISO časové razítko posledního úspěšného odeslání, nebo `null`.
 * @param now Aktuální čas.
 * @param cooldownSeconds Délka cooldownu v sekundách (kladná).
 */
export function computeCooldownState(
  lastSentAt: string | null,
  now: Date,
  cooldownSeconds: number,
): CooldownState {
  // Nikdy neodesláno → vždy povoleno.
  if (lastSentAt === null) {
    return { allowed: true };
  }

  // Uplynulý čas od posledního odeslání v sekundách.
  const elapsedSeconds = (now.getTime() - new Date(lastSentAt).getTime()) / 1000;

  // Povoleno, jakmile uplynul alespoň cooldown.
  if (elapsedSeconds >= cooldownSeconds) {
    return { allowed: true };
  }

  // Jinak zakázáno; zbývající doba je kladné celé číslo (zaokrouhleno nahoru).
  const remainingSeconds = Math.ceil(cooldownSeconds - elapsedSeconds);
  return { allowed: false, remainingSeconds };
}
