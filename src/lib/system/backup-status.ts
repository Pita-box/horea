// Pouze pro server — zabraňuje importu I/O wrapperu do klientského bundlu.
// Ve vitestu je 'server-only' aliasováno na stub, takže import čisté funkce
// `buildBackupStatus`/`GOOGLE_BACKUP_ENV_KEYS` v property testu zůstává funkční.
import 'server-only';

// Čistá funkce stavu záloh — bez I/O, bez tajemství, bez PII.
// Tento modul je přímo pokrytý property-based testem (Vlastnost 9).
// Čistá funkce `buildBackupStatus` zůstává bez I/O; tenký I/O wrapper
// `getBackupStatus` (úkol 17.1) jen předá `process.env` a předaný Service_Status.

import type { ServiceStatus } from './status';

/** Očekávané GOOGLE_* klíče zálohování (dle src/lib/google/config.ts). */
export const GOOGLE_BACKUP_ENV_KEYS: readonly string[] = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
  'GOOGLE_DRIVE_BACKUP_FOLDER_ID',
];

/**
 * Statický informativní text: automatizovaná zálohovací úloha není v této
 * aplikaci implementována, není mezi registrovanými cronovými úlohami a stránka
 * proto nezobrazuje čas poslední zálohy (R18.3, R18.4).
 */
const BACKUP_INFO =
  'Automatizovaná zálohovací úloha není v této aplikaci implementována a ' +
  'nevyskytuje se mezi registrovanými cronovými úlohami. Stránka proto ' +
  'nezobrazuje čas poslední zálohy ani neumožňuje ruční spuštění zálohy.';

export type BackupStatus = {
  /** True právě tehdy, když jsou VŠECHNY GOOGLE_BACKUP_ENV_KEYS nastavené (R18.1). */
  configured: boolean;
  /** Dostupnost Google Drive z Health_Checker (R18.2). */
  driveStatus: ServiceStatus;
  /** Informativní text: zálohovací job není implementován (R18.3, R18.4). */
  info: string;
};

/**
 * Odvodí stav záloh POUZE z přítomnosti GOOGLE_* klíčů (NIKDY z hodnot, R18.5)
 * a předaného Service_Status Google Drive. `configured` je pravdivé právě tehdy,
 * když jsou všechny očekávané klíče nastavené (truthy).
 */
export function buildBackupStatus(
  env: Record<string, string | undefined>,
  driveStatus: ServiceStatus,
): BackupStatus {
  const configured = GOOGLE_BACKUP_ENV_KEYS.every((key) => Boolean(env[key]));

  return {
    configured,
    driveStatus,
    info: BACKUP_INFO,
  };
}

/**
 * Tenký I/O wrapper (R18.1, R18.2, R18.3): předá `process.env` a Google
 * `Service_Status` (z Health_Checker, získaný volajícím) čisté funkci
 * `buildBackupStatus`. Veškerá logika (vyhodnocení přítomnosti GOOGLE_* klíčů,
 * informativní text) je v čisté funkci; wrapper sám nevolá health duplicitně.
 */
export function getBackupStatus(driveStatus: ServiceStatus): BackupStatus {
  return buildBackupStatus(process.env, driveStatus);
}
