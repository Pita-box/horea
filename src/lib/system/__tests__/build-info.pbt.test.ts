// Feature: admin-system-tools, Property 7: Informace o nasazení — placeholder pro chybějící a bez tajemství
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildDeployInfo,
  UNAVAILABLE,
  type DeployEnvironment,
} from '../build-info';

/**
 * Property 7: Informace o nasazení — placeholder pro chybějící a bez tajemství.
 *
 * Pro libovolnou mapu proměnných prostředí (s/bez `VERCEL_*`, neplatné `VERCEL_ENV`,
 * navíc tajné klíče jako `SUPABASE_SERVICE_ROLE_KEY` s rozeznatelnou hodnotou) a
 * libovolnou verzi Node.js musí `buildDeployInfo(env, nodeVersion)` splnit:
 *
 *  - chybějící/prázdná proměnná → `'nedostupné'` a nikdy se nepředstírá hodnota (R16.6);
 *  - `environment` je výhradně jedna z `production`/`preview`/`development`, jinak
 *    `'nedostupné'` (R16.3, R16.6);
 *  - `nodeVersion` ve výstupu je přesně předaná hodnota (R16.5);
 *  - v `JSON.stringify(result)` se NEvyskytuje žádná tajná hodnota (R16.7).
 *
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7**
 */
describe('build-info — Property 7: placeholder pro chybějící a bez tajemství', () => {
  // Povolené hodnoty Deploy_Environment (R16.3).
  const VALID_ENVIRONMENTS: readonly DeployEnvironment[] = [
    'production',
    'preview',
    'development',
  ];

  // Názvy tajných klíčů, které se v prostředí běžně vyskytují, ale do výstupu
  // nesmí nikdy proniknout (R16.7).
  const SECRET_KEYS = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'GOPAY_CLIENT_SECRET',
    'RESEND_API_KEY',
    'CRON_SECRET',
    'TELEGRAM_BOT_TOKEN',
  ] as const;

  // Hodnota proměnné, která může chybět (undefined), být prázdná, být jen bílé
  // znaky, nebo nést běžný řetězec — pokrývá obě větve `valueOrUnavailable`.
  const optionalEnvValue = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('   '),
    fc.string(),
  );

  // VERCEL_ENV: platné hodnoty, hodnoty s mezerami, neplatné/cizí řetězce i chybějící.
  const vercelEnvArb = fc.oneof(
    fc.constantFrom(...VALID_ENVIRONMENTS),
    fc.constantFrom(' production ', 'PRODUCTION', 'prod', 'staging', 'test', ''),
    fc.constant(undefined),
    fc.string(),
  );

  // Rozeznatelná tajná hodnota — sentinel prefix, aby ji šlo ve výstupu spolehlivě hledat.
  const secretValueArb = fc
    .string({ minLength: 1 })
    .map((s) => `__SECRET__${s}__`);

  // Celá mapa prostředí + seznam tajných hodnot, které do ní byly vloženy.
  const envArb = fc
    .record({
      commitSha: optionalEnvValue,
      gitRef: optionalEnvValue,
      vercelEnv: vercelEnvArb,
      deploymentId: optionalEnvValue,
      deployId: optionalEnvValue,
      secrets: fc.array(
        fc.tuple(fc.constantFrom(...SECRET_KEYS), secretValueArb),
        { maxLength: SECRET_KEYS.length },
      ),
    })
    .map((parts) => {
      const env: Record<string, string | undefined> = {
        VERCEL_GIT_COMMIT_SHA: parts.commitSha,
        VERCEL_GIT_COMMIT_REF: parts.gitRef,
        VERCEL_ENV: parts.vercelEnv,
        VERCEL_DEPLOYMENT_ID: parts.deploymentId,
        VERCEL_DEPLOY_ID: parts.deployId,
      };
      // Vlož tajné klíče s rozeznatelnými hodnotami.
      const secretValues = parts.secrets.map(([key, value]) => {
        env[key] = value;
        return value;
      });
      return { env, secretValues };
    });

  // Očekávaná hodnota pole, které prochází `valueOrUnavailable` (trim → prázdné = UNAVAILABLE).
  const expectValueOrUnavailable = (raw: string | undefined): string => {
    const trimmed = raw?.trim();
    return trimmed ? trimmed : UNAVAILABLE;
  };

  it('chybějící → nedostupné, environment je validní, nodeVersion sedí a žádné tajemství neuniká', () => {
    fc.assert(
      fc.property(
        envArb,
        fc.string(), // nodeVersion (např. 'v20.11.1' i libovolný řetězec)
        ({ env, secretValues }, nodeVersion) => {
          const result = buildDeployInfo(env, nodeVersion);

          // R16.1/R16.2/R16.4/R16.6: chybějící/prázdná proměnná → 'nedostupné', jinak oříznutá hodnota.
          expect(result.commitSha).toBe(
            expectValueOrUnavailable(env.VERCEL_GIT_COMMIT_SHA),
          );
          expect(result.gitRef).toBe(
            expectValueOrUnavailable(env.VERCEL_GIT_COMMIT_REF),
          );
          expect(result.deployId).toBe(
            expectValueOrUnavailable(
              env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_DEPLOY_ID,
            ),
          );

          // R16.3/R16.6: environment je jen z povolené množiny, jinak 'nedostupné'.
          const envTrimmed = env.VERCEL_ENV?.trim();
          const expectedEnvironment =
            envTrimmed &&
            (VALID_ENVIRONMENTS as readonly string[]).includes(envTrimmed)
              ? envTrimmed
              : UNAVAILABLE;
          expect(result.environment).toBe(expectedEnvironment);
          expect([...VALID_ENVIRONMENTS, UNAVAILABLE]).toContain(
            result.environment,
          );

          // R16.5: nodeVersion je přesně předaná hodnota.
          expect(result.nodeVersion).toBe(nodeVersion);

          // R16.7: v serializovaném výstupu se nesmí objevit žádná tajná hodnota.
          const serialized = JSON.stringify(result);
          for (const secret of secretValues) {
            expect(serialized.includes(secret)).toBe(false);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
