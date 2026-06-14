import { expect, test } from '@playwright/test';

import { hasAdminCreds, loginAsAdmin } from './support/dashboard';

/**
 * E2E happy-path správy kupónů v admin dashboardu `/admin/coupons` (Playwright).
 *
 * Tok pokrývá celý CRUD životní cyklus jednoho kupónu: vytvoření → odmítnutí
 * duplicitního kódu (česká hláška) → úprava → deaktivace → smazání. Kód kupónu
 * je odvozen z časového razítka, takže každý běh pracuje s unikátním záznamem a
 * nekoliduje s případnými seedovanými daty.
 *
 * GUARD: test vyžaduje běžící aplikaci a SEEDOVANÉHO přihlášeného admina
 * (`users.is_admin = true`). Bez `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD` se test
 * čistě PŘESKOČÍ (`test.skip`), nikdy neselže. Pokud se po přihlášení stránka
 * `/admin/coupons` nevykreslí (účet není admin / chybí prostředí), test se rovněž
 * přeskočí.
 *
 * Neběží v `pnpm test:run` (Vitest) — spouští se výhradně přes `pnpm test:e2e`.
 *
 * _Requirements: 7.1, 7.2, 7.5, 7.6, 7.7_
 */
test('admin vytvoří, upraví, deaktivuje a smaže kupón a odmítne duplicitní kód', async ({
  page,
}) => {
  test.skip(
    !hasAdminCreds,
    'Nastav E2E_ADMIN_EMAIL a E2E_ADMIN_PASSWORD (seedovaný admin) pro spuštění admin E2E.',
  );

  await loginAsAdmin(page);
  await page.goto('/admin/coupons');

  // Runtime guard: bez admin oprávnění / prostředí se nadpis nevykreslí → skip.
  const heading = page.getByRole('heading', { name: 'Kupóny' });
  test.skip(
    (await heading.count()) === 0,
    'Stránka /admin/coupons se nevykreslila — ověř, že seedovaný účet má is_admin = true.',
  );

  // Unikátní kód kupónu pro tento běh (vyhneme se kolizi se seedem i mezi běhy).
  const code = `E2E${Date.now()}`;

  // Vytvoření kupónu (R7.1) — typ percent s hodnotou v rozsahu 0–100.
  await page.locator('input[placeholder="napr. LETO2025"]').fill(code);
  await page.locator('select').selectOption('percent');
  await page.locator('input[placeholder="0–100"]').fill('20');
  await page.getByRole('button', { name: 'Vytvořit kupón' }).click();

  await expect(page.getByText('Kupón byl vytvořen.')).toBeVisible({ timeout: 15_000 });
  const row = page.locator('tr').filter({ hasText: code });
  await expect(row).toBeVisible();

  // Odmítnutí duplicitního kódu (R7.2) — stejný kód podruhé → česká hláška.
  await page.locator('input[placeholder="napr. LETO2025"]').fill(code);
  await page.locator('input[placeholder="0–100"]').fill('30');
  await page.getByRole('button', { name: 'Vytvořit kupón' }).click();
  await expect(page.getByText('Kupón s tímto kódem již existuje.')).toBeVisible({
    timeout: 15_000,
  });

  // Úprava kupónu (R7.5) — otevřeme řádek do editace a uložíme změnu hodnoty.
  await row.getByRole('button', { name: 'Upravit' }).click();
  await page.locator('input[placeholder="0–100"]').fill('50');
  await page.getByRole('button', { name: 'Uložit změny' }).click();
  await expect(page.getByText('Kupón byl upraven.')).toBeVisible({ timeout: 15_000 });

  // Deaktivace kupónu (R7.6) — po deaktivaci řádek nese stav „Neaktivní".
  await row.getByRole('button', { name: 'Deaktivovat' }).click();
  await expect(page.getByText('Kupón byl deaktivován.')).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText('Neaktivní')).toBeVisible();

  // Smazání kupónu (R7.7) — po smazání řádek s kódem ze seznamu zmizí.
  await row.getByRole('button', { name: 'Smazat' }).click();
  await expect(page.getByText('Kupón byl smazán.')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tr').filter({ hasText: code })).toHaveCount(0);
});
