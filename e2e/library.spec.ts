import { test, expect } from '@playwright/test';
import { openLibrary } from './helpers';

test('examples, search, filters and sorting', async ({ page }) => {
  await openLibrary(page);
  await expect(page.locator('.pcard-title')).toHaveText(['Souris', 'Heart cushion', 'Striped bee']);
  await page.getByRole('searchbox').fill('animal');
  await expect(page.locator('article.pcard')).toHaveCount(2);
  await page.getByRole('searchbox').fill('chenille');
  await expect(page.locator('.pcard-title')).toHaveText(['Heart cushion']);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox', { name: 'Trier' }).selectOption('name');
  await expect(page.locator('.pcard-title')).toHaveText(['Heart cushion', 'Souris', 'Striped bee']);
  await page.getByRole('combobox', { name: 'Étiquette' }).selectOption('cushion');
  await expect(page.locator('article.pcard')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Étiquette' }).selectOption('');
  await page.getByRole('button', { name: 'En cours' }).click();
  await expect(page.locator('article.pcard')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tous' }).click();
  await expect(page.locator('article.pcard')).toHaveCount(3);
});

test('several deletions undone together', async ({ page }) => {
  await openLibrary(page);
  for (const name of ['Souris', 'Striped bee']) {
    await page.locator('article.pcard', { hasText: name }).getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /Supprimer/ }).click();
  }
  await expect(page.locator('article.pcard')).toHaveCount(1);
  await page.getByRole('button', { name: 'Annuler (2)' }).click();
  await expect(page.locator('article.pcard')).toHaveCount(3);
});

test('duplicate from zero or with progress', async ({ page }) => {
  await openLibrary(page);
  const card = page.locator('article.pcard', { hasText: 'Souris' });
  await card.locator('.pcard-title').click();
  await page.locator('.pline.round').first().click();
  await expect(page.locator('.p-meta')).toContainText('1 / 37 rangs');
  await page.getByRole('button', { name: 'Dupliquer' }).click();
  await page.getByRole('button', { name: /Copie avec l’avancement/ }).click();
  await expect(page.locator('h1')).toHaveText('Souris (copie)');
  await expect(page.locator('.p-meta')).toContainText('1 / 37 rangs');
  await page.getByRole('button', { name: 'Dupliquer' }).click();
  await page.getByRole('button', { name: /Recommencer de zéro/ }).click();
  await expect(page.locator('.p-meta')).toContainText('0 / 37 rangs');
});
