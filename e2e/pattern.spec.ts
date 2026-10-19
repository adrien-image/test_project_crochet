import { test, expect } from '@playwright/test';
import { openPattern } from './helpers';

test('tick rounds in the text; current round follows', async ({ page }) => {
  await openPattern(page, 'Striped bee');
  const first = page.locator('.pline.round').first();
  await expect(first).toHaveClass(/current/);
  await first.click();
  await expect(first).toHaveClass(/done/);
  await expect(page.locator('.pline.round').nth(1)).toHaveClass(/current/);
  // A range line has one box per round.
  const range = page.locator('.pline.round', { hasText: 'Rnd 7-11' });
  await expect(range.getByRole('checkbox')).toHaveCount(5);
  await page.getByRole('button', { name: /Marquer le rang comme fait/ }).click();
  await expect(page.locator('.p-meta')).toContainText('2 / 37 rangs');
});

test('counter: ring, keyboard shortcuts, note', async ({ page }) => {
  await openPattern(page, 'Striped bee', 'compteur');
  await expect(page.locator('.counter h2')).toContainText('Rnd 1');
  await page.locator('.ring-btn').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.locator('.ring-btn')).toHaveAttribute('aria-label', /3 \/ 6/);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.ring-btn')).toHaveAttribute('aria-label', /2 \/ 6/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.counter h2')).toContainText('Rnd 2');
  await expect(page.locator('.ring-btn')).toHaveAttribute('aria-label', /0 \/ 12/);
  await page.getByRole('textbox', { name: 'Note pour ce rang' }).fill('Tension lâche');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Annuler le dernier rang/ }).click();
  await expect(page.locator('.counter h2')).toContainText('Rnd 1');
  await page.getByRole('link', { name: 'Notes' }).click();
  await expect(page.locator('main')).toContainText('Tension lâche');
});

test('rounds view: fabric, chart, SVG export, count checks', async ({ page }) => {
  await openPattern(page, 'Souris', 'rangs');
  await expect(page.locator('.view-area canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Diagramme' }).click();
  await expect(page.locator('.view-area svg.chart-svg')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exporter en SVG/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.svg$/);
});

test('yarn tab: colours, weight, other hooks', async ({ page }) => {
  await openPattern(page, 'Striped bee', 'fil');
  const table = page.locator('table.data').first();
  await expect(table).toContainText('yellow');
  await expect(table).toContainText('black');
  await expect(table).toContainText('white');
  await expect(page.locator('main')).toContainText('catégorie 2');
  await expect(page.locator('main')).toContainText('Taille annoncée par le patron : 9 cm');
  await expect(page.locator('table.data').last().locator('tbody tr')).not.toHaveCount(0);
});

test('checklist: add, tick and reorder', async ({ page }) => {
  await openPattern(page, 'Souris', 'notes');
  await page.getByRole('textbox', { name: 'Ajouter une étape' }).fill('Coudre le nez');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const items = page.locator('.check-list li input[type=text]');
  await expect(items.last()).toHaveValue('Coudre le nez');
  await page.locator('.check-list li').last().getByRole('button', { name: 'Monter' }).click();
  await expect(items.nth(-2)).toHaveValue('Coudre le nez');
});

test('edit the pattern text', async ({ page }) => {
  const id = await openPattern(page, 'Souris', 'modifier');
  const ta = page.getByRole('textbox', { name: 'Texte du patron' });
  await ta.fill('TÊTE\nR1 : 6 ms dans un cercle magique (6)\nR2 : 6 aug (12)');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page).toHaveURL(new RegExp(`${id}/instructions`));
  await expect(page.locator('.p-meta')).toContainText('0 / 2 rangs');
});

test('timer counts time', async ({ page }) => {
  await openPattern(page, 'Souris');
  await page.getByRole('button', { name: /Démarrer/ }).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /Arrêter/ }).click();
  await expect(page.locator('[data-timer=total]')).toHaveText(/[2-4] s/);
});

test('direct links open a tab', async ({ page }) => {
  const id = await openPattern(page, 'Souris', 'fil');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Fil & taille' })).toHaveAttribute('aria-current', 'page');
  await page.goto(`./#/patron/${id}/imprimer`);
  await expect(page.locator('.print-sheet h1')).toHaveText('Souris');
  await expect(page.locator('.print-sheet .charts svg')).toHaveCount(4);
});
