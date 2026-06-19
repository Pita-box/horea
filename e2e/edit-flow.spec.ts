import { expect, test } from '@playwright/test';

import { hasOwnerCreds, inboxHasEmail, loginAsOwner, RESEND_INBOX_URL } from './support/dashboard';

/**
 * E2E úprava rezervace v dashboardu majitele (Playwright).
 *
 * Tok: detail upravitelné rezervace → dialog „Upravit" → volitelná změna služby
 * (množina služeb, R9.1) → změna času na dostupný slot s revalidací (R9.3) →
 * Uložit → potvrzení (dialog se zavře bez chyby, přepočet délky/`ends_at`
 * proběhl serverově, R9.2). Editační UI zůstává single-select, ale ukládá přes
 * nové `*_multi` RPC se `serviceIds`. Je-li nakonfigurován inbox
 * (`E2E_RESEND_INBOX_URL`), ověří se navíc `Reservation_Modified_Email`.
 *
 * GUARD: vyžaduje běžící aplikaci a SEEDOVANÉHO přihlášeného majitele s aspoň
 * jednou rezervací ve stavu `pending` nebo `approved` (jen ty lze upravit, R9.1).
 * Bez `E2E_OWNER_EMAIL` + `E2E_OWNER_PASSWORD` se test PŘESKOČÍ. Pokud chybí
 * upravitelná rezervace nebo den nemá žádný dostupný slot, test se přeskočí.
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.6_
 */
test('majitel upraví službu a čas rezervace na dostupný slot a uloží změnu', async ({ page }) => {
  test.skip(
    !hasOwnerCreds,
    'Nastav E2E_OWNER_EMAIL a E2E_OWNER_PASSWORD (seedovaný majitel) pro spuštění dashboard E2E.',
  );

  await loginAsOwner(page);
  await page.goto('/dashboard/reservations');

  // Upravit lze jen `pending` nebo `approved` (R9.1) — najdeme první takový řádek.
  const editableRow = page
    .locator('a[href^="/dashboard/reservations/"]')
    .filter({ hasText: /Čeká na schválení|Schváleno/ })
    .first();

  test.skip(
    (await editableRow.count()) === 0,
    'Seznam neobsahuje upravitelnou rezervaci (pending/approved) — naseeduj data.',
  );

  await editableRow.click();
  await expect(page.getByRole('heading', { name: 'Akce' })).toBeVisible();

  // Otevři editační dialog (R9.1).
  await page.getByRole('button', { name: 'Upravit' }).click();
  await expect(page.getByRole('heading', { name: 'Upravit rezervaci' })).toBeVisible();

  // Volitelně přidej další službu (R9.1) — změní množinu služeb, a tím
  // Combined_Duration a `ends_at` (přepočet R9.2). UI je multi-select se search +
  // zaškrtávacím seznamem; klikneme na první dosud nevybranou službu (přidání).
  const addServiceButton = page.locator('[role="dialog"] button[aria-pressed="false"]').first();
  if ((await addServiceButton.count()) > 0) {
    await addServiceButton.click();
  }

  // Vynutíme nabídku dostupných slotů: nepravděpodobný čas → 409 + „Dostupné časy"
  // (R9.3/R9.4). Z nabídky pak vybereme reálně dostupný slot a uložíme.
  await page.locator('#edit-time').fill('02:00');
  await page.getByRole('button', { name: 'Uložit' }).click();

  const editDialogHeading = page.getByRole('heading', { name: 'Upravit rezervaci' });
  const slotChip = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();

  // Buď se 02:00 ukázalo jako dostupné (dialog se zavřel), nebo dostaneme sloty.
  await Promise.race([
    editDialogHeading.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined),
    slotChip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined),
  ]);

  if (await editDialogHeading.isVisible()) {
    test.skip(
      (await slotChip.count()) === 0,
      'Den nemá žádný dostupný slot pro úpravu — naseeduj otevírací dobu/dostupnost.',
    );
    await slotChip.click();
    await page.getByRole('button', { name: 'Uložit' }).click();
  }

  // Potvrzení úpravy (R9.6): dialog se zavře bez chybové hlášky.
  await expect(editDialogHeading).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Akce' })).toBeVisible();

  // Podmíněné ověření notifikace o úpravě (R9.6) — jen je-li inbox nastaven.
  if (RESEND_INBOX_URL) {
    await expect
      .poll(() => inboxHasEmail(page, 'upravena'), { timeout: 15_000 })
      .toBeTruthy();
  }
});
