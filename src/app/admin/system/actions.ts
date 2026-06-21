'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin } from '@/lib/admin/require-admin';
import { isAllowedTarget, type RevalidateTarget } from '@/lib/system/cache-targets';

/**
 * Server actions stránky Správa systému `/admin/system` (feature
 * `admin-system-tools`).
 *
 * Defense in depth (R2.4): Access_Guard middleware chrání vykreslení `/admin/*`,
 * ale každá akce zde **nezávisle znovu ověří** admin roli server-side přes
 * existující {@link requireAdmin} — nespoléhá se jen na middleware.
 *
 * Tento soubor je prvním ze série actions; další (`triggerCron`, `pruneCronRuns`,
 * `recheckHealth`, `sendTestEmail`) přibydou sem.
 */

// ---------------------------------------------------------------------------
// Cache_Revalidator (R10, R15)
// ---------------------------------------------------------------------------

/** Výsledek cílené revalidace cache pro client komponentu (R10.4, R15.3). */
export type RevalidateTargetResult =
  | { ok: true; target: RevalidateTarget }
  | { ok: false; message: string };

/** Česká hláška při cíli mimo allowlist (R10.6). */
const NOT_ALLOWED_MESSAGE = 'Tento cíl revalidace není povolen.';

/**
 * Cíleně reviduje cache pro povolený cíl (R10.1, R10.2, R10.5, R10.6, R15.1, R15.3).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R15.1).
 *    Bez oprávnění se cache **nedotkne** a vrátí se česká hláška.
 * 2. Vynucení allowlistu ({@link isAllowedTarget}, R10.5). Cíl mimo allowlist →
 *    `{ ok: false }` **bez** dotčení cache (R10.6).
 * 3. Vlastní revalidace: `path` → {@link revalidatePath}, `tag` → {@link revalidateTag}.
 *    Výsledek obsahuje název cíle pro zobrazení v UI (R10.4, R15.3).
 */
export async function revalidateTarget(target: RevalidateTarget): Promise<RevalidateTargetResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  // Mimo allowlist → odmítnutí bez jakéhokoli dotčení cache (R10.6).
  if (!isAllowedTarget(target)) {
    return { ok: false, message: NOT_ALLOWED_MESSAGE };
  }

  if (target.kind === 'path') {
    revalidatePath(target.value);
  } else {
    revalidateTag(target.value);
  }

  return { ok: true, target };
}
