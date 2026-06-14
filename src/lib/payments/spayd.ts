import QRCode from 'qrcode';

/**
 * SPAYD (Short Payment Descriptor) 1.0 — český standard pro QR platby.
 *
 * Řetězec má tvar `SPD*1.0*` následovaný klíč-hodnota poli oddělenými `*`.
 * Tento modul kóduje platbu předplatného do SPAYD řetězce a generuje z něj QR
 * obrázek. Čistá funkce `encodeSpayd` je oddělena od generování obrázku
 * (`generateSpaydQrDataUrl`), aby šlo kódování testovat round-tripem bez závislosti
 * na QR knihovně. Viz design.md, sekce *SPAYD QR platba*, a Property 4.
 *
 * Relevantní pole:
 * - `ACC` — účet příjemce ve formátu IBAN (provozovatel platformy),
 * - `AM`  — částka v CZK (2 desetinná místa, round-trip bezpečné formátování),
 * - `CC`  — měna, vždy `CZK`,
 * - `X-VS`— variabilní symbol platebního pokusu (rozšiřující pole `X-`).
 */

const SPAYD_HEADER = 'SPD*1.0*';
const CURRENCY = 'CZK';

/** Vstup/výstup kódování SPAYD platby. */
export interface SpaydPayment {
  /** Účet příjemce ve formátu IBAN. */
  iban: string;
  /** Částka v CZK (nezáporná, nejvýše 2 desetinná místa). */
  amountCzk: number;
  /** Variabilní symbol — dekadický řetězec 1–10 číslic. */
  variableSymbol: string;
}

/**
 * Escapuje hodnotu pole dle SPAYD: znaky `*` (oddělovač polí) a `%` (escape prefix)
 * se nahrazují procentním kódováním. `%` se kóduje jako první, aby se nezdvojilo.
 */
function escapeValue(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('*', '%2A');
}

/**
 * Inverze {@link escapeValue}. `%2A` se dekóduje jako první, aby se literál `%25`
 * uvnitř hodnoty nerozbil.
 */
function unescapeValue(value: string): string {
  return value.replaceAll('%2A', '*').replaceAll('%25', '%');
}

/**
 * Naformátuje částku v CZK na 2 desetinná místa (round-trip bezpečné — dekódování
 * `parseFloat` vrátí stejnou hodnotu, pokud má vstup nejvýše 2 desetinná místa).
 */
function formatAmount(amountCzk: number): string {
  if (!Number.isFinite(amountCzk) || amountCzk < 0) {
    throw new Error(`Neplatná částka SPAYD: "${String(amountCzk)}". Očekávám nezáporné číslo.`);
  }
  return amountCzk.toFixed(2);
}

/**
 * Zakóduje platbu do SPAYD 1.0 řetězce.
 *
 * @param payment IBAN příjemce, částka v CZK a variabilní symbol.
 * @returns SPAYD řetězec, např. `SPD*1.0*ACC:CZ...*AM:199.00*CC:CZK*X-VS:12345`.
 */
export function encodeSpayd(payment: SpaydPayment): string {
  const fields = [
    `ACC:${escapeValue(payment.iban)}`,
    `AM:${formatAmount(payment.amountCzk)}`,
    `CC:${CURRENCY}`,
    `X-VS:${escapeValue(payment.variableSymbol)}`,
  ];

  return SPAYD_HEADER + fields.join('*');
}

/**
 * Dekóduje SPAYD řetězec zpět na platbu (inverze {@link encodeSpayd}). Slouží
 * k ověření round-trip bezpečnosti (Property 4) a obecnému čtení SPAYD řetězců.
 *
 * @param spayd SPAYD 1.0 řetězec.
 * @throws Error pokud řetězec nemá očekávanou hlavičku nebo postrádá povinná pole.
 */
export function decodeSpayd(spayd: string): SpaydPayment {
  if (!spayd.startsWith(SPAYD_HEADER)) {
    throw new Error('Neplatný SPAYD řetězec: chybí hlavička "SPD*1.0*".');
  }

  const body = spayd.slice(SPAYD_HEADER.length);
  const fields = new Map<string, string>();

  for (const segment of body.split('*')) {
    const separatorIndex = segment.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = segment.slice(0, separatorIndex);
    const value = segment.slice(separatorIndex + 1);
    fields.set(key, value);
  }

  const iban = fields.get('ACC');
  const amount = fields.get('AM');
  const variableSymbol = fields.get('X-VS');

  if (iban === undefined || amount === undefined || variableSymbol === undefined) {
    throw new Error('Neplatný SPAYD řetězec: chybí povinné pole (ACC, AM nebo X-VS).');
  }

  return {
    iban: unescapeValue(iban),
    amountCzk: Number.parseFloat(amount),
    variableSymbol: unescapeValue(variableSymbol),
  };
}

/**
 * Vygeneruje QR kód platby jako data URL (PNG) z SPAYD řetězce. Použito ve
 * fallback e-mailu při přechodu do grace_period.
 *
 * @param payment IBAN příjemce, částka v CZK a variabilní symbol.
 * @returns Data URL (`data:image/png;base64,...`) s QR kódem SPAYD platby.
 */
export function generateSpaydQrDataUrl(payment: SpaydPayment): Promise<string> {
  return QRCode.toDataURL(encodeSpayd(payment));
}
