/**
 * Config_Inspector — čisté jádro inspekce provozní konfigurace.
 *
 * Tento modul obsahuje VÝHRADNĚ čistou funkci, typy a konstanty. Nečte
 * `process.env`, nepoužívá `server-only` ani žádné I/O — tenký I/O wrapper
 * `getConfigReport()` (předá `process.env`) je samostatný task.
 *
 * Bezpečnostní invariant (R6.2, R6.3, R7.2, R7.4): pro každý očekávaný klíč
 * se vyhodnocuje POUZE přítomnost (truthy → `isSet=true`). Samotná hodnota
 * proměnné se NIKDY nedostane do výstupu.
 */

/** Příznak přítomnosti jedné proměnné prostředí — nikdy nenese hodnotu. */
export type EnvPresence = { key: string; isSet: boolean };

export type ConfigReport = {
  /** Aktuální úroveň logování (R7.1); default 'info', pokud `LOG_LEVEL` chybí. */
  logLevel: string;
  /** Pro každý očekávaný klíč jen příznak set/unset — NIKDY hodnota (R7.2, R7.4, R6.2). */
  env: EnvPresence[];
  /** Informativní text o umístění logů (R7.3, R8.1, R8.3). */
  logLocationInfo: string;
};

/** Deklarovaný seznam očekávaných klíčů (bez hodnot). */
export const EXPECTED_ENV_KEYS: readonly string[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'SMTP2GO_API_KEY',
  'GOPAY_GOID',
  'GOPAY_CLIENT_ID',
  'GOPAY_CLIENT_SECRET',
  'GOPAY_API_BASE_URL',
  'GOPAY_WEBHOOK_SECRET',
  'CRON_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
  'GOOGLE_DRIVE_BACKUP_FOLDER_ID',
];

/** Statický informativní text o umístění a chování logů (R7.3, R8.1, R8.3). */
const LOG_LOCATION_INFO =
  'Aplikační logy jdou do výstupu konzole, který čtou Vercel logy a log drains. ' +
  'Logy se neukládají do perzistentního souborového úložiště a aplikace je nemaže.';

/**
 * Sestaví ConfigReport z mapy proměnných (typicky process.env). Pro každý
 * očekávaný klíč vyhodnotí pouze přítomnost (truthy → isSet=true) a NIKDY
 * nezahrne hodnotu (R6.2, R6.3, R7.2, R7.4). Úroveň logování se odvodí
 * z `LOG_LEVEL` (default `info`, R7.1).
 */
export function buildConfigReport(
  env: Record<string, string | undefined>,
  expectedKeys: readonly string[],
): ConfigReport {
  const presence: EnvPresence[] = expectedKeys.map((key) => ({
    key,
    isSet: Boolean(env[key]),
  }));

  return {
    logLevel: env.LOG_LEVEL || 'info',
    env: presence,
    logLocationInfo: LOG_LOCATION_INFO,
  };
}
