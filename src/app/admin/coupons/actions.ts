'use server';

import { revalidatePath } from 'next/cache';

import {
  createCoupon,
  deactivateCoupon,
  deleteCoupon,
  updateCoupon,
  type CouponInput,
} from '@/lib/admin/coupon-manager';
import { requireAdmin } from '@/lib/admin/require-admin';
import type { CouponType } from '@/lib/coupons/validate';

/**
 * Server actions správy kupónů admin dashboardu `/admin/coupons` (feature
 * `admin-dashboard`, Requirement 7, task 14.2).
 *
 * Každá akce nejprve ověří přihlášeného administrátora ({@link requireAdmin},
 * R1.5) — bez admin oprávnění se mutace neprovede — a teprve poté volá příslušnou
 * funkci CouponManageru se service-role klientem a actorem (admin user id z auth
 * kontextu) pro auditní stopu. Validace (duplicitní kód R7.2, `percent` mimo
 * 0–100 R7.3) i auditní zápis žijí v CouponManageru / DB; tato vrstva pouze
 * parsuje formulářová data a překládá výsledek na českou hlášku.
 */

/** Formulářový (řetězcový) vstup z client komponenty. */
export type CouponFormInput = {
  code: string;
  type: CouponType;
  /** Hodnota slevy jako řetězec; prázdná = bez hodnoty. */
  discountValue: string;
  /** Konec platnosti (`YYYY-MM-DD`); prázdné = neomezeně. */
  validUntil: string;
  /** Maximální počet použití jako řetězec; prázdné = neomezeně. */
  maxUses: string;
};

/** Výsledek akce pro client komponentu. */
export type CouponActionResult = { ok: true } | { ok: false; message: string };

function parseNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function toCouponInput(form: CouponFormInput): CouponInput {
  const validUntil = form.validUntil.trim();
  return {
    code: form.code.trim(),
    type: form.type,
    discountValue: parseNumberOrNull(form.discountValue),
    validUntil: validUntil === '' ? null : validUntil,
    maxUses: parseNumberOrNull(form.maxUses),
  };
}

export async function createCouponAction(form: CouponFormInput): Promise<CouponActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await createCoupon(auth.admin, auth.actorUserId, toCouponInput(form));
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath('/admin/coupons');
  return { ok: true };
}

export async function updateCouponAction(
  couponId: string,
  form: CouponFormInput,
): Promise<CouponActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await updateCoupon(auth.admin, auth.actorUserId, couponId, toCouponInput(form));
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath('/admin/coupons');
  return { ok: true };
}

export async function deactivateCouponAction(couponId: string): Promise<CouponActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await deactivateCoupon(auth.admin, auth.actorUserId, couponId);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath('/admin/coupons');
  return { ok: true };
}

export async function deleteCouponAction(couponId: string): Promise<CouponActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await deleteCoupon(auth.admin, auth.actorUserId, couponId);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath('/admin/coupons');
  return { ok: true };
}
