import { expect, test } from '@playwright/test';

import { hasAdminCreds, loginAsAdmin } from './support/dashboard';

/**
 * E2E happy-path ručního párování plateb v admin dashboardu `/admin/payments`
 * (Playwright).
 *
 * Tok: seznam čekajících plateb → vyhledání podle variabilního symbolu (VS) →
 * spárování vybrané platby → potvrzovací hláška. VS se odvozuje z první čekající
 * platby v seznamu, takže test pracuje s reálně seedovaným záznamem.
 *
 * GUARD: test vyžaduje běžící aplikaci, SEEDOVANÉHO přihlášeného admina
 * (`users.is_admin = true`) a alespoň jednu čekající platbu (`pending` +
 * `qr_manual`). Bez `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD` se test čistě
 * PŘESKOČÍ (`test.skip`), nikdy neselže. Když stránka neukáže žádnou čekající
 * platbu (chybí seed / účet není admin), test se rovněž přeskočí.
 *
 * Efekt spárování (prodloužení předplatného, přechod stavu) vlastní spec
 * `subscription-payments` — zde se ověří pouze spuštění z admin UI. Neběží v
 * `pnpm test:run` (Vitest) — spouští se výhradně přes `pnpm test:e2e`.
 *
 * _Requirements: 8.1, 8.2, 8.3_
 */
test('admin vyhledá čekající platbu podle VS a spáruje ji', async ({ page }) => {
  test.skip(
    !hasAdminCreds,
    'Nastav E2E_ADMIN_EMAIL a E2E_ADMIN_PASSWORD (seedovaný admin) pro spuštění admin E2E.',
  );

  await loginAsAdmin(page);
  await page.goto('/admin/payments');

  // Runtime guard: bez admin oprávnění / prostředí se nadpis nevykreslí → skip.
  const heading = page.getByRole('heading', { name: 'Ruční párování plateb' });
  test.skip(
    (await heading.count()) === 0,
    'Stránka /admin/payments se nevykreslila — ověř, že seedovaný účet má is_admin = true.',
  );

  // Seznam čekajících plateb (R8.1). Bez seedované `pending` platby tabulka chybí
  // (zobrazí se jen informační Notice) → test se přeskočí.
  const firstRow = page.locator('table tbody tr').first();
  test.skip(
    (await firstRow.count()) === 0,
    'Žádná čekající platba v seznamu — naseeduj pending platbu (qr_manual) pro spuštění.',
  );

  // VS první čekající platby z prvního sloupce řádku (R8.1).
  const variableSymbol = (await firstRow.locator('td').first().innerText()).trim();
  expect(variableSymbol).not.toEqual('');

  // Vyhledání podle VS (R8.2) — GET formulář přenačte stránku s `?vs=`.
  await page.locator('input[name="vs"]').fill(variableSymbol);
  await page.getByRole('button', { name: 'Vyhledat' }).click();

  const matchedRow = page
    .locator('table tbody tr')
    .filter({ hasText: variableSymbol })
    .first();
  await expect(matchedRow).toBeVisible({ timeout: 15_000 });

  // Spárování platby (R8.3) — po potvrzení akce se zobrazí česká hláška o úspěchu.
  await matchedRow.getByRole('button', { name: 'Spárovat' }).click();
  await expect(page.getByText('Platba byla spárována.')).toBeVisible({ timeout: 15_000 });
});
