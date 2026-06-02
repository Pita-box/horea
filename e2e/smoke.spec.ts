import { expect, test } from '@playwright/test';

test('root URL vrací HTTP 200', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
});
