// Feature: admin-system-tools — integrační test server action `sendTestEmail`.
//
// `sendTestEmail` je server-only I/O vrstva, která:
//  - nezávisle ověří admin oprávnění (`requireAdmin`),
//  - cíl bere VÝHRADNĚ z env `HOREA_ADMIN_EMAIL` (nikdy od klienta, R22.1, R22.5),
//  - při chybějícím `HOREA_ADMIN_EMAIL` odmítne BEZ odeslání (R22.3),
//  - vyhodnotí cooldown z `system_settings.test_email_last_sent_at` (R22.4),
//  - při aktivním cooldownu odmítne BEZ odeslání a vrátí zbývající dobu (R22.4),
//  - odešle e-mail přes `sendEmail` a teprve PŘI ÚSPĚCHU zapíše `last_sent_at` (R22.4),
//  - výsledek neobsahuje PII nad rámec adresy z env (R22.6).
//
// V testech proto:
//  - mockujeme `@/lib/admin/require-admin` → admin ok s builderem nad `system_settings`
//    (select/maybeSingle pro čtení, upsert jako spy),
//  - mockujeme `@/lib/email/client` (`sendEmail`),
//  - mockujeme `@/lib/log-server`, abychom odpojili reálné `next/headers`,
//  - `HOREA_ADMIN_EMAIL` nastavujeme přes `vi.stubEnv`,
//  - pro cooldown používáme fake timers.
// Validates: Requirements 22.1, 22.3, 22.4, 22.5, 22.6

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_EMAIL_COOLDOWN_SECONDS } from '@/lib/system/email-cooldown';

// Řízená hodnota načtená z `system_settings` (last_sent_at). `null` = žádný předchozí záznam.
const settingValue = vi.hoisted(() => ({ value: null as string | null }));
// Zachycené argumenty upsertu do `system_settings` — slouží jako spy na zápis last_sent_at.
const upsertCalls = vi.hoisted(() => [] as Array<{ payload: unknown; options: unknown }>);
// Názvy tabulek předané do from() — pro kontrolu, že se sahá jen na system_settings.
const fromCalls = vi.hoisted(() => [] as string[]);

// Admin ověření vždy uspěje. `admin` klient nabízí builder pro:
//  - select('value').eq('key', ...).maybeSingle() → vrátí řízenou hodnotu,
//  - upsert(payload, options) → zaznamená volání a vrátí úspěch.
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    actorUserId: 'admin-user-id',
    admin: {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () =>
            settingValue.value === null
              ? { data: null, error: null }
              : { data: { value: settingValue.value }, error: null },
          upsert: (payload: unknown, options: unknown) => {
            upsertCalls.push({ payload, options });
            return Promise.resolve({ error: null });
          },
        };
        return builder;
      },
    },
  })),
}));

// sendEmail jako spy s řízeným návratem (úspěch / chyba odeslání).
const sendEmailResult = vi.hoisted(() => ({
  value: { data: { id: 'mock-id' }, error: null } as unknown,
}));

vi.mock('@/lib/email/client', () => ({
  sendEmail: vi.fn(async () => sendEmailResult.value),
}));

// serverLog jako spy — odpojí reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendEmail } from '@/lib/email/client';

import { sendTestEmail } from '../actions';

/** Smyšlená administrátorská adresa — nikdy reálná hodnota. */
const ADMIN_EMAIL = 'admin@example.test';

/** Pevný „teď" pro deterministické vyhodnocení cooldownu. */
const NOW = new Date('2024-06-01T12:00:00.000Z');

