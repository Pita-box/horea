import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '@/lib/log';

/**
 * Testy strukturovaného loggeru.
 *
 * Validates: Requirements 20.1, 20.2
 *
 * Pokrývá: tvar JSON záznamu (timestamp/level/msg), redakce citlivých klíčů
 * (top-level i vnořené), odolnost proti cyklickým referencím a nepádivost.
 */

let writeSpy: ReturnType<typeof vi.spyOn>;

/** Zachytí poslední řádek zapsaný na stdout a naparsuje ho jako JSON. */
function lastEntry(): Record<string, unknown> {
  const calls = writeSpy.mock.calls;
  const lastCall = calls[calls.length - 1];
  const raw = lastCall[0] as string;
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeEach(() => {
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  writeSpy.mockRestore();
});

describe('log', () => {
  it('vypíše JSON se základním tvarem (timestamp, level, msg)', () => {
    log.info('uživatel se přihlásil');

    const entry = lastEntry();
    expect(entry.level).toBe('info');
    expect(entry.msg).toBe('uživatel se přihlásil');
    expect(typeof entry.timestamp).toBe('string');
    // timestamp je validní ISO řetězec
    expect(new Date(entry.timestamp as string).toISOString()).toBe(entry.timestamp);
  });

  it('zapíše právě jednu řádku ukončenou \\n', () => {
    log.info('zpráva');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const raw = writeSpy.mock.calls[0][0] as string;
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trimEnd().includes('\n')).toBe(false);
  });

  it('nastaví správný level pro warn a error', () => {
    log.warn('varování');
    expect(lastEntry().level).toBe('warn');

    log.error('chyba');
    expect(lastEntry().level).toBe('error');
  });

  it('přibalí kontextová pole do záznamu', () => {
    log.info('akce', { requestId: 'req-123', userId: 'user-456', action: 'create' });

    const entry = lastEntry();
    expect(entry.requestId).toBe('req-123');
    expect(entry.userId).toBe('user-456');
    expect(entry.action).toBe('create');
  });

  it('rediguje citlivé klíče na nejvyšší úrovni', () => {
    log.info('login', {
      password: 'tajneHeslo',
      token: 'abc.def.ghi',
      authorization: 'Bearer xyz',
      cookie: 'session=1',
      secret: 's3cr3t',
      apiKey: 'key-123',
      api_key: 'key-456',
    });

    const entry = lastEntry();
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.token).toBe('[REDACTED]');
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.cookie).toBe('[REDACTED]');
    expect(entry.secret).toBe('[REDACTED]');
    expect(entry.apiKey).toBe('[REDACTED]');
    expect(entry.api_key).toBe('[REDACTED]');
  });

  it('rediguje citlivé klíče i ve vnořených objektech a polích', () => {
    log.info('request', {
      user: { id: 1, password: 'nested' },
      headers: [{ authorization: 'Bearer nested' }],
    });

    const entry = lastEntry();
    const user = entry.user as Record<string, unknown>;
    expect(user.id).toBe(1);
    expect(user.password).toBe('[REDACTED]');

    const headers = entry.headers as Array<Record<string, unknown>>;
    expect(headers[0].authorization).toBe('[REDACTED]');
  });

  it('rediguje case-insensitive a podle substringu klíče (accessToken)', () => {
    log.info('oauth', { accessToken: 'aaa', PASSWORD: 'bbb' });

    const entry = lastEntry();
    expect(entry.accessToken).toBe('[REDACTED]');
    expect(entry.PASSWORD).toBe('[REDACTED]');
  });

  it('zachová nesenzitivní hodnoty beze změny', () => {
    log.info('ok', { count: 42, name: 'studio', flag: true });

    const entry = lastEntry();
    expect(entry.count).toBe(42);
    expect(entry.name).toBe('studio');
    expect(entry.flag).toBe(true);
  });

  it('nevyhodí výjimku při cyklické referenci a stále zapíše záznam', () => {
    const circular: Record<string, unknown> = { name: 'node' };
    circular.self = circular;

    expect(() => log.info('cyklus', { circular })).not.toThrow();
    expect(writeSpy).toHaveBeenCalled();

    const entry = lastEntry();
    const c = entry.circular as Record<string, unknown>;
    expect(c.name).toBe('node');
    expect(c.self).toBe('[CIRCULAR]');
  });

  it('funguje bez kontextu', () => {
    expect(() => log.info('bez kontextu')).not.toThrow();
    const entry = lastEntry();
    expect(entry.msg).toBe('bez kontextu');
  });
});
