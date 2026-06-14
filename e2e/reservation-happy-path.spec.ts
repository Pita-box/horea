import { expect, test } from '@playwright/test';

/**
 * E2E happy-path rezervace přes veřejnou stránku `/{slug}` (Playwright).
 *
 * Pokrývá celý pětikrokový tok klienta: výběr služby → datum → čas → kontakt →
 * potvrzení → děkovná hláška.
 *
 * GUARD: test vyžaduje SEEDOVANÝ publikovaný podnik s dostupnou službou a
 * otevírací dobou. Protože v CI ani lokálně takové prostředí (ani Resend) nemusí
 * být k dispozici, test se PŘESKOČÍ, dokud není nastaven `E2E_PUBLIC_SLUG`.
 * Slug publikovaného profilu se bere z `process.env.E2E_PUBLIC_SLUG`, datum lze
 * volitelně předvolit přes `E2E_RESERVATION_DATE` (jinak se zvolí dnešek + 7 dní
 * v Europe/Prague — operátor musí zajistit, že podnik má v ten den dostupnost).
 *
 * Ověření e-mailů v Resend test inboxu se ZÁMĚRNĚ neautomatizuje (vyžaduje
 * provozní inbox + API klíč) — doručení potvrzovacího a notifikačního e-mailu
 * ověří provoz; tento test končí na děkovné hlášce v UI.
 *
 * _Requirements: 1.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.9_
 */

const PUBLIC_SLUG = process.env.E2E_PUBLIC_SLUG;

/** Dnešní datum + posun ve dnech v Europe/Prague ve tvaru `YYYY-MM-DD`. */
function pragueDatePlusDays(days: number): string {
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

test('klient projde rezervací od výběru služby po děkovnou hlášku', async ({ page }) => {
  test.skip(
    !PUBLIC_SLUG,
    'Nastav E2E_PUBLIC_SLUG (slug seedovaného publikovaného podniku) pro spuštění E2E happy-path.',
  );

  const reservationDate = process.env.E2E_RESERVATION_DATE ?? pragueDatePlusDays(7);

  await page.goto(`/${PUBLIC_SLUG}`);

  // Krok 1 — výběr služby. Vybereme první nabízenou službu.
  await expect(page.getByText(/Krok 1 z 5/)).toBeVisible();
  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'Pokračovat' }).click();

  // Krok 2 — výběr data. Tlačítko „Pokračovat" se odemkne až po načtení termínů.
  await expect(page.getByText(/Krok 2 z 5/)).toBeVisible();
  await page.locator('#date').fill(reservationDate);
  const step2Next = page.getByRole('button', { name: 'Pokračovat' });
  await expect(step2Next).toBeEnabled({ timeout: 15_000 });
  await step2Next.click();

  // Krok 3 — výběr času. Vybereme první dostupný slot.
  await expect(page.getByText(/Krok 3 z 5/)).toBeVisible();
  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'Pokračovat' }).click();

  // Krok 4 — kontaktní údaje.
  await expect(page.getByText(/Krok 4 z 5/)).toBeVisible();
  await page.locator('#client-name').fill('Test Klient');
  await page.locator('#client-phone').fill('+420704344177');
  await page.locator('#client-email').fill('e2e-klient@example.test');
  await page.getByRole('button', { name: 'Pokračovat' }).click();

  // Krok 5 — souhrn a odeslání.
  await expect(page.getByText(/Krok 5 z 5/)).toBeVisible();
  await page.getByRole('button', { name: 'Odeslat rezervaci' }).click();

  // Děkovná hláška (R9.9) — status pending i approved sdílí stejný nadpis.
  await expect(page.getByRole('heading', { name: 'Děkujeme za rezervaci' })).toBeVisible();
});
