import { test, expect } from '@playwright/test';

test('typing a pattern: live check, suggestions, next round', async ({ page }) => {
  await page.goto('./#/nouveau');
  await page.getByLabel('Nom').fill('Balle');
  const ta = page.getByRole('textbox', { name: 'Texte du patron' });
  await ta.click();
  await ta.pressSequentially('BALLE\nR1 : 6 ms dans un cercle magique (6)\nR2 : 6 aug (13)');
  await expect(page.locator('.live')).toContainText('ne correspond pas');
  await ta.press('Backspace');
  await ta.press('Backspace');
  await ta.press('Backspace');
  await ta.pressSequentially('12)');
  await expect(page.locator('.live')).toContainText('R2 : 12 mailles');
  // Next round, same label style.
  await page.getByRole('button', { name: 'Rang suivant' }).click();
  await expect(ta).toHaveValue(/\nR3 : $/);
  // Abbreviations: Tab completes the first suggestion.
  await ta.pressSequentially('(1 ms, 1 au');
  await expect(page.locator('.sugg button').first()).toHaveText('aug');
  await ta.press('Tab');
  await ta.pressSequentially(') x 6 (18)');
  await expect(ta).toHaveValue(/R3 : \(1 ms, 1 aug \) x 6 \(18\)$/);
  await expect(page.locator('.live')).toContainText('R3 : 18 mailles');
  await page.getByRole('button', { name: 'Créer le patron' }).click();
  await expect(page.locator('h1')).toHaveText('Balle');
  await expect(page.locator('.p-meta')).toContainText('0 / 3 rangs');
});
