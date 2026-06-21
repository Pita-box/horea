// src/lib/system/__tests__/build-info.test.ts — příkladové unit testy pro getDeployInfo
//
// Ověřuje I/O wrapper `getDeployInfo`: mapování neutajených VERCEL_* proměnných,
// placeholder 'nedostupné' pro chybějící/neplatné údaje (R16.6) a to, že výstup
// nikdy neobsahuje hodnotu tajného klíče (R16.7). `process.env` mockujeme přes
// `vi.stubEnv`; `process.version` nelze snadno přepsat, proto jen ověřujeme, že
// `nodeVersion` odpovídá aktuálnímu `process.version`.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { UNAVAILABLE, getDeployInfo } from '@/lib/system/build-info';

describe('getDeployInfo', () => {
  afterEach(() => {
    // Úklid všech stubnutých proměnných prostředí mezi testy.
    vi.unstubAllEnvs();
  });

  it('mapuje nastavené VERCEL_* proměnné na správná pole', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc1234');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'main');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_123');

    const info = getDeployInfo();

    expect(info.commitSha).toBe('abc1234');
    expect(info.gitRef).toBe('main');
    expect(info.environment).toBe('production');
    expect(info.deployId).toBe('dpl_123');
    // nodeVersion se přebírá z process.version (nelze snadno přepsat).
    expect(info.nodeVersion).toBe(process.version);
  });

  it('používá fallback VERCEL_DEPLOY_ID, pokud VERCEL_DEPLOYMENT_ID chybí', () => {
    // Primární proměnná zcela chybí (undefined) → fallback přes nullish coalescing (`??`).
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined);
    vi.stubEnv('VERCEL_DEPLOY_ID', 'dpl_fallback');

    const info = getDeployInfo();

    expect(info.deployId).toBe('dpl_fallback');
  });

  it("vrací 'nedostupné' pro chybějící proměnné", () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_DEPLOY_ID', '');

    const info = getDeployInfo();

    expect(info.commitSha).toBe(UNAVAILABLE);
    expect(info.gitRef).toBe(UNAVAILABLE);
    expect(info.environment).toBe(UNAVAILABLE);
    expect(info.deployId).toBe(UNAVAILABLE);
  });

  it("vrací 'nedostupné' pro neplatnou hodnotu VERCEL_ENV", () => {
    vi.stubEnv('VERCEL_ENV', 'staging');

    const info = getDeployInfo();

    expect(info.environment).toBe(UNAVAILABLE);
  });

  it("ořezává bílé znaky a prázdnou hodnotu považuje za 'nedostupné'", () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '  deadbeef  ');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', '   ');

    const info = getDeployInfo();

    expect(info.commitSha).toBe('deadbeef');
    expect(info.gitRef).toBe(UNAVAILABLE);
  });

  it('nikdy neobsahuje hodnotu tajného klíče ve výstupu (R16.7)', () => {
    // Rozeznatelná hodnota tajemství vložená do prostředí.
    const secret = 'super-secret-service-role-key-DO-NOT-LEAK-9f8e7d';
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', secret);
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc1234');
    vi.stubEnv('VERCEL_ENV', 'production');

    const serialized = JSON.stringify(getDeployInfo());

    expect(serialized).not.toContain(secret);
  });
});