beforeEach(() => {
  settingValue.value = null;
  upsertCalls.length = 0;
  fromCalls.length = 0;
  sendEmailResult.value = { data: { id: 'mock-id' }, error: null };
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('sendTestEmail — úspěšné odeslání (R22.1, R22.4)', () => {
  it('bez předchozího záznamu odešle e-mail na HOREA_ADMIN_EMAIL a zapíše last_sent_at', async () => {
    vi.stubEnv('HOREA_ADMIN_EMAIL', ADMIN_EMAIL);
    settingValue.value = null; // nikdy neodesláno → cooldown povolen

    const result = await sendTestEmail();

    // Úspěch bez další PII (R22.6).
    expect(result).toEqual({ ok: true });

    // sendEmail volán právě jednou a výhradně na adresu z env (R22.1, R22.5).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [input] = vi.mocked(sendEmail).mock.calls[0] as [{ to: string }];
    expect(input.to).toBe(ADMIN_EMAIL);

    // Po úspěchu se zapíše nový last_sent_at (upsert do system_settings, R22.4).
    expect(upsertCalls).toHaveLength(1);
    const payload = upsertCalls[0].payload as { key: string; value: string };
    expect(payload.key).toBe('test_email_last_sent_at');
    expect(payload.value).toBe(NOW.toISOString());
  });
});

describe('sendTestEmail — chybějící administrátorská adresa (R22.3)', () => {
  it('bez HOREA_ADMIN_EMAIL odmítne a NEvolá sendEmail', async () => {
    vi.stubEnv('HOREA_ADMIN_EMAIL', '');

    const result = await sendTestEmail();

    expect(result).toEqual({
      ok: false,
      reason: 'no_admin_email',
      message: 'administrátorská adresa není nastavena',
    });
    // Žádné odeslání ani zápis.
    expect(sendEmail).not.toHaveBeenCalled();
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('sendTestEmail — aktivní cooldown (R22.4)', () => {
  it('při nedávném odeslání odmítne s reason=cooldown a kladnou zbývající dobou, bez odeslání i zápisu', async () => {
    vi.stubEnv('HOREA_ADMIN_EMAIL', ADMIN_EMAIL);
    // Poslední odeslání těsně před „teď" → cooldown ještě běží.
    settingValue.value = new Date(NOW.getTime() - 5_000).toISOString();

    const result = await sendTestEmail();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáváno odmítnutí');
    expect(result.reason).toBe('cooldown');
    if (result.reason !== 'cooldown') throw new Error('očekáván reason cooldown');
    // Zbývající doba je kladná a nepřesahuje délku cooldownu.
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(TEST_EMAIL_COOLDOWN_SECONDS);

    // Při aktivním cooldownu se nic neodešle ani nezapíše (R22.4).
    expect(sendEmail).not.toHaveBeenCalled();
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('sendTestEmail — selhání odeslání (R22.4)', () => {
  it('když sendEmail vrátí chybu, odmítne s reason=send_failed a NEzapíše last_sent_at', async () => {
    vi.stubEnv('HOREA_ADMIN_EMAIL', ADMIN_EMAIL);
    settingValue.value = null; // cooldown povolen
    sendEmailResult.value = { data: null, error: { message: 'doručení selhalo' } };

    const result = await sendTestEmail();

    expect(result).toEqual({
      ok: false,
      reason: 'send_failed',
      message: 'Odeslání testovacího e-mailu se nezdařilo.',
    });
    // sendEmail byl pokusně volán, ale zápis last_sent_at se NESMÍ provést (R22.4).
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(upsertCalls).toHaveLength(0);
  });
});

describe('sendTestEmail — výsledek bez PII (R22.5, R22.6)', () => {
  it('adresa pochází jen z env a klient žádnou adresu nedodává; výsledek neobsahuje PII', async () => {
    vi.stubEnv('HOREA_ADMIN_EMAIL', ADMIN_EMAIL);
    settingValue.value = null;

    // Action nepřijímá žádný argument (cíl) — adresa je výhradně z env (R22.5).
    expect(sendTestEmail.length).toBe(0);

    const result = await sendTestEmail();

    // Výsledek úspěchu neobsahuje administrátorskou adresu ani jinou PII (R22.6).
    expect(JSON.stringify(result)).not.toContain(ADMIN_EMAIL);
  });
});
