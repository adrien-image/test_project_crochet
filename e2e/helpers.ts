import { expect, type Page } from '@playwright/test';

/** Opens the library (fresh storage per test) and waits for the examples. */
export async function openLibrary(page: Page) {
  await page.goto('./#/');
  await expect(page.locator('article.pcard')).toHaveCount(3);
}

export async function patternId(page: Page, name: string): Promise<string> {
  const id = await page.locator('article.pcard', { hasText: name }).first().getAttribute('data-id');
  if (!id) throw new Error(`no pattern ${name}`);
  return id;
}

export async function openPattern(page: Page, name: string, tab = 'instructions') {
  await openLibrary(page);
  const id = await patternId(page, name);
  await page.goto(`./#/patron/${id}/${tab}`);
  return id;
}
