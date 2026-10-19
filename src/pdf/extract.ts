// PDF import: text in reading order, page renders for the review screen,
// photos, name / hook / yarn, and OCR for scanned or unreadable pages.

import type * as PdfJs from 'pdfjs-dist';
import type { Lang } from '../core/types';
import { findHook } from '../parser/pattern';
import { detectLang } from '../parser/lexicon';
import { openPdf, pdfjs, renderPage } from './pdfjs';
import { layoutPage, type Item } from './layout';
import { cleanupLines, looksGarbled, repeatedHeader, type SrcLine } from './cleanup';
import { ocrCanvas, scanLanguage, type OcrSession, ocrSession } from './ocr';

export interface PageView {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface FoundImage {
  blob: Blob;
  url: string;
  page: number;
  area: number;
}

export interface Imported {
  lines: SrcLine[];
  pages: PageView[];
  images: FoundImage[];
  name: string;
  hookMm?: number;
  yarn?: string;
  lang: Lang;
  scanned: boolean;
  garbled: boolean;
  rawLines: SrcLine[];
}

export type Progress = (kind: 'read' | 'ocr' | 'lang', page: number, total: number, extra?: string) => void;

const RENDER_W = 1100;

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Image rectangles painted on a page, as fractions of the page. */
async function imageRects(lib: typeof PdfJs, page: PdfJs.PDFPageProxy): Promise<{ box: [number, number, number, number]; key: string }[]> {
  const ops = await page.getOperatorList();
  const vp = page.getViewport({ scale: 1 });
  const vt = vp.transform as Mat;
  const OPS = lib.OPS;
  const stack: Mat[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  const out: { box: [number, number, number, number]; key: string }[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args[0] as Mat | null;
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const full = mul(vt, ctm);
      const pts = [apply(full, 0, 0), apply(full, 1, 0), apply(full, 0, 1), apply(full, 1, 1)];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const box: [number, number, number, number] = [
        Math.max(0, Math.min(...xs) / vp.width),
        Math.max(0, Math.min(...ys) / vp.height),
        Math.min(1, Math.max(...xs) / vp.width),
        Math.min(1, Math.max(...ys) / vp.height),
      ];
      out.push({ box, key: `${typeof args[0] === 'string' ? args[0] : 'inline'}` });
    }
  }
  return out;
}

async function textLines(page: PdfJs.PDFPageProxy, pageNo: number): Promise<{ lines: SrcLine[]; chars: number; text: string }> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items: Item[] = [];
  let text = '';
  for (const raw of tc.items) {
    if (!('str' in raw)) continue;
    const it = raw as { str: string; transform: number[]; width: number; height: number };
    if (!it.str) continue;
    const [a, b, c, d, e, f] = it.transform;
    const m = mul(vp.transform as Mat, [a, b, c, d, e, f]);
    const hgt = Math.hypot(m[2], m[3]) || it.height || 10;
    items.push({ str: it.str, x: m[4], y: m[5] - hgt * 0.85, w: it.width * Math.hypot(vp.transform[0], vp.transform[1]), h: hgt });
    text += it.str + ' ';
  }
  return { lines: layoutPage(items, vp.width, vp.height, pageNo), chars: text.replace(/\s/g, '').length, text };
}

function cropCanvas(src: HTMLCanvasElement, box: [number, number, number, number]): HTMLCanvasElement {
  const [x0, y0, x1, y1] = box;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((x1 - x0) * src.width));
  c.height = Math.max(1, Math.round((y1 - y0) * src.height));
  c.getContext('2d')!.drawImage(src, x0 * src.width, y0 * src.height, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88));

function goodTitle(s?: string): string | undefined {
  const t = s?.trim();
  if (!t || t.length < 3 || t.length > 80) return undefined;
  if (/^(?:untitled|sans titre|document|microsoft word|pdf|scan|img|print)/i.test(t) || /\.(?:docx?|pdf|indd|pages)$/i.test(t)) return undefined;
  return t.replace(/^microsoft word\s*-\s*/i, '');
}

export function findYarn(text: string): string | undefined {
  const m = text.match(/^(?:\s*[-•*]\s*)?(?:yarn|fil|fils|laine|lana|hilo|fio|garn|wolle|filato|garen|wol)\s*[:\-–]\s*(.{3,80})$/imu);
  return m ? m[1].trim().replace(/[.;,]$/, '') : undefined;
}

