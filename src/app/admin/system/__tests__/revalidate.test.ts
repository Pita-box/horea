import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ALLOWED_PATHS, ALLOWED_TAGS } from '@/lib/system/cache-targets';

/**
 * Integrační test cílené revalidace cache (server action `revalidateTarget`).
 *
 * Ověřuje propojení allowlistu ({@link ALLOWED_PATHS}/{@link ALLOWED_TAGS}) s
 * vlastní revalidací `next/cache`:
 * - povolený cíl → odpovídající `revalidatePath`/`revalidateTag` se zavolá a
 *   vrátí se `{ ok: true, target }` (R10.1, R10.2, R10.4),
 * - cíl mimo allowlist → `{ ok: false }` a cache se **vůbec nedotkne** (R10.6).
 *
 * `requireAdmin` mockujeme jako úspěšného admina (test cílí na revalidaci, ne na
 * autorizaci); `next/cache` mockujeme jako spy, abychom ověřili volání.
 */

// requireAdmin → vždy úspěšný admin (předmětem testu je revalidace, ne autorizace).
const requireAdminMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: requireAdminMock,
}));

// next/cache → spy pro ověření, že (ne)dojde k revalidaci.
const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));

import { revalidateTarget } from '../actions';

beforeEach(() => {
  requireAdminMock.mockReset();
  revalidatePathMock.mockReset();
  revalidateTagMock.mockReset();
  // Výchozí stav: přihlášený administrátor.
  requireAdminMock.mockResolvedValue({
    ok: true,
    actorUserId: 'a',
    admin: {} as never,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('revalidateTarget — cílená revalidace cache', () => {
  it('povolená cesta → zavolá revalidatePath a vrátí { ok: true, target }', async () => {
    const target = { kind: 'path', value: ALLOWED_PATHS[0] } as const;

    const result = await revalidateTarget(target);

    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(ALLOWED_PATHS[0]);
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, target });
  });

  // Tagy běží jen pokud allowlist není prázdný (jinak žádný tag povolen — R10.5).
  if (ALLOWED_TAGS.length > 0) {
    it('povolený tag → zavolá revalidateTag a vrátí { ok: true, target }', async () => {
      const target = { kind: 'tag', value: ALLOWED_TAGS[0] } as const;

      const result = await revalidateTarget(target);

      expect(revalidateTagMock).toHaveBeenCalledTimes(1);
      expect(revalidateTagMock).toHaveBeenCalledWith(ALLOWED_TAGS[0]);
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true, target });
    });
  }

  it('cíl mimo allowlist → { ok: false } a cache se vůbec nedotkne (R10.6)', async () => {
    const target = { kind: 'path', value: '/nope' } as const;

    const result = await revalidateTarget(target);

    expect(result.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('neznámý tag mimo allowlist → { ok: false } bez revalidace (R10.6)', async () => {
    const target = { kind: 'tag', value: 'unknown-tag' } as const;

    const result = await revalidateTarget(target);

    expect(result.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
