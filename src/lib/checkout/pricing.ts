/**
 * Mapování tarifu na částku a sestavení záznamu Payment pro první platbu.
 *
 * Tři placené tarify mají pevnou měsíční cenu v CZK: `start` 199 Kč,
 * `pokrocily` 299 Kč, `max` 599 Kč. Tento modul drží mapování jako jediný zdroj
 * pravdy a sestavuje payload Payment řádku (`pending` / `auto_charge`) k vložení.
 * Samotný DB insert sem nepatří — provádí ho checkout (task 8.3). Viz
 * design.md, sekce *Checkout* a *Data Models*, a Requirement 1.1.
 */

/** Placený tarif předplatného (DB enum `subscription_plan`). */
export type SubscriptionPlan = 'start' | 'pokrocily' | 'max';

/** Způsob platby (DB enum `payment_method`). */
export type PaymentMethod = 'auto_charge' | 'qr_manual' | 'admin_manual';

/** Stav platby (DB enum `payment_status`). */
export type PaymentStatus = 'pending' | 'paid' | 'failed';

/** Pevný ceník tarifů v CZK (měsíční částka první i recurring platby). */
const PLAN_PRICE_CZK: Record<SubscriptionPlan, number> = {
  start: 199,
  pokrocily: 299,
  max: 599,
};

/**
 * Vrátí měsíční částku tarifu v CZK.
 *
 * @param plan Zvolený tarif.
 * @returns Částka v CZK odpovídající tarifu.
 */
export function planPriceCzk(plan: SubscriptionPlan): number {
  return PLAN_PRICE_CZK[plan];
}

/** Vstup pro sestavení Payment řádku první (auto-charge) platby. */
export interface BuildAutoChargePaymentInput {
  plan: SubscriptionPlan;
  businessId: string;
  subscriptionId: string;
  variableSymbol: string;
}

/** Payload Payment řádku k vložení do tabulky `payments` (sloupce v snake_case). */
export interface AutoChargePaymentRow {
  business_id: string;
  subscription_id: string;
  amount_czk: number;
  currency: 'CZK';
  variable_symbol: string;
  status: Extract<PaymentStatus, 'pending'>;
  method: Extract<PaymentMethod, 'auto_charge'>;
}

/**
 * Sestaví payload Payment řádku pro první platbu zvoleného tarifu.
 *
 * Vrací čistý objekt k vložení — Payment je ve stavu `pending`, metodou
 * `auto_charge`, s částkou dle tarifu a předaným variabilním symbolem. DB insert
 * se zde záměrně neprovádí (patří do checkout server action, task 8.3).
 *
 * @param input Tarif, identifikátory podniku a předplatného, variabilní symbol.
 * @returns Objekt připravený k vložení do tabulky `payments`.
 */
export function buildAutoChargePayment(input: BuildAutoChargePaymentInput): AutoChargePaymentRow {
  return {
    business_id: input.businessId,
    subscription_id: input.subscriptionId,
    amount_czk: planPriceCzk(input.plan),
    currency: 'CZK',
    variable_symbol: input.variableSymbol,
    status: 'pending',
    method: 'auto_charge',
  };
}
