// Renders public/icon.svg to the PNG icons the web app manifest needs.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable.png', 512, 64]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:#fbe3ea;display:grid;place-items:center;height:${size}px">
    <div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: pad === 0 });
}
await browser.close();
