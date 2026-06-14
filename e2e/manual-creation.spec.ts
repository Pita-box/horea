import { expect, test } from '@playwright/test';

import {
  hasOwnerCreds,
  inboxHasEmail,
  loginAsOwner,
  pragueDatePlusDays,
  RESEND_INBOX_URL,
} from './support/dashboard';

/**
 * E2E ruční tvorba rezervace v dashboardu majitele (Playwright).
 *
 * Tok: „Vytvořit rezervaci" → vyplnění služby, data, času a kontaktu → Vytvořit
 * → rezervace se stavem „Schváleno" v seznamu (R12.4). Klientovi se neposílá
 * potvrzovací e-mail (R12.5) — když je nakonfigurován inbox
 * (`E2E_RESEND_INBOX_URL`), ověří se podmíněně i jeho absence.
 *
 * GUARD: vyžaduje běžící aplikaci, SEEDOVANÉHO přihlášeného majitele a aspoň
 * jednu službu s otevírací dobou/dostupností pro zvolený den. Bez
 * `E2E_OWNER_EMAIL` + `E2E_OWNER_PASSWORD` se test PŘESKOČÍ; bez služby nebo
 * dostupného slotu se rovněž přeskočí. Datum lze předvolit přes
 * `E2E_RESERVATION_DATE` (jinak dnešek + 7 dní v Europe/Prague).
 *
 * _Requirements: 12.1, 12.4, 12.5_
 */
test('majitel ručně vytvoří rezervaci a ta je v seznamu „Schváleno"', async ({ page }) => {
  test.skip(
    !hasOwnerCreds,
    'Nastav E2E_OWNER_EMAIL a E2E_OWNER_PASSWORD (seedovaný majitel) pro spuštění dashboard E2E.',
  );

  const reservationDate = process.env.E2E_RESERVATION_DATE ?? pragueDatePlusDays(7);
  // Unikátní jméno, ať řádek v seznamu spolehlivě najdeme.
  const clientName = `E2E Ruční ${Date.now()}`;

  await loginAsOwner(page);
  await page.goto('/dashboard/reservations');

  // Otevři dialog ruční tvorby (R12.1).
  await page.getByRole('button', { name: 'Vytvořit rezervaci' }).click();
  await expect(page.getByRole('heading', { name: 'Vytvořit rezervaci' })).toBeVisible();

  // Bez seedované služby nelze rezervaci vytvořit — přeskoč.
  const serviceValue = await page.locator('#create-service').inputValue();
  test.skip(serviceValue === '', 'Podnik nemá žádnou službu — naseeduj službu pro ruční tvorbu.');

  // Vyplň formulář; čas záměrně „02:00" vynutí nabídku dostupných slotů (R12.6).
  await page.locator('#create-date').fill(reservationDate);
  await page.locator('#create-time').fill('02:00');
  await page.locator('#create-name').fill(clientName);
  await page.locator('#create-phone').fill('+420704344177');

  const submit = page.getByRole('button', { name: 'Vytvořit' });
  await submit.click();

  const createDialogHeading = page.getByRole('heading', { name: 'Vytvořit rezervaci' });
  const slotChip = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();

  // Buď bylo 02:00 dostupné (dialog se zavřel), nebo dostaneme nabídku slotů.
  await Promise.race([
    createDialogHeading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined),
    slotChip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined),
  ]);

  if (await createDialogHeading.isVisible()) {
    test.skip(
      (await slotChip.count()) === 0,
      'Den nemá žádný dostupný slot — naseeduj otevírací dobu/dostupnost.',
    );
    await slotChip.click();
    await submit.click();
  }

  // Dialog se po úspěchu zavře a seznam se obnoví.
  await expect(createDialogHeading).toBeHidden({ timeout: 15_000 });

  // Nová rezervace je v seznamu se stavem „Schváleno" (R12.4) nezávisle na
  // auto_approve_reservations.
  const createdRow = page
    .locator('a[href^="/dashboard/reservations/"]')
    .filter({ hasText: clientName })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 15_000 });
  await expect(createdRow).toContainText('Schváleno');

  // Podmíněné ověření, že klientovi NEdorazil potvrzovací e-mail (R12.5) — jen
  // je-li nastaven dedikovaný test inbox.
  if (RESEND_INBOX_URL) {
    expect(await inboxHasEmail(page, 'potvrzení rezervace')).toBeFalsy();
  }
});
