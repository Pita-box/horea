import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// Čistá funkce odvození čerstvosti GoPay webhooku (bez I/O, deterministická) +
// I/O wrapper `getWebhookFreshness` (úkol 18.1).
// Čistá `computeWebhookFreshness` je přímo pokrytá property-based testem (úkol 9.2);
// `server-only` je ve vitestu stubnuté, takže import čisté funkce projde.
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

/**
 * I/O wrapper: přes service-role klienta zjistí proxy čas poslední platebně
 * řízené aktivity jako `max(nejnovější subscriptions.updated_at,
 * nejnovější payments.created_at)` a předá ho čisté `computeWebhookFreshness`
 * s `isProxy = true` (R20.1, R20.2). Čte jen ne-PII časové sloupce.
 * Vrací `null`, pokud je zdroj nedostupný (chyba dotazu) — volající pak zobrazí
 * „čerstvost webhooku je momentálně nedostupná" místo pádu stránky (R20.7).
 */
export async function getWebhookFreshness(): Promise<WebhookFreshness | null> {
  try {
    const supabase = createAdminClient();

    // Nejnovější změna předplatného (subscriptions.updated_at).
    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (subError) {
      return null;
    }

    // Nejnovější platba (payments má jen created_at).
    const { data: payData, error: payError } = await supabase
      .from('payments')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    if (payError) {
      return null;
    }

    const latestSubscriptionAt = subData?.[0]?.updated_at ?? null;
    const latestPaymentAt = payData?.[0]?.created_at ?? null;

    // Proxy = pozdější z obou ISO časů; null, pokud oba chybí.
    let proxyAt: string | null = null;
    for (const candidate of [latestSubscriptionAt, latestPaymentAt]) {
      if (candidate === null) {
        continue;
      }
      if (proxyAt === null || new Date(candidate).getTime() > new Date(proxyAt).getTime()) {
        proxyAt = candidate;
      }
    }

    return computeWebhookFreshness(
      proxyAt,
      new Date(),
      WEBHOOK_FRESHNESS_THRESHOLD_HOURS,
      true,
    );
  } catch {
    // Např. chybějící service-role env nebo síťová chyba → nedostupné (R20.7).
    return null;
  }
}
