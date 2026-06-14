import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CouponType } from '@/lib/coupons/validate';

/**
 * CouponManager — CRUD správa kupónů administrátorem (feature `admin-dashboard`,
 * task 14.1, R7.1–R7.8, Property 4 + 2).
 *
 * Skutečná atomicita „mutace + auditní záznam" NEŽIJE v TypeScriptu — Supabase JS
 * klient neumí držet jednu DB transakci přes více volání (stejná lekce jako
 * migrace 0035–0039). Žije v plpgsql SECURITY DEFINER funkcích `admin_create_coupon`,
 * `admin_update_coupon`, `admin_deactivate_coupon` a `admin_delete_coupon`
 * (migrace 0040), které ve STEJNÉ transakci provedou změnu a zavolají
 * `write_audit_log` (migrace 0035). Tím je zaručena Property 2 — právě jeden
 * auditní záznam na úspěšnou mutaci.
 *
 * VALIDACE (Property 4): validace rozsahu 0–100 pro typ `percent` (R7.3) probíhá
 * zde v TS PŘED voláním RPC a vrací českou hlášku; jako pojistka ji vynucuje i DB
 * (migrace 0040). Unikátnost `code` (R7.2) vynucuje DB unique constraint —
 * duplicitní kód se mapuje z SQLSTATE 23505 na českou hlášku.
 *
 * Seznam kupónů (R7.4) je pouhé čtení s `used_count` — neauditováno.
 *
 * Tyto funkce volá výhradně server-side service role (admin server action); klient
 * i actor (admin user id z auth kontextu) se předávají jako parametry.
 */

/** Záznam kupónu vrácený CouponManagerem (vč. `used_count` a `is_active`). */
export type CouponManagerRecord = {
  id: string;
  code: string;
  type: CouponType;
  discountValue: number | null;
  validUntil: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
};

/** Atributy kupónu pro vytvoření (R7.1) a úpravu (R7.5). */
export type CouponInput = {
  code: string;
  type: CouponType;
  /** Hodnota slevy; u typu `percent` povinná a v rozsahu 0–100 (R7.3). */
  discountValue: number | null;
  /** Konec platnosti; `null` = neomezeně. */
  validUntil: Date | string | null;
  /** Maximální počet použití; `null` = neomezeně. */
  maxUses: number | null;
};

/** Důvod selhání mutace kupónu. */
export type CouponMutationError =
  | 'duplicate_code'
  | 'invalid_percent'
  | 'not_found'
  | 'mutation_failed';

/** České chybové hlášky pro selhání mutace kupónu (R7.2, R7.3). */
export const COUPON_MUTATION_MESSAGES: Record<CouponMutationError, string> = {
  duplicate_code: 'Kupón s tímto kódem již existuje.',
  invalid_percent: 'Procentuální sleva musí být v rozsahu 0 až 100.',
  not_found: 'Kupón nebyl nalezen.',
  mutation_failed: 'Akci se nepodařilo dokončit, zkuste to prosím znovu.',
};

/** Výsledek mutace kupónu. */
export type CouponMutationResult =
  | { ok: true; coupon: CouponManagerRecord }
  | { ok: false; error: CouponMutationError; message: string };

type CouponRow = {
  id: string;
  code: string;
  type: CouponType;
  discount_value: number | string | null;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }
  return typeof value === 'string' ? Number(value) : value;
}

function normalizeRow(row: CouponRow): CouponManagerRecord {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    discountValue: toNumberOrNull(row.discount_value),
    validUntil: row.valid_until,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    isActive: row.is_active,
  };
}

function toIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum platnosti kupónu: "${String(value)}".`);
  }
  return date.toISOString();
}

function fail(error: CouponMutationError): CouponMutationResult {
  return { ok: false, error, message: COUPON_MUTATION_MESSAGES[error] };
}

/**
 * Validace hodnoty u typu `percent` (R7.3, Property 4): hodnota musí být
 * vyplněná a v rozsahu 0 až 100 včetně. Pro ostatní typy se neuplatní.
 *
 * @returns `true`, pokud je vstup validní; `false` pro `percent` mimo rozsah.
 */
function isPercentValueValid(type: CouponType, discountValue: number | null): boolean {
  if (type !== 'percent') {
    return true;
  }
  return discountValue !== null && discountValue >= 0 && discountValue <= 100;
}

/** Mapuje chybu z RPC na důvod selhání mutace (duplicitní kód / obecné selhání). */
function mapRpcError(error: { code?: string }): CouponMutationError {
  // 23505 = unique_violation (coupons.code) → duplicitní kód (R7.2).
  if (error.code === '23505') {
    return 'duplicate_code';
  }
  // 22023 = pojistka percent rozsahu z RPC (primárně chytáno v TS výše, R7.3).
  if (error.code === '22023') {
    return 'invalid_percent';
  }
  return 'mutation_failed';
}

function single(data: unknown): CouponRow | null {
  const row = (Array.isArray(data) ? data[0] : data) as CouponRow | null | undefined;
  return row ?? null;
}

/**
 * Načte všechny kupóny seřazené dle data vytvoření (nejnovější nahoře) včetně
 * aktuálního počtu použití `used_count` (R7.4). Pouhé čtení — neauditováno.
 *
 * @param supabase Service-role Supabase klient.
 */
export async function listCoupons(supabase: SupabaseClient): Promise<CouponManagerRecord[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, type, discount_value, valid_until, max_uses, used_count, is_active')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Načtení kupónů selhalo: ${error.message}`);
  }

  return ((data ?? []) as CouponRow[]).map(normalizeRow);
}

