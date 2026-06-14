import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ruční párování příchozích bankovních plateb administrátorem — feature
 * `admin-dashboard`, PaymentMatcher, task 15.1 (R8.1–R8.5, Property 2).
 *
 * Tato vrstva je **spouštěč**, ne výpočet: seznam čekajících plateb (R8.1) a
 * vyhledání dle variabilního symbolu (R8.2) jsou pouhá čtení; vlastní spárování
 * (R8.3) deleguje na plpgsql funkci `admin_match_payment` (migrace 0039).
 *
 * ZNOVUPOUŽITÍ, NE DUPLIKACE: efekt prodloužení předplatného (přechod do `active`
 * + prodloužení období o Jeden_Mesic) vlastní `subscription-payments`. RPC jej jen
 * SPUSTÍ stejně jako webhook handler — znovupoužitím `apply_subscription_transition`
 * (migrace 0027) a stejné konstanty Jeden_Mesic jako `extendPeriod`. Tato feature
 * prodloužení nepočítá jako novou doménovou logiku.
 *
 * ATOMICITA: nastavení `paid`, spuštění efektu i auditní záznam běží v jedné
 * transakci RPC. Při selhání nastavení `paid` se celá transakce vrátí — platba
 * zůstává `pending` (R8.4) a wrapper vrátí chybu s českou hláškou. Úspěch vytvoří
 * právě jeden auditní záznam (R8.5, Property 2).
 *
 * Funkce volá výhradně server-side service role; actor (admin user id z auth
 * kontextu) se předává jako parametr.
 */

/** Položka seznamu čekajících plateb (Cekajici_Platba) k ručnímu spárování (R8.1). */
export type PendingPaymentItem = {
  /** Identifikátor platby. */
  id: string;
  /** Variabilní symbol pro spárování příchozí bankovní platby (R8.1, R8.2). */
  variableSymbol: string;
  /** Částka platby v Kč (R8.1). */
  amountCzk: number;
  /** Identifikátor podniku, kterému platba náleží (R8.1). */
  businessId: string;
  /** Název podniku (R8.1); `null`, pokud chybí. */
  businessName: string | null;
  /** Datum vytvoření platby (ISO řetězec) (R8.1). */
  createdAt: string;
};

/** Výsledek spárování platby. */
export type MatchPaymentResult =
  | {
      ok: true;
      paymentId: string;
      subscriptionId: string;
      businessId: string;
      currentPeriodEnd: string | null;
    }
  | { ok: false; error: 'not_found' | 'match_failed' };

type RawPendingRow = {
  id: string;
  variable_symbol: string;
  amount_czk: number | string;
  business_id: string;
  created_at: string;
  businesses: { name: string | null } | { name: string | null }[] | null;
};

type MatchRow = {
  payment_id: string;
  subscription_id: string;
  business_id: string;
  current_period_end: string | null;
};

function normalizePendingRow(row: RawPendingRow): PendingPaymentItem {
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  return {
    id: row.id,
    variableSymbol: row.variable_symbol,
    amountCzk: typeof row.amount_czk === 'string' ? Number(row.amount_czk) : row.amount_czk,
    businessId: row.business_id,
    businessName: business?.name ?? null,
    createdAt: row.created_at,
  };
}

const PENDING_SELECT = 'id, variable_symbol, amount_czk, business_id, created_at, businesses(name)';

/**
 * Načte všechny čekající platby (Cekajici_Platba = `pending` + `qr_manual`) s
 * variabilním symbolem, částkou, podnikem a datem vytvoření, seřazené sestupně dle
 * data vytvoření (R8.1).
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 */
export async function listPendingPayments(
  supabase: SupabaseClient,
): Promise<PendingPaymentItem[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(PENDING_SELECT)
    .eq('status', 'pending')
    .eq('method', 'qr_manual')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Načtení čekajících plateb selhalo: ${error.message}`);
  }

  return ((data ?? []) as RawPendingRow[]).map(normalizePendingRow);
}

/**
 * Vyhledá čekající platby (Cekajici_Platba) podle variabilního symbolu (R8.2).
 *
 * @param supabase Service-role Supabase klient.
 * @param variableSymbol Hledaný variabilní symbol.
 */
export async function searchPendingPaymentsByVariableSymbol(
  supabase: SupabaseClient,
  variableSymbol: string,
): Promise<PendingPaymentItem[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(PENDING_SELECT)
    .eq('status', 'pending')
    .eq('method', 'qr_manual')
    .eq('variable_symbol', variableSymbol)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Vyhledání čekající platby selhalo: ${error.message}`);
  }

  return ((data ?? []) as RawPendingRow[]).map(normalizePendingRow);
}

/**
 * Spáruje vybranou čekající platbu — nastaví `payment.status = paid`, čímž spustí
 * efekt prodloužení ze `subscription-payments` (přechod do `active` + prodloužení
 * období), a ve stejné transakci zapíše auditní záznam `payment_match` (R8.3,
 * R8.5, Property 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor a cílová platba.
 * @returns `ok: true` s identifikátory a novým koncem období; `not_found`, pokud
 *   platba neexistuje; `match_failed`, pokud spárování selhalo nebo platba není ve
 *   stavu `pending` — platba v takovém případě zůstává `pending` (R8.4).
 */
export async function matchPayment(
  supabase: SupabaseClient,
  input: { actorUserId: string; paymentId: string },
): Promise<MatchPaymentResult> {
  const { data, error } = await supabase.rpc('admin_match_payment', {
    p_actor_user_id: input.actorUserId,
    p_payment_id: input.paymentId,
  });

  if (error) {
    return { ok: false, error: 'match_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as MatchRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  return {
    ok: true,
    paymentId: row.payment_id,
    subscriptionId: row.subscription_id,
    businessId: row.business_id,
    currentPeriodEnd: row.current_period_end,
  };
}
