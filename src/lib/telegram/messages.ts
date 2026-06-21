// Message_Builder — čisté buildery českých textů zpráv pro Telegram notifikace
// a odpovědi na příkazy operátora.
//
// Tento soubor obsahuje ZÁMĚRNĚ jen čisté funkce a typy (žádný `import 'server-only'`,
// žádné I/O), aby byly přímo pokryté property testy (P10, P11) a unit testy.
// Veškeré texty jsou v češtině; částky se formátují v CZK pro pásmo Europe/Prague.

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import type { HealthReport, ServiceStatus } from './health';

// ---------------------------------------------------------------------------
// Vstupní typy notifikací
// ---------------------------------------------------------------------------
//
// Pozn.: Tyto vstupní typy definujeme a exportujeme zde (nikoli v `notifications.ts`),
// aby se zabránilo cyklické závislosti a kvůli pořadí implementačních vln.
// Pozdější `notifications.ts` (task 8.1) je importuje/re-exportuje odtud.

/** Vstup notifikace o novém podniku — jen název a okamžik vzniku (R3.2, R3.3). */
export interface BusinessCreatedInput {
  businessName: string;
  /** Okamžik vzniku; formátuje se v Europe/Prague. */
  createdAt: Date;
}

/** Vstup notifikace o potvrzené platbě — název, tarif, částka (R4.2, R4.3). */
export interface PaymentConfirmedInput {
  businessName: string;
  plan: SubscriptionPlan;
  amountCzk: number;
}

// ---------------------------------------------------------------------------
// Formátování
// ---------------------------------------------------------------------------

/** Formátovač částek: cs-CZ oddělovač tisíců, bez desetinných míst (vzor `analytics.ts`). */
const czkFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

/**
 * Formát CZK: cs-CZ oddělovač tisíců, bez desetinných míst, sufix „ Kč" (R14.1, R14.2).
 * Po odstranění oddělovačů tisíců odpovídá číselný obsah vstupní (zaokrouhlené) částce.
 */
export function formatCzk(amountCzk: number): string {
  return `${czkFormatter.format(Math.round(amountCzk))} Kč`;
}

/** Formátovač data a času v pásmu Europe/Prague. */
const pragueDateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formát okamžiku v pásmu Europe/Prague (R3.2, R14.1). */
export function formatPragueDateTime(at: Date): string {
  return pragueDateTimeFormatter.format(at);
}

/** České labely placených tarifů (sladěno s `planDescription` v `handler.ts`). */
const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

/** České labely agregovaného i per-service stavu zdraví. */
const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: 'v pořádku',
  degraded: 'zhoršené',
  down: 'nedostupné',
};

// ---------------------------------------------------------------------------
// Notifikace (PUSH)
// ---------------------------------------------------------------------------

/** Notifikace o vzniku nového podniku — jen název a okamžik vzniku (R3.2, R3.3). */
export function buildBusinessCreatedMessage(input: BusinessCreatedInput): string {
  return [
    '🎉 Nový podnik',
    `Název: ${input.businessName}`,
    `Vznik: ${formatPragueDateTime(input.createdAt)}`,
  ].join('\n');
}

/** Notifikace o potvrzené platbě — název, tarif, částka (R4.2, R4.3). */
export function buildPaymentConfirmedMessage(input: PaymentConfirmedInput): string {
  return [
    '💰 Potvrzená platba',
    `Podnik: ${input.businessName}`,
    `Tarif: ${PLAN_LABEL[input.plan]}`,
    `Částka: ${formatCzk(input.amountCzk)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Odpovědi na příkazy
// ---------------------------------------------------------------------------

/** Odpověď na `/trzby` — tržby za aktuální měsíc (R9.1, R9.3). */
export function buildRevenueMessage(amountCzk: number): string {
  return `📊 Tržby za aktuální měsíc: ${formatCzk(amountCzk)}`;
}

/** Odpověď na `/odhad` — odhad tržeb příštího měsíce (R10.1, R10.4). */
export function buildEstimateMessage(amountCzk: number): string {
  return `📈 Odhad tržeb na příští měsíc: ${formatCzk(amountCzk)}`;
}

/** Odpověď na `/stav` — stav každé služby + agregovaný stav (R11.1). */
export function buildHealthMessage(report: HealthReport): string {
  const lines = report.services.map(
    (s) => `• ${s.label}: ${STATUS_LABEL[s.status]}`,
  );
  return [
    `🩺 Stav systému: ${STATUS_LABEL[report.aggregate]}`,
    ...lines,
  ].join('\n');
}

/** Odpověď na `/start` a `/help` — seznam dostupných příkazů (R12.1). */
export function buildHelpMessage(): string {
  return [
    'Dostupné příkazy:',
    '/trzby — tržby za aktuální měsíc',
    '/odhad — odhad tržeb na příští měsíc',
    '/stav — technický stav služeb',
    '/start — uvítání a nápověda',
    '/help — tato nápověda',
  ].join('\n');
}

/** Odpověď na neznámý text — odkaz na `/help` (R12.2). */
export function buildUnknownCommandMessage(): string {
  return 'Neznámý příkaz. Napište /help pro seznam dostupných příkazů.';
}
