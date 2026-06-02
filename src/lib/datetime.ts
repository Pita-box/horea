/**
 * Časové utility pro práci s pásmem Europe/Prague.
 *
 * V databázi ukládáme časy v UTC, v UI je zobrazujeme v lokálním čase
 * (Europe/Prague). Prague je UTC+1 v zimě (CET) a UTC+2 v létě (CEST, letní čas).
 * Modul používá výhradně nativní `Intl.DateTimeFormat` — žádná externí závislost.
 */

const TIME_ZONE = 'Europe/Prague';

/**
 * Vrátí offset pásma Europe/Prague vůči UTC pro daný okamžik (v milisekundách).
 * Kladná hodnota = pásmo je napřed před UTC (např. +3 600 000 ms v zimě, +7 200 000 ms v létě).
 *
 * Princip: okamžik naformátujeme tak, jak vypadá v Praze, výsledné složky
 * interpretujeme jako UTC a rozdíl proti skutečnému okamžiku je hledaný offset.
 */
function pragueOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }

  // Některé implementace vrací pro půlnoc hodinu '24' — normalizujeme na 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);

  return asUtc - instant.getTime();
}

/**
 * Naformátuje UTC okamžik pro zobrazení v pásmu Europe/Prague.
 * Výstup je 24hodinový formát `DD.MM.YYYY HH:mm` (např. `15.07.2024 13:30`).
 *
 * @param utcDate UTC okamžik jako `Date` nebo ISO řetězec (typicky hodnota z DB).
 */
export function toPragueDisplay(utcDate: Date | string): string {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Neplatné datum k zobrazení: "${String(utcDate)}".`);
  }

  const parts = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const hour = map.hour === '24' ? '00' : map.hour;

  return `${map.day}.${map.month}.${map.year} ${hour}:${map.minute}`;
}

/**
 * Převede lokální čas zadaný v pásmu Europe/Prague na UTC `Date` pro uložení do DB.
 * Vstup je „nástěnný" čas, jak ho zadá majitel podniku — tedy hodnota z HTML
 * `<input type="datetime-local">` ve tvaru `YYYY-MM-DDTHH:mm` (sekundy volitelné).
 *
 * Korektnost vůči letnímu času: offset pásma závisí na samotném okamžiku, proto
 * nejdřív odhadneme offset z naivního UTC a poté ho přepočítáme nad výsledným
 * okamžikem. Druhý průchod ošetří přechody letního/zimního času.
 *
 * @param localInput Lokální čas v Praze ve tvaru `YYYY-MM-DDTHH:mm` (nebo se sekundami).
 */
export function fromPragueInput(localInput: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localInput.trim());
  if (!match) {
    throw new Error(
      `Neplatný formát lokálního času: "${localInput}". Očekávám "YYYY-MM-DDTHH:mm".`,
    );
  }

  const [, year, month, day, hour, minute, second] = match;
  // Naivní UTC: nástěnný čas vezmeme, jako by byl rovnou v UTC.
  const naiveUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
  );

  const offset = pragueOffsetMs(new Date(naiveUtc));
  let utc = naiveUtc - offset;

  // Přepočet offsetu nad odhadnutým okamžikem (přechod letního času).
  const adjustedOffset = pragueOffsetMs(new Date(utc));
  if (adjustedOffset !== offset) {
    utc = naiveUtc - adjustedOffset;
  }

  return new Date(utc);
}
