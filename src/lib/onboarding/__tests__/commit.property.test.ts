/**
 * Feature: auth-onboarding, Property 4: Atomicita commitu (error-mapping layer)
 *
 * POZNÁMKA K ROZSAHU TESTU
 * ------------------------
 * Task 17.4 původně navrhoval "in-memory mock DB s begin/commit/rollback" pro
 * ověření atomicity commitu. Skutečná all-or-nothing atomicita ale NEžije v
 * TypeScriptu — `commitOnboarding` je tenký wrapper, který volá Postgres funkci
 * `commit_onboarding` přes `supabase.rpc(...)`. Transakční garance (BEGIN/ROLLBACK)
 * zajišťuje Postgres (migrace 0012). In-memory mock transakce by tedy testoval
 * fikci, ne reálný kód.
 *
 * Atomicita na úrovni DB (Property 4 — DB level) se ověřuje integračními testy
 * 19.1 / 19.2 proti reálnému Postgresu.
 *
 * Tento soubor proto testuje JEDINOU reálně testovatelnou TS logiku ve wrapperu:
 * mapování chyb z RPC na `CommitOnboardingResult` (slug_taken vs transaction_failed).
 *
 * Validates: Requirements 12.3, 12.4
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import { commitOnboarding } from '../commit';

const SLUG_MARKERS = ['slug_taken', 'businesses_slug'] as const;

type RpcError = { code?: string; message?: string; details?: string };

/** Replikuje kontrakt `isSlugTakenError` z commit.ts pro účely generátorů. */
function hasSlugMarker(error: RpcError): boolean {
  if (error.code === '23505') {
    return true;
  }
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return SLUG_MARKERS.some((marker) => text.includes(marker));
}

/** Náhodná velikost písmen, aby property pokryla case-insensitivní matching. */
function randomCase(value: string): fc.Arbitrary<string> {
  return fc.array(fc.boolean(), { minLength: value.length, maxLength: value.length }).map((flags) =>
    value
      .split('')
      .map((char, index) => (flags[index] ? char.toUpperCase() : char.toLowerCase()))
      .join(''),
  );
}

const optionalString = fc.option(fc.string(), { nil: undefined });

/** Libovolná chybová struktura, která NEobsahuje žádný slug marker. */
const nonSlugErrorArb: fc.Arbitrary<RpcError> = fc
  .record({
    code: optionalString,
    message: optionalString,
    details: optionalString,
  })
  .filter((error) => !hasSlugMarker(error));

/** Chyba značená jako konflikt slugu — buď kódem 23505, nebo textovým markerem. */
const slugMarkerErrorArb: fc.Arbitrary<RpcError> = fc.oneof(
  fc.record({
    code: fc.constant('23505'),
    message: optionalString,
    details: optionalString,
  }),
  fc.constantFrom(...SLUG_MARKERS).chain((marker) =>
    fc.record({
      code: optionalString,
      message: fc
        .tuple(fc.string(), randomCase(marker), fc.string())
        .map(([prefix, mark, suffix]) => `${prefix}${mark}${suffix}`),
      details: optionalString,
    }),
  ),
  fc.constantFrom(...SLUG_MARKERS).chain((marker) =>
    fc.record({
      code: optionalString,
      message: optionalString,
      details: fc
        .tuple(fc.string(), randomCase(marker), fc.string())
        .map(([prefix, mark, suffix]) => `${prefix}${mark}${suffix}`),
    }),
  ),
);

beforeEach(() => {
  rpcMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('commitOnboarding error-mapping (Property 4)', () => {
  it('returns ok when the RPC reports no error', async () => {
    rpcMock.mockResolvedValue({ error: null });

    await expect(commitOnboarding('user-1')).resolves.toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('commit_onboarding', { uid: 'user-1' });
  });

  it('maps a unique-violation code (23505) to slug_taken', async () => {
    rpcMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    await expect(commitOnboarding('user-1')).resolves.toEqual({
      ok: false,
      error: 'slug_taken',
    });
  });

  it('maps a slug_taken message marker (case-insensitive) to slug_taken', async () => {
    rpcMock.mockResolvedValue({ error: { code: 'P0001', message: 'SLUG_TAKEN' } });

    await expect(commitOnboarding('user-1')).resolves.toEqual({
      ok: false,
      error: 'slug_taken',
    });
  });

  it('maps a businesses_slug detail marker to slug_taken', async () => {
    rpcMock.mockResolvedValue({
      error: { code: '23505', details: 'Key (slug) violates businesses_slug_key' },
    });

    await expect(commitOnboarding('user-1')).resolves.toEqual({
      ok: false,
      error: 'slug_taken',
    });
  });

  it('maps an unrelated error to transaction_failed', async () => {
    rpcMock.mockResolvedValue({ error: { code: '22023', message: 'draft_incomplete' } });

    await expect(commitOnboarding('user-1')).resolves.toEqual({
      ok: false,
      error: 'transaction_failed',
    });
  });

  it('maps ANY non-slug error to transaction_failed', async () => {
    await fc.assert(
      fc.asyncProperty(nonSlugErrorArb, async (error) => {
        rpcMock.mockResolvedValue({ error });

        const result = await commitOnboarding('user-1');

        expect(result).toEqual({ ok: false, error: 'transaction_failed' });
      }),
      { numRuns: 200 },
    );
  });

  it('maps ANY slug-marker error to slug_taken', async () => {
    await fc.assert(
      fc.asyncProperty(slugMarkerErrorArb, async (error) => {
        rpcMock.mockResolvedValue({ error });

        const result = await commitOnboarding('user-1');

        expect(result).toEqual({ ok: false, error: 'slug_taken' });
      }),
      { numRuns: 200 },
    );
  });
});