/**
 * Vytvoří kupón — ověří unikátnost `code` (R7.2) a rozsah 0–100 u typu `percent`
 * (R7.3), vloží záznam a ve stejné transakci zapíše auditní záznam `coupon_create`
 * (R7.1, R7.8, Property 4 + 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param actorUserId Administrátor (actor) provádějící akci — z auth kontextu.
 * @param input Atributy kupónu.
 * @returns `ok: true` s vytvořeným kupónem; `invalid_percent` pro `percent` mimo
 *   rozsah; `duplicate_code`, pokud `code` již existuje; `mutation_failed` jinak.
 */
export async function createCoupon(
  supabase: SupabaseClient,
  actorUserId: string,
  input: CouponInput,
): Promise<CouponMutationResult> {
  if (!isPercentValueValid(input.type, input.discountValue)) {
    return fail('invalid_percent');
  }

  const { data, error } = await supabase.rpc('admin_create_coupon', {
    p_actor_user_id: actorUserId,
    p_code: input.code,
    p_type: input.type,
    p_discount_value: input.discountValue,
    p_valid_until: toIso(input.validUntil),
    p_max_uses: input.maxUses,
  });

  if (error) {
    return fail(mapRpcError(error));
  }

  const row = single(data);
  if (!row) {
    return fail('mutation_failed');
  }

  return { ok: true, coupon: normalizeRow(row) };
}

/**
 * Upraví kupón — uloží změněné atributy a ve stejné transakci zapíše auditní
 * záznam `coupon_update` s before/after (R7.5, R7.8, Property 2). Validuje rozsah
 * `percent` (R7.3) a unikátnost `code` (R7.2).
 *
 * @param supabase Service-role Supabase klient.
 * @param actorUserId Administrátor (actor) provádějící akci.
 * @param couponId Identifikátor cílového kupónu.
 * @param input Nové atributy kupónu.
 * @returns `ok: true` s upraveným kupónem; `invalid_percent` / `duplicate_code` /
 *   `not_found` (kupón neexistuje) / `mutation_failed`.
 */
export async function updateCoupon(
  supabase: SupabaseClient,
  actorUserId: string,
  couponId: string,
  input: CouponInput,
): Promise<CouponMutationResult> {
  if (!isPercentValueValid(input.type, input.discountValue)) {
    return fail('invalid_percent');
  }

  const { data, error } = await supabase.rpc('admin_update_coupon', {
    p_actor_user_id: actorUserId,
    p_coupon_id: couponId,
    p_code: input.code,
    p_type: input.type,
    p_discount_value: input.discountValue,
    p_valid_until: toIso(input.validUntil),
    p_max_uses: input.maxUses,
  });

  if (error) {
    return fail(mapRpcError(error));
  }

  const row = single(data);
  if (!row) {
    return fail('not_found');
  }

  return { ok: true, coupon: normalizeRow(row) };
}

/**
 * Deaktivuje kupón — nastaví `is_active = false` bez mazání záznamu (R7.6) a ve
 * stejné transakci zapíše auditní záznam `coupon_deactivate` s before/after
 * (R7.8, Property 2). `used_count` zůstává zachován.
 *
 * @param supabase Service-role Supabase klient.
 * @param actorUserId Administrátor (actor) provádějící akci.
 * @param couponId Identifikátor cílového kupónu.
 * @returns `ok: true` s deaktivovaným kupónem; `not_found` / `mutation_failed`.
 */
export async function deactivateCoupon(
  supabase: SupabaseClient,
  actorUserId: string,
  couponId: string,
): Promise<CouponMutationResult> {
  const { data, error } = await supabase.rpc('admin_deactivate_coupon', {
    p_actor_user_id: actorUserId,
    p_coupon_id: couponId,
  });

  if (error) {
    return fail('mutation_failed');
  }

  const row = single(data);
  if (!row) {
    return fail('not_found');
  }

  return { ok: true, coupon: normalizeRow(row) };
}

/**
 * Smaže kupón (hard delete, R7.7) a ve stejné transakci zapíše auditní záznam
 * `coupon_delete` (before = poslední stav, after = null) (R7.8, Property 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param actorUserId Administrátor (actor) provádějící akci.
 * @param couponId Identifikátor cílového kupónu.
 * @returns `ok: true` s posledním stavem smazaného kupónu; `not_found` /
 *   `mutation_failed`.
 */
export async function deleteCoupon(
  supabase: SupabaseClient,
  actorUserId: string,
  couponId: string,
): Promise<CouponMutationResult> {
  const { data, error } = await supabase.rpc('admin_delete_coupon', {
    p_actor_user_id: actorUserId,
    p_coupon_id: couponId,
  });

  if (error) {
    return fail('mutation_failed');
  }

  const row = single(data);
  if (!row) {
    return fail('not_found');
  }

  return { ok: true, coupon: normalizeRow(row) };
}
