import { test, expect } from '@playwright/test';

async function importFile(page: import('@playwright/test').Page, file: string) {
  await page.goto('./#/importer');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choisir un fichier' }).click();
  await (await chooser).setFiles(`e2e/fixtures/${file}`);
  await expect(page.locator('.rlines')).toBeVisible({ timeout: 120_000 });
}

test('text PDF: columns, table, header removed, photos, fields', async ({ page }) => {
  await importFile(page, 'bunny.pdf');
  await expect(page.getByLabel('Nom')).toHaveValue('Spring Bunny');
  await expect(page.getByLabel('Crochet (mm)')).toHaveValue('3');
  const lines = await page.locator('.rlines input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(lines).not.toContain('Little Studio - crochet patterns');
  // Left column before the right one; wrapped count joined; table turned into rounds.
  expect(lines.indexOf('R5-R8: sc around (24)')).toBeLessThan(lines.indexOf('EARS (make 2)'));
  expect(lines).toContain('R4: (sc 2, inc) x6 (24)');
  expect(lines).toContain('R3: (sc, inc) x6 (18)');
  expect(lines).toContain('5th rnd: sc around (18)');
  expect(lines).toContain('Fasten off, leave a long tail.');
  await expect(page.locator('.photo-pick img')).toHaveCount(2);
  // Edit a line and find it flagged.
  const r2 = page.locator('.rlines input').filter({ hasText: '' }).nth(lines.indexOf('R2: inc around (12)'));
  await r2.fill('R2: inc around (13)');
  await expect(page.locator('.rline.flag')).toHaveCount(1);
  await page.getByRole('button', { name: /Suivant à vérifier/ }).click();
  await expect(r2).toBeFocused();
  await expect(page.locator('.page-hl')).toBeVisible();
  await r2.fill('R2: inc around (12)');
  await page.getByRole('button', { name: /Continuer vers le patron/ }).click();
  await expect(page.locator('h1')).toHaveText('Spring Bunny');
  await page.getByRole('link', { name: 'Photos' }).click();
  await expect(page.locator('.gallery figure')).toHaveCount(2);
  await page.getByRole('link', { name: 'Notes' }).click();
  await expect(page.locator('.attach-preview canvas')).toHaveCount(2, { timeout: 20_000 });
});

test('scanned PDF is read with OCR', async ({ page }) => {
  test.setTimeout(180_000);
  await importFile(page, 'chat-scan.pdf');
  await expect(page.locator('.banner')).toContainText('OCR');
  await expect(page.getByLabel('Nom')).toHaveValue('Petit Chat');
  const lines = await page.locator('.rlines input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(lines).toContain('R3 : (1 ms, 1 aug) x 6 (18)');
  expect(lines).toContain('R6 : (2 ms, 1 dim) x 6 (18)');
  await expect(page.locator('.rline.flag')).toHaveCount(0);
});
