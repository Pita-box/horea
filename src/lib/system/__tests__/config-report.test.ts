// Feature: admin-system-tools, Task 14.2 — příkladové unit testy pro getConfigReport.
// Ověřuje odvození logLevel, příznaky set/unset, absenci hodnot ve výstupu a text
// o umístění logů. Mock process.env přes vi.stubEnv; úklid přes vi.unstubAllEnvs.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getConfigReport, EXPECTED_ENV_KEYS } from '../config-report';

// Po každém testu vyčistíme všechny stubnuté proměnné prostředí, aby se stavy
// nepřelévaly mezi testy.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getConfigReport — unit testy', () => {
  it('odvodí logLevel z LOG_LEVEL', () => {
    vi.stubEnv('LOG_LEVEL', 'debug');

    const report = getConfigReport();

    expect(report.logLevel).toBe('debug');
  });

  it('použije výchozí logLevel "info", když LOG_LEVEL chybí', () => {
    // undefined = proměnnou odebereme, aby se uplatnil default.
    vi.stubEnv('LOG_LEVEL', undefined);

    const report = getConfigReport();

    expect(report.logLevel).toBe('info');
  });

  it('nastaví isSet=true pro přítomný (truthy) klíč', () => {
    const key = 'CRON_SECRET';
    vi.stubEnv(key, 'nejaka-hodnota');

    const report = getConfigReport();
    const entry = report.env.find((e) => e.key === key);

    expect(entry).toBeDefined();
    expect(entry?.isSet).toBe(true);
  });

  it('nastaví isSet=false pro chybějící klíč', () => {
    const key = 'CRON_SECRET';
    // undefined = klíč v prostředí není.
    vi.stubEnv(key, undefined);

    const report = getConfigReport();
    const entry = report.env.find((e) => e.key === key);

    expect(entry).toBeDefined();
    expect(entry?.isSet).toBe(false);
  });

  it('nastaví isSet=false pro prázdnou (falsy) hodnotu', () => {
    const key = 'CRON_SECRET';
    vi.stubEnv(key, '');

    const report = getConfigReport();
    const entry = report.env.find((e) => e.key === key);

    expect(entry).toBeDefined();
    expect(entry?.isSet).toBe(false);
  });

  it('obsahuje záznam pro každý očekávaný klíč právě jednou', () => {
    const report = getConfigReport();

    expect(report.env).toHaveLength(EXPECTED_ENV_KEYS.length);
    expect(report.env.map((e) => e.key)).toEqual([...EXPECTED_ENV_KEYS]);
  });

  it('do výstupu se nedostane žádná hodnota proměnné', () => {
    // Rozeznatelná hodnota, kterou pak hledáme v serializaci celého reportu.
    const secret = 'secretvalue_unikatni_marker_123';
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', secret);

    const report = getConfigReport();
    const serialized = JSON.stringify(report);

    expect(serialized.includes(secret)).toBe(false);
  });

  it('logLocationInfo je neprázdný text', () => {
    const report = getConfigReport();

    expect(typeof report.logLocationInfo).toBe('string');
    expect(report.logLocationInfo.trim().length).toBeGreaterThan(0);
  });
});
