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

/**
 * Vytáhne délku v minutách z textu (první výskyt `\d+ min`). Vrací `null`,
 * když text žádnou délku neobsahuje. Funguje na položce služby v kroku 1
 * (`… (30 min)` / `30 min`) i na souhrnných řádcích („Celkem 130 min",
 * „Trvání celkem 130 min").
 */
function parseDurationMinutes(text: string): number | null {
  const match = text.match(/(\d+)\s*min/);
  return match ? Number(match[1]) : null;
}

/**
 * Vytáhne cenu v Kč z textu (první výskyt `… Kč`) v českém formátu
 * (mezera/nbsp jako oddělovač tisíců, čárka jako desetinná). Vrací `null`,
 * když text žádnou cenu neobsahuje (např. služba s cenou 0 Kč, která se
 * záměrně nezobrazuje, R3.3).
 */
function parsePriceCzk(text: string): number | null {
  const match = text.match(/([\d\u00a0\s,]+)\s*Kč/);
  if (!match) {
    return null;
  }
  const cleaned = match[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
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

  // Krok 2 — výběr data v kalendáři. Klik na den; po načtení termínů formulář
  // automaticky přejde na krok 3 (auto-advance).
  await expect(page.getByText(/Krok 2 z 5/)).toBeVisible();
  if ((await page.locator(`button[data-date="${reservationDate}"]`).count()) === 0) {
    await page.getByRole('button', { name: 'Další měsíc' }).click();
  }
  await page.locator(`button[data-date="${reservationDate}"]`).click();
  await expect(page.getByText(/Krok 3 z 5/)).toBeVisible({ timeout: 15_000 });

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

/**
 * E2E happy-path KOMBINOVANÉ rezervace (více služeb) přes veřejnou stránku.
 *
 * Pokrývá scénář A (multi-service): v kroku 1 klient vybere VÍCE služeb,
 * průběžný souhrn ukáže kombinovanou délku (a cenu), formulář projde datum →
 * čas → kontakt a v kroku 5 souhrn zobrazí `Trvání celkem` rovné součtu délek
 * vybraných služeb a `Cena celkem` rovné součtu jejich cen; odeslání skončí
 * děkovnou hláškou.
 *
 * GUARD: stejně jako jednoslužbový happy-path se test PŘESKOČÍ bez
 * `E2E_PUBLIC_SLUG`. Navíc vyžaduje publikovaný podnik s ALESPOŇ DVĚMA
 * rezervovatelnými službami a dostupností pro kombinovaný (delší) blok ve
 * zvolený den — pokud podnik nabízí méně než dvě služby, test se přeskočí.
 *
 * _Requirements: 1.1, 2.2, 12.2, 12.4_
 */
test('klient vybere více služeb a projde rezervací s kombinovanými součty', async ({ page }) => {
  test.skip(
    !PUBLIC_SLUG,
    'Nastav E2E_PUBLIC_SLUG (slug seedovaného publikovaného podniku) pro spuštění E2E happy-path.',
  );

  const reservationDate = process.env.E2E_RESERVATION_DATE ?? pragueDatePlusDays(7);

  await page.goto(`/${PUBLIC_SLUG}`);

  // Krok 1 — multi-select. Položky služeb jsou jediné `aria-pressed` tlačítka.
  await expect(page.getByText(/Krok 1 z 5/)).toBeVisible();
  const serviceButtons = page.locator('button[aria-pressed]');
  const serviceCount = await serviceButtons.count();
  test.skip(
    serviceCount < 2,
    'Multi-service happy-path vyžaduje podnik s alespoň dvěma rezervovatelnými službami.',
  );

  // Vybereme první dvě služby a zapamatujeme si jejich délku a cenu z položky.
  let expectedDuration = 0;
  let expectedPrice = 0;
  for (let index = 0; index < 2; index += 1) {
    const serviceButton = serviceButtons.nth(index);
    const buttonText = await serviceButton.innerText();

    const duration = parseDurationMinutes(buttonText);
    expect(duration, `Služba #${index + 1} musí v kroku 1 zobrazit délku v minutách`).not.toBeNull();
    expectedDuration += duration ?? 0;

    // Cena 0 Kč se u položky nezobrazuje (R3.3) → bere se jako 0.
    expectedPrice += parsePriceCzk(buttonText) ?? 0;

    await serviceButton.click();
    await expect(serviceButton).toHaveAttribute('aria-pressed', 'true');
  }

  // Průběžný souhrn: kombinovaná délka se aktualizuje na součet (R2.3 → blok 2.2).
  const runningSummary = page.getByText(/^Celkem\s+\d+\s*min$/);
  await expect(runningSummary).toBeVisible();
  expect(parseDurationMinutes(await runningSummary.innerText())).toBe(expectedDuration);

  // Pokud mají vybrané služby cenu, ukáže průběžný souhrn i kombinovanou cenu.
  if (expectedPrice > 0) {
    const runningSummaryBox = runningSummary.locator('xpath=..');
    expect(parsePriceCzk(await runningSummaryBox.innerText())).toBe(expectedPrice);
  }

  await page.getByRole('button', { name: 'Pokračovat' }).click();

  // Krok 2 — výběr data v kalendáři pro KOMBINOVANOU (delší) délku bloku. Klik na
  // den; po načtení termínů formulář automaticky přejde na krok 3.
  await expect(page.getByText(/Krok 2 z 5/)).toBeVisible();
  if ((await page.locator(`button[data-date="${reservationDate}"]`).count()) === 0) {
    await page.getByRole('button', { name: 'Další měsíc' }).click();
  }
  await page.locator(`button[data-date="${reservationDate}"]`).click();
  await expect(page.getByText(/Krok 3 z 5/)).toBeVisible({ timeout: 15_000 });

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

  // Krok 5 — souhrn. `Trvání celkem` = součet délek (R12.2), `Cena celkem` =
  // součet cen (R12.3), jeden časový blok (Datum + Čas, R12.4).
  await expect(page.getByText(/Krok 5 z 5/)).toBeVisible();

  const durationRow = page.getByText('Trvání celkem', { exact: true }).locator('xpath=..');
  expect(parseDurationMinutes(await durationRow.innerText())).toBe(expectedDuration);

  if (expectedPrice > 0) {
    const priceRow = page.getByText('Cena celkem', { exact: true }).locator('xpath=..');
    expect(parsePriceCzk(await priceRow.innerText())).toBe(expectedPrice);
  }

  // Jeden časový blok rezervace — datum a čas jsou v souhrnu (R12.4).
  await expect(page.getByText('Datum', { exact: true })).toBeVisible();
  await expect(page.getByText('Čas', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Odeslat rezervaci' }).click();

  // Děkovná hláška — status pending i approved sdílí stejný nadpis.
  await expect(page.getByRole('heading', { name: 'Děkujeme za rezervaci' })).toBeVisible();
});
