// Command_Parser — čisté parsování příkazů z příchozí Telegram zprávy.
//
// Tento soubor obsahuje ZÁMĚRNĚ jen čisté funkce a typy (žádný `import 'server-only'`,
// žádné I/O), aby byly přímo pokryté property testy (viz task 3.5).

/** Známé příkazy operátorského bota. */
export type Command = 'trzby' | 'odhad' | 'stav' | 'start' | 'help';

/** Výsledek parsování: rozpoznaný příkaz, nebo neznámý text (R12.2). */
export type ParsedCommand =
  | { kind: 'command'; command: Command }
  | { kind: 'unknown' };

/** Množina podporovaných příkazů (jediný zdroj pravdy). */
const KNOWN_COMMANDS: ReadonlySet<Command> = new Set<Command>([
  'trzby',
  'odhad',
  'stav',
  'start',
  'help',
]);

/**
 * Čistá funkce: rozpozná příkaz z textu zprávy. Akceptuje vedoucí `/`, volitelný
 * `@botname` suffix (Telegram konvence) a okolní whitespace, case-insensitive (R8.1, R12.1).
 * Cokoli jiného → `unknown` (R12.2).
 */
export function parseCommand(text: string | undefined | null): ParsedCommand {
  if (!text) {
    return { kind: 'unknown' };
  }

  // Normalizace: odstranění okolního whitespace a sjednocení velikosti písmen.
  const normalized = text.trim().toLowerCase();

  // Příkaz musí začínat lomítkem.
  if (!normalized.startsWith('/')) {
    return { kind: 'unknown' };
  }

  // Odřízneme vedoucí '/' a případný '@botname' suffix (Telegram konvence).
  const token = normalized.slice(1).split('@', 1)[0];

  if ((KNOWN_COMMANDS as ReadonlySet<string>).has(token)) {
    return { kind: 'command', command: token as Command };
  }

  return { kind: 'unknown' };
}
