// OCR with tesseract.js. Worker and engine are served locally; language data
// for French and English loads first, other languages only when a scan needs it.

import type { SrcLine } from './cleanup';

export interface OcrSession {
  reinit(lang: string): Promise<void>;
  terminate(): Promise<void>;
  recognize(c: HTMLCanvasElement): Promise<OcrLine[]>;
}

interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const LOCAL_LANGS = ['fra', 'eng'];

async function makeWorker(langs: string) {
  const { createWorker } = await import('tesseract.js');
  const base = import.meta.env.BASE_URL;
  const local = langs.split('+').every((l) => LOCAL_LANGS.includes(l));
  const worker = await createWorker(langs, 1, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/`,
    workerBlobURL: false,
    // Undefined: tesseract.js fetches the language from its CDN.
    langPath: local ? new URL(`${base}tesseract/lang`, location.href).href : undefined,
  });
  await worker.setParameters({ preserve_interword_spaces: '1' });
  return worker;
}

export async function ocrSession(langs: string): Promise<OcrSession> {
  let worker = await makeWorker(langs);
  return {
    async reinit(lang) {
      await worker.terminate();
      worker = await makeWorker(lang);
    },
    async terminate() {
      await worker.terminate();
    },
    async recognize(c) {
      const { data } = await worker.recognize(c, {}, { blocks: true, text: true });
      const out: OcrLine[] = [];
      for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) out.push({ text: l.text.trim(), confidence: l.confidence, bbox: l.bbox });
      return out;
    },
  };
}

export async function ocrCanvas(session: OcrSession, canvas: HTMLCanvasElement, page: number): Promise<SrcLine[]> {
  const lines = await session.recognize(canvas);
  return lines
    .filter((l) => l.text)
    .map((l) => ({
      text: l.text,
      page,
      conf: l.confidence,
      ocr: true,
      box: [l.bbox.x0 / canvas.width, l.bbox.y0 / canvas.height, l.bbox.x1 / canvas.width, l.bbox.y1 / canvas.height] as [number, number, number, number],
    }));
}

const STOP: [string, RegExp][] = [
  ['spa', /\b(?:punto|puntos|vuelta|aumento|disminuci[oó]n|cadeneta|anillo|cada|veces|pb)\b/giu],
  ['deu', /\b(?:runde|masche|maschen|feste|zunehmen|abnehmen|luftmasche|jede|und|mit|fM)\b/giu],
  ['ita', /\b(?:giro|maglia|maglie|aumento|diminuzione|catenella|anello|ogni|volte|punto)\b/giu],
  ['por', /\b(?:carreira|ponto|pontos|aumento|diminui[cç][aã]o|corrente|anel|cada|vezes|volta)\b/giu],
  ['nld', /\b(?:toer|vaste|vasten|meerderen|minderen|losse|ring|elke|keer|steek|steken)\b/giu],
];
const BASE: RegExp[] = [/\b(?:maille|mailles|rang|tour|augmentation|dans|chaque|fois)\b/giu, /\b(?:stitch|round|increase|decrease|each|around|times|single)\b/giu];

/** Tesseract code of a scan's language when it isn't French or English. */
export function scanLanguage(text: string): string | undefined {
  const base = Math.max(...BASE.map((re) => (text.match(re) || []).length));
  let best: [string, number] | undefined;
  for (const [code, re] of STOP) {
    const n = (text.match(re) || []).length;
    if (n >= 4 && n > base * 1.5 && (!best || n > best[1])) best = [code, n];
  }
  return best?.[0];
}
