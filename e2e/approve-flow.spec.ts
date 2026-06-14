import { expect, test } from '@playwright/test';

import { hasOwnerCreds, inboxHasEmail, loginAsOwner, RESEND_INBOX_URL } from './support/dashboard';

/**
 * E2E schválení rezervace v dashboardu majitele (Playwright).
 *
 * Tok: seznam rezervací → zvýrazněná `pending` → detail → Schválit → status
 * „Schváleno". Je-li nakonfigurován inbox (`E2E_RESEND_INBOX_URL`), ověří se
 * navíc doručení `Reservation_Approved_Email`; bez něj se e-mailová část
 * přeskočí.
 *
 * GUARD: vyžaduje běžící aplikaci a SEEDOVANÉHO přihlášeného majitele s aspoň
 * jednou rezervací ve stavu `pending`. Bez `E2E_OWNER_EMAIL` +
 * `E2E_OWNER_PASSWORD` se test PŘESKOČÍ. Když seznam neobsahuje žádnou
 * `pending` rezervaci, test se rovněž přeskočí (chybí seedovaná data).
 *
 * _Requirements: 6.1, 6.3_
 */
test('majitel schválí čekající rezervaci a uvidí status „Schváleno"', async ({ page }) => {
  test.skip(
    !hasOwnerCreds,
    'Nastav E2E_OWNER_EMAIL a E2E_OWNER_PASSWORD (seedovaný majitel) pro spuštění dashboard E2E.',
  );

  await loginAsOwner(page);
  await page.goto('/dashboard/reservations');

  // Zvýrazněný řádek `pending` (R2.4) — odkaz na detail nesoucí český status.
  const pendingRow = page
    .locator('a[href^="/dashboard/reservations/"]')
    .filter({ hasText: 'Čeká na schválení' })
    .first();

  test.skip(
    (await pendingRow.count()) === 0,
    'Seznam neobsahuje žádnou rezervaci ve stavu „Čeká na schválení" — naseeduj pending rezervaci.',
  );

  await pendingRow.click();

  // Detail rezervace (R5) — akce „Schválit" je dostupná jen pro `pending`.
  await expect(page.getByRole('heading', { name: 'Akce' })).toBeVisible();
  await page.getByRole('button', { name: 'Schválit' }).click();

  // Po schválení (R6.1) detail ukáže status „Schváleno" a akce „Schválit" zmizí.
  await expect(page.getByText('Schváleno')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Schválit' })).toHaveCount(0);

  // Podmíněné ověření potvrzovacího e-mailu (R6.3) — jen je-li inbox nastaven.
  if (RESEND_INBOX_URL) {
    await expect
      .poll(() => inboxHasEmail(page, 'schválena'), { timeout: 15_000 })
      .toBeTruthy();
  }
});
