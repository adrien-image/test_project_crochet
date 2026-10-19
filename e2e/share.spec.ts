import { test, expect } from '@playwright/test';
import { openPattern } from './helpers';

test('share link gives the recipient their own copy, without progress', async ({ page, context }) => {
  await openPattern(page, 'Souris');
  await page.locator('.pline.round').first().click();
  await page.getByRole('button', { name: /Partager/ }).click();
  const link = await page.locator('dialog input[readonly]').first().inputValue();
  expect(link).toMatch(/#\/partage\/[A-Za-z0-9_-]+$/);
  const printLink = await page.locator('dialog input[readonly]').nth(1).inputValue();
  expect(printLink).toMatch(/#\/imprimer\//);

  // Recipient: a new browser profile.
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(printLink);
  await expect(p2.locator('.print-sheet h1')).toHaveText('Souris');
  await p2.goto(link);
  await expect(p2.locator('h1')).toHaveText('Souris');
  await p2.getByRole('button', { name: /Ajouter à ma bibliothèque/ }).click();
  await expect(p2.locator('.p-meta')).toContainText('0 / 37 rangs');
  await p2.goto('./#/');
  await expect(p2.locator('.pcard-title', { hasText: 'Souris' })).toHaveCount(2);
  await other.close();
});

test('pattern file and Markdown export', async ({ page }) => {
  await openPattern(page, 'Striped bee');
  await page.locator('.pline.round').first().click();
  await page.getByRole('button', { name: /Partager/ }).click();
  let dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Fichier patron/ }).click();
  expect((await dl).suggestedFilename()).toBe('striped-bee.crochet.json');
  dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export Markdown/ }).click();
  const md = await (await dl).path();
  const text = (await import('node:fs')).readFileSync(md, 'utf8');
  expect(text).toContain('# Striped bee');
  expect(text).toContain('- [x] Rnd 1: 6 sc in MR (6)');
  expect(text).toContain('- [ ] Rnd 2: inc around (12)');
});

test('a forged link cannot carry files', async ({ page }) => {
  await page.goto('./#/');
  // Build a link whose text holds a data: URL and an unknown field.
  const link = await page.evaluate(async () => {
    const json = JSON.stringify({ v: 1, name: 'X', text: 'R1: 6 sc in MR (6) data:text/html;base64,PHNjcmlwdD4=', photo: 'data:image/png;base64,AAAA' });
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return '#/partage/' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  await page.goto('./' + link);
  await expect(page.locator('main pre')).toHaveText('R1: 6 sc in MR (6)');
});
