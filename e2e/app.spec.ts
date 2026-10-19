import { test, expect } from '@playwright/test';
import { openLibrary, openPattern } from './helpers';

test('English interface and themes', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library');
  const themeBtn = page.locator('#theme-btn');
  await themeBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await themeBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('3D preview: construction slider, placement and PNG', async ({ page }) => {
  await openPattern(page, 'Souris', '3d');
  await expect(page.locator('.three-wrap canvas')).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Construction' });
  await slider.fill('5');
  await expect(page.locator('main')).toContainText('Après Corps · R5');
  await page.getByRole('button', { name: 'Pièces séparées' }).click();
  await page.getByRole('button', { name: 'Assemblé' }).click();
  await page.locator('.piece-row', { hasText: 'Oreilles' }).getByRole('button', { name: /Placer/ }).click();
  await expect(page.locator('.three-banner')).toContainText('Oreilles');
  const box = (await page.locator('.three-wrap canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.piece-row', { hasText: 'Oreilles' }).getByRole('button', { name: 'Placement automatique' })).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exporter en PNG/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/-3d\.png$/);
});

test('built page has a strict Content Security Policy', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
});

test('still works when the browser blocks IndexedDB', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined });
  });
  await page.goto('./#/');
  await expect(page.locator('article.pcard')).toHaveCount(3);
  await expect(page.locator('.toast')).toContainText('bloque le stockage');
});

test('a browser that cannot run the app gets a message, not a blank page', async ({ page }) => {
  // Simulate an old browser choking on the bundle.
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.fulfill({ contentType: 'text/javascript', body: 'let x = (;' }));
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText(/n’a pas pu démarrer|couldn’t start/, { timeout: 15_000 });
});
