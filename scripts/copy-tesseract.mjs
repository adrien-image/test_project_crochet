// Copies the tesseract.js worker and LSTM engines into public/ so OCR runs
// from the app's own origin (offline, and under the Content Security Policy).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const out = new URL('../public/tesseract/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const tjs = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const files = [
  [join(tjs, 'dist/worker.min.js'), 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map((f) => [join(core, f), f]),
];
// French and English ship with the app; other languages load from the CDN when a scan needs them.
for (const lang of ['eng', 'fra']) {
  const dir = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
  files.push([join(dir, '4.0.0_best_int', `${lang}.traineddata.gz`), `lang/${lang}.traineddata.gz`]);
}
mkdirSync(join(out, 'lang'), { recursive: true });
for (const [src, name] of files) {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  copyFileSync(src, join(out, name));
}
console.log(`tesseract: ${files.length} files copied to public/tesseract/`);
