import { test, expect } from '@playwright/test';

test('phone layout uses a bottom tab bar', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.topnav')).toBeHidden();
  await page.locator('.tabbar').getByRole('link', { name: 'Statistiques' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statistiques');
  // No horizontal scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
