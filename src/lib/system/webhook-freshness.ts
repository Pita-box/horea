// Čistá funkce odvození čerstvosti GoPay webhooku (bez I/O, deterministická).
// Tento modul je přímo pokrytý property-based testem (úkol 9.2).
// Záměrně neobsahuje žádné `server-only`, DB přístup ani jiné I/O.
// Výstup nikdy nenese Secret_Value ani Personal_Data — jen časové razítko a příznaky (R20.5).

/** Hranice čerstvosti webhooku v hodinách (R20.3). */
export const WEBHOOK_FRESHNESS_THRESHOLD_HOURS = 48;

/**
 * Odvozená čerstvost webhooku.
 * - Varianta bez aktivity: `{ hasActivity: false }` — „bez zaznamenané aktivity" (R20.4).
 * - Varianta s aktivitou: čas poslední platebně řízené aktivity, příznak `stale`
 *   a příznak `isProxy` (jde-li o odvozenou hodnotu vs. dedikovaný záznam přijetí).
 */
export type WebhookFreshness =
  | {
      hasActivity: true;
      /** Čas poslední platebně řízené aktivity (ISO). */
      lastActivityAt: string;
      /** True pokud je věk aktivity ostře větší než threshold (R20.3). */
      stale: boolean;
      /** Je to odvozená (proxy) hodnota, ne dedikovaný záznam přijetí (R20.2, R20.6). */
      isProxy: boolean;
    }
  | { hasActivity: false };

/**
 * Z času poslední platebně řízené aktivity (proxy: max(subscriptions.updated_at,
 * payments.created_at) nebo volitelný lehký záznam přijetí webhooku) odvodí
 * čerstvost vůči `now`. `stale` je pravdivé právě tehdy, když je věk aktivity
 * ostře větší než `thresholdHours`. Null vstup → `{ hasActivity: false }` (R20.4).
 * `isProxy` označuje, zda jde o odvozenou hodnotu (R20.2): true pro proxy,
 * false pro dedikovaný záznam přijetí (R20.6).
 */
export function computeWebhookFreshness(
  lastActivityAt: string | null,
  now: Date,
  thresholdHours: number,
  isProxy: boolean,
): WebhookFreshness {
  if (lastActivityAt === null) {
    return { hasActivity: false };
  }

  const MS_PER_HOUR = 60 * 60 * 1000;
  const ageMs = now.getTime() - new Date(lastActivityAt).getTime();
  const stale = ageMs > thresholdHours * MS_PER_HOUR;

  return { hasActivity: true, lastActivityAt, stale, isProxy };
}
