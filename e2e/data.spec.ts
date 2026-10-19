import { test, expect } from '@playwright/test';
import { openLibrary, openPattern } from './helpers';

test('full backup export and import', async ({ page }) => {
  await openPattern(page, 'Souris');
  await page.locator('.pline.round').first().click();
  await page.getByRole('button', { name: 'Stockage' }).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter une sauvegarde complète' }).click();
  const file = await (await dl).path();
  await page.keyboard.press('Escape');
  // Delete everything, then restore from the backup.
  await page.goto('./#/');
  for (let i = 0; i < 3; i++) {
    await page.locator('article.pcard').first().getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /Supprimer/ }).click();
  }
  await expect(page.locator('article.pcard')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stockage' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer une sauvegarde' }).click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.toast')).toContainText('3 patron(s) importé(s)');
  await page.keyboard.press('Escape');
  await expect(page.locator('article.pcard')).toHaveCount(3);
  await expect(page.locator('article.pcard', { hasText: 'Souris' })).toContainText('1 / 37');
});

test('two tabs stay in sync', async ({ page, context }) => {
  const id = await openPattern(page, 'Souris');
  const other = await context.newPage();
  await other.goto(`./#/patron/${id}/instructions`);
  await page.locator('.pline.round').first().click();
  await expect(other.locator('.p-meta')).toContainText('1 / 37 rangs');
});

test('storage dialog shows status', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Stockage' }).first().click();
  await expect(page.locator('dialog')).toContainText('Stockage persistant');
  await expect(page.locator('dialog')).toContainText('3 patron(s)');
});

test('statistics', async ({ page }) => {
  await openPattern(page, 'Souris');
  await page.locator('.pline.round').first().click();
  await page.locator('.pline.round').nth(1).click();
  await page.goto('./#/stats');
  await expect(page.locator('.kpi').nth(1)).toContainText('2');
  await page.getByRole('button', { name: 'Rangs', exact: true }).click();
  await page.locator('details summary').click();
  await expect(page.locator('details table tbody tr')).toHaveCount(12);
  await expect(page.locator('section.panel').last()).toContainText('Souris');
});
