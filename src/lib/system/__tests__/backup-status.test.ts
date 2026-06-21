// Feature: admin-system-tools, úkol 17.2 — unit testy I/O wrapperu getBackupStatus.
// Příkladové (example-based) testy, NE property test. Mockujeme process.env přes
// vi.stubEnv a předáváme driveStatus jako parametr.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getBackupStatus, GOOGLE_BACKUP_ENV_KEYS } from '../backup-status';
import type { ServiceStatus } from '../status';

// Po každém testu uklidíme všechny stubnuté proměnné prostředí, aby se stav
// nepřenášel mezi testy ani neovlivnil zbytek běhu.
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Nastaví všechny očekávané GOOGLE_* klíče na rozpoznatelné tajné hodnoty.
 * Vrací mapu klíč → hodnota pro pozdější ověření, že hodnoty neunikají.
 */
function stubAllGoogleKeys(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of GOOGLE_BACKUP_ENV_KEYS) {
    const value = `SECRET_${key}`;
    values[key] = value;
    vi.stubEnv(key, value);
  }
  return values;
}

describe('getBackupStatus — unit testy (úkol 17.2)', () => {
  it('configured=true, když jsou všechny GOOGLE_* klíče nastavené (R18.1)', () => {
    stubAllGoogleKeys();

    const result = getBackupStatus('ok');

    expect(result.configured).toBe(true);
  });

  it('configured=false, když chybí jeden z GOOGLE_* klíčů (R18.1)', () => {
    // Nejprve nastavíme všechny, poté jeden odebereme (undefined = smazání).
    stubAllGoogleKeys();
    vi.stubEnv(GOOGLE_BACKUP_ENV_KEYS[0], undefined);

    const result = getBackupStatus('ok');

    expect(result.configured).toBe(false);
  });

  it('driveStatus se věrně převezme z parametru (R18.2)', () => {
    stubAllGoogleKeys();

    const statuses: ServiceStatus[] = ['ok', 'degraded', 'down'];
    for (const status of statuses) {
      expect(getBackupStatus(status).driveStatus).toBe(status);
    }
  });

  it('info obsahuje neprázdný informativní text (R18.3)', () => {
    stubAllGoogleKeys();

    const result = getBackupStatus('ok');

    expect(typeof result.info).toBe('string');
    expect(result.info.length).toBeGreaterThan(0);
  });

  it('hodnoty proměnných prostředí se neobjeví v serializaci výsledku (R18.5)', () => {
    const values = stubAllGoogleKeys();

    const serialized = JSON.stringify(getBackupStatus('ok'));

    for (const value of Object.values(values)) {
      expect(serialized.includes(value)).toBe(false);
    }
  });
});
