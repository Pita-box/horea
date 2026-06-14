import { expect, type Page } from '@playwright/test';

/**
 * Sdílené pomocné funkce pro dashboard E2E testy majitele (Playwright).
 *
 * Tento soubor NENÍ test (nemá příponu `.spec.ts`), Playwright ho proto
 * nesbírá jako testovací sadu — je jen knihovnou pro `e2e/*.spec.ts`.
 *
 * GUARD: dashboard testy vyžadují běžící aplikaci a SEEDOVANÉHO přihlášeného
 * majitele s aktivním předplatným. Bez přihlašovacích údajů (`E2E_OWNER_EMAIL`
 * + `E2E_OWNER_PASSWORD`) se testy čistě PŘESKOČÍ (`test.skip`), nikdy neselžou.
 * Ověření e-mailů v inboxu je dále podmíněné `E2E_RESEND_INBOX_URL` — bez něj se
 * e-mailová část přeskakuje (Resend neposkytuje veřejné čtení doručených zpráv,
 * operátor nasměruje proměnnou na vlastní inbox-reading endpoint).
 */

/** Přihlašovací e-mail seedovaného majitele. */
export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL;
/** Heslo seedovaného majitele. */
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD;
/** Volitelný JSON endpoint čtoucí doručené e-maily (inbox). */
export const RESEND_INBOX_URL = process.env.E2E_RESEND_INBOX_URL;

/** Přihlašovací e-mail seedovaného administrátora (`users.is_admin = true`). */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
/** Heslo seedovaného administrátora. */
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/** True, pokud jsou k dispozici údaje pro přihlášení majitele. */
export const hasOwnerCreds = Boolean(OWNER_EMAIL && OWNER_PASSWORD);

/** True, pokud jsou k dispozici údaje pro přihlášení administrátora. */
export const hasAdminCreds = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

/** Dnešní datum + posun ve dnech v Europe/Prague ve tvaru `YYYY-MM-DD`. */
export function pragueDatePlusDays(days: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Přihlásí seedovaného majitele přes `/login` a počká na redirect na dashboard.
 * Předpokládá platné údaje (volající nejdřív přeskočí test přes `hasOwnerCreds`).
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(OWNER_EMAIL as string);
  await page.locator('input[name="password"]').fill(OWNER_PASSWORD as string);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Přihlásí seedovaného administrátora přes `/login`. Po úspěšném přihlášení
 * aplikace přesměruje admina na `/dashboard` (viz `login/actions.ts`); odtud se
 * volající přesune na požadovanou cestu pod `/admin`. Předpokládá platné údaje
 * (volající nejdřív přeskočí test přes `hasAdminCreds`).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL as string);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD as string);
  await page.getByRole('button', { name: 'Přihlásit se' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Podmíněné ověření doručeného e-mailu. Když `E2E_RESEND_INBOX_URL` není
 * nastavena, krok se přeskočí (vrátí `false`). Je-li nastavena, očekává JSON
 * pole zpráv s polem `subject` a hledá `subjectContains` (case-insensitive).
 * Vrací `true`, pokud zprávu našel.
 */
export async function inboxHasEmail(page: Page, subjectContains: string): Promise<boolean> {
  if (!RESEND_INBOX_URL) {
    return false;
  }

  const response = await page.request.get(RESEND_INBOX_URL);
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as unknown;
  const messages = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown[] }).data)
      ? (body as { data: unknown[] }).data
      : [];

  const needle = subjectContains.toLowerCase();
  return messages.some((message) => {
    const subject = (message as { subject?: unknown }).subject;
    return typeof subject === 'string' && subject.toLowerCase().includes(needle);
  });
}