export async function importPdf(file: File, onProgress: Progress, forceOcr = false): Promise<Imported> {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await openPdf(data);
  const n = doc.numPages;
  const pages: PageView[] = [];
  const raw: SrcLine[] = [];
  const rects: { page: number; box: [number, number, number, number]; key: string }[] = [];
  const needOcr: number[] = [];
  let biggestFont = { size: 0, text: '' };
  let garbledPages = 0;

  for (let i = 1; i <= n; i++) {
    onProgress('read', i, n);
    const page = await doc.getPage(i);
    const canvas = await renderPage(page, RENDER_W);
    pages.push({ canvas, width: canvas.width, height: canvas.height });
    const { lines, chars, text } = await textLines(page, i);
    const imgs = await imageRects(lib, page).catch(() => []);
    for (const r of imgs) rects.push({ page: i, ...r });
    const fullPageImage = imgs.some((r) => (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]) > 0.7);
    const garbled = looksGarbled(text);
    if (garbled) garbledPages++;
    if (forceOcr || garbled || (chars < 40 && (fullPageImage || chars === 0))) needOcr.push(i);
    else {
      raw.push(...lines);
      if (i === 1)
        for (const l of lines)
          if ((l.size ?? 0) > biggestFont.size && l.box && l.box[1] < 0.5 && /\p{L}{2,}/u.test(l.text) && l.text.length < 70) biggestFont = { size: l.size!, text: l.text };
    }
  }

  // OCR scanned / unreadable pages.
  let ocrLang: Lang | undefined;
  if (needOcr.length) {
    let session: OcrSession | null = await ocrSession('fra+eng');
    try {
      const ocrd = new Map<number, SrcLine[]>();
      for (const [k, pg] of needOcr.entries()) {
        onProgress('ocr', k + 1, needOcr.length);
        const page = await doc.getPage(pg);
        const big = await renderPage(page, 2000);
        ocrd.set(pg, await ocrCanvas(session, big, pg));
      }
      // A scan in another language is reread in its own language.
      const allText = [...ocrd.values()].flat().map((l) => l.text).join('\n');
      const scanLang = scanLanguage(allText);
      if (scanLang) {
        onProgress('lang', 0, needOcr.length, scanLang);
        await session.reinit(scanLang);
        for (const [k, pg] of needOcr.entries()) {
          onProgress('ocr', k + 1, needOcr.length);
          const page = await doc.getPage(pg);
          ocrd.set(pg, await ocrCanvas(session, await renderPage(page, 2000), pg));
        }
      }
      for (const pg of needOcr) raw.push(...(ocrd.get(pg) ?? []));
      // Name of a scan: its tallest line near the top of the first page.
      if (!biggestFont.text)
        for (const l of ocrd.get(1) ?? []) {
          const hgt = l.box ? l.box[3] - l.box[1] : 0;
          if (l.box && l.box[1] < 0.4 && hgt > biggestFont.size && /\p{L}{2,}/u.test(l.text) && l.text.length < 70) biggestFont = { size: hgt, text: l.text };
        }
      raw.sort((a, b) => a.page - b.page);
      ocrLang = detectLang(raw.map((l) => l.text).join('\n'));
    } finally {
      await session?.terminate();
      session = null;
    }
  }

  const textAll = raw.map((l) => l.text).join('\n');
  const lang = ocrLang ?? detectLang(textAll);
  const lines = cleanupLines(raw, n, lang);
  const cleanText = lines.map((l) => l.text).join('\n');

  // Photos: skip logos (small or repeated), page backgrounds and full-page scans.
  const keyCount = new Map<string, number>();
  for (const r of rects) keyCount.set(r.key, (keyCount.get(r.key) ?? 0) + 1);
  const images: FoundImage[] = [];
  const seenBoxes = new Set<string>();
  for (const r of rects) {
    const area = (r.box[2] - r.box[0]) * (r.box[3] - r.box[1]);
    const pv = pages[r.page - 1];
    const wpx = (r.box[2] - r.box[0]) * pv.width;
    const hpx = (r.box[3] - r.box[1]) * pv.height;
    if (area < 0.02 || wpx < 70 || hpx < 70) continue;
    if (area > 0.8) continue;
    if (r.key !== 'inline' && (keyCount.get(r.key) ?? 0) > Math.max(1, n * 0.5) && n > 1) continue;
    const sig = `${r.page}:${r.box.map((v) => v.toFixed(2)).join(',')}`;
    if (seenBoxes.has(sig)) continue;
    seenBoxes.add(sig);
    const blob = await toBlob(cropCanvas(pv.canvas, r.box));
    images.push({ blob, url: URL.createObjectURL(blob), page: r.page, area });
  }
  // Cover first: the largest image on the earliest page.
  images.sort((a, b) => a.page - b.page || b.area - a.area);

  const meta = await doc.getMetadata().catch(() => null);
  const info = meta?.info as { Title?: string } | undefined;
  const name =
    goodTitle(info?.Title) ??
    goodTitle(biggestFont.text) ??
    goodTitle(repeatedHeader(raw, n)) ??
    file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

  return {
    lines,
    rawLines: raw,
    pages,
    images,
    name,
    hookMm: findHook(cleanText),
    yarn: findYarn(cleanText),
    lang,
    scanned: needOcr.length > 0,
    garbled: garbledPages > 0,
  };
}
