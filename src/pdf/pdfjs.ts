// Lazy pdf.js loader (bundled locally so it works offline and under the CSP).
// The legacy build carries polyfills (pdf.js 6 uses Map.getOrInsertComputed,
// missing from most browsers today).

import type * as PdfJs from 'pdfjs-dist';

let lib: Promise<typeof PdfJs> | null = null;

export function pdfjs(): Promise<typeof PdfJs> {
  if (!lib) {
    lib = (async () => {
      const [m, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
      m.GlobalWorkerOptions.workerSrc = worker.default;
      return m;
    })();
  }
  return lib;
}

export async function openPdf(data: ArrayBuffer | Uint8Array) {
  const m = await pdfjs();
  return m.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise;
}

export async function renderPage(page: PdfJs.PDFPageProxy, width: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const scale = width / base.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
  return canvas;
}
