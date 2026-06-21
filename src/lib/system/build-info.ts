// src/lib/system/build-info.ts — ČISTÁ funkce (bez I/O)
//
// Sestavuje informace o nasazení (Build_Inspector, R16) výhradně z neutajených
// proměnných prostředí a verze Node.js. Tento modul záměrně neobsahuje žádné
// I/O — nečte `process.env` ani `process.version`; tenký wrapper `getDeployInfo`
// (task 15.1) předá hodnoty jako parametry.

/** Prostředí nasazení odvozené z `VERCEL_ENV` (R16.3). */
export type DeployEnvironment = 'production' | 'preview' | 'development';

export type DeployInfo = {
  /** VERCEL_GIT_COMMIT_SHA nebo 'nedostupné' (R16.1, R16.6). */
  commitSha: string;
  /** VERCEL_GIT_COMMIT_REF nebo 'nedostupné' (R16.2, R16.6). */
  gitRef: string;
  /** Odvozeno z VERCEL_ENV; mimo množinu → 'nedostupné' (R16.3, R16.6). */
  environment: DeployEnvironment | 'nedostupné';
  /** Identifikátor nasazení (např. VERCEL_DEPLOYMENT_ID) nebo 'nedostupné' (R16.4, R16.6). */
  deployId: string;
  /** process.version (R16.5). */
  nodeVersion: string;
};

/** Placeholder pro nedostupné údaje — NIKDY se nepředstírá hodnota (R16.6). */
export const UNAVAILABLE = 'nedostupné';

/** Povolené hodnoty Deploy_Environment (R16.3). */
const DEPLOY_ENVIRONMENTS: readonly DeployEnvironment[] = [
  'production',
  'preview',
  'development',
];

/**
 * Vrátí oříznutou hodnotu proměnné, nebo `UNAVAILABLE`, pokud chybí či je
 * prázdná (po ořezání bílých znaků). Tím se zajistí, že se nikdy nepředstírá
 * náhradní hodnota (R16.6).
 */
function valueOrUnavailable(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : UNAVAILABLE;
}

/**
 * Sestaví DeployInfo POUZE z neutajených proměnných prostředí a verze Node.js.
 * Chybějící/prázdná proměnná → 'nedostupné' (R16.6). Z principu nečte žádný
 * klíč s tajemstvím, takže výstup nikdy neobsahuje Secret_Value (R16.7).
 * `environment` se mapuje jen na povolené hodnoty, jinak 'nedostupné' (R16.3).
 */
export function buildDeployInfo(
  env: Record<string, string | undefined>,
  nodeVersion: string,
): DeployInfo {
  // Identifikátor nasazení: primárně VERCEL_DEPLOYMENT_ID, fallback VERCEL_DEPLOY_ID (R16.4).
  const deployIdRaw = env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_DEPLOY_ID;

  // Prostředí: mapujeme jen na povolené hodnoty, jinak 'nedostupné' (R16.3, R16.6).
  const envTrimmed = env.VERCEL_ENV?.trim();
  const environment: DeployEnvironment | 'nedostupné' =
    envTrimmed && (DEPLOY_ENVIRONMENTS as readonly string[]).includes(envTrimmed)
      ? (envTrimmed as DeployEnvironment)
      : UNAVAILABLE;

  return {
    commitSha: valueOrUnavailable(env.VERCEL_GIT_COMMIT_SHA),
    gitRef: valueOrUnavailable(env.VERCEL_GIT_COMMIT_REF),
    environment,
    deployId: valueOrUnavailable(deployIdRaw),
    nodeVersion,
  };
}
