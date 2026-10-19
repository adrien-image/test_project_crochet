// Text clean-up after PDF extraction or OCR. Pure functions on lines, so they
// can be tested without a PDF.

import type { Lang } from '../core/types';
import { matchLabel } from '../parser/pattern';

export interface SrcLine {
  text: string;
  page: number;
  /** Bounding box as fractions of the page: x0, y0, x1, y1 (top-left origin). */
  box?: [number, number, number, number];
  size?: number;
  conf?: number;
  /** Line comes from OCR. */
  ocr?: boolean;
}

function union(a?: SrcLine['box'], b?: SrcLine['box']): SrcLine['box'] {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

const isTitle = (s: string) => {
  const letters = s.match(/\p{L}/gu) || [];
  return letters.length >= 3 && letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length > 0.85 && s.length < 60;
};

// ---- Headers and footers ----

const norm = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Removes lines repeated at the top or bottom of most pages, and bare page numbers. */
export function removeHeadersFooters(lines: SrcLine[], pages: number): SrcLine[] {
  if (pages < 2) return lines.filter((l) => !isPageNumber(l));
  const margin = (l: SrcLine) => !!l.box && (l.box[1] < 0.1 || l.box[3] > 0.9);
  const seen = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!margin(l)) continue;
    const k = norm(l.text);
    if (!k) continue;
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(l.page);
  }
  const repeated = new Set([...seen].filter(([, s]) => s.size >= Math.max(2, Math.ceil(pages * 0.5))).map(([k]) => k));
  return lines.filter((l) => !(margin(l) && repeated.has(norm(l.text))) && !isPageNumber(l));
}

function isPageNumber(l: SrcLine): boolean {
  return !!l.box && (l.box[1] < 0.08 || l.box[3] > 0.92) && /^(?:page\s*)?\d{1,3}(?:\s*(?:\/|of|sur|de|von)\s*\d{1,3})?$/i.test(l.text.trim());
}

/** The text repeated as a page header, if any (a name candidate). */
export function repeatedHeader(lines: SrcLine[], pages: number): string | undefined {
  if (pages < 2) return undefined;
  const count = new Map<string, { text: string; pages: Set<number> }>();
  for (const l of lines) {
    if (!l.box || l.box[1] > 0.1 || /^\d+$/.test(l.text.trim())) continue;
    const k = norm(l.text);
    if (!count.has(k)) count.set(k, { text: l.text.trim(), pages: new Set() });
    count.get(k)!.pages.add(l.page);
  }
  const best = [...count.values()].filter((x) => x.pages.size >= Math.ceil(pages * 0.5)).sort((a, b) => b.pages.size - a.pages.size)[0];
  return best?.text;
}

// ---- Tables ----

const ROUND_CELL = /^(?:(?:r|rnd|rnds|round|rounds|row|rows|rang|rangs|tour|tours|rg|vuelta|runde|giro|toer|ronde|v|t)\.?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\.?$/i;
const HEADER_RE = /^(?:round|rnd|row|rang|tour|r|vuelta|runde|giro|toer|ronde)\s*#?$/i;

/**
 * Converts table rows ("Round | Instructions | Count") into round lines.
 * Row cells are separated by " | " by the extractor.
 */
export function convertTables(lines: SrcLine[]): SrcLine[] {
  const out: SrcLine[] = [];
  for (const l of lines) {
    if (!/\s\|(?:\s|$)/.test(l.text)) {
      out.push(l);
      continue;
    }
    const cells = l.text.split(/\s*\|\s*/).map((c) => c.trim()).filter(Boolean);
    // Header row: drop it.
    if (cells.length >= 2 && HEADER_RE.test(cells[0]) && cells.slice(1).every((c) => !/\d/.test(c))) continue;
    const first = cells[0].match(ROUND_CELL);
    if (first && cells.length === 1) {
      // A chart row whose count is missing.
      out.push({ ...l, text: `R${first[1]}:` });
      continue;
    }
    if (first && cells.length >= 2) {
      const label = first[2] ? `R${first[1]}-R${first[2]}` : `R${first[1]}`;
      const last = cells[cells.length - 1].match(/^\(?(\d+)\)?(?:\s*(?:sts?|m|mailles|sc|ms))?\.?$/i);
      if (cells.length === 2 && last) out.push({ ...l, text: `${label}: (${last[1]})` });
      else if (last) out.push({ ...l, text: `${label}: ${cells.slice(1, -1).join(' ')} (${last[1]})` });
      else out.push({ ...l, text: `${label}: ${cells.slice(1).join(' ')}` });
      continue;
    }
    out.push({ ...l, text: cells.join('  ') });
  }
  return out;
}

/** Fills missing counts of a chart-only pattern from the regular increase. */
export function inferCounts(counts: (number | undefined)[]): (number | undefined)[] {
  const out = [...counts];
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== undefined) continue;
    let a = i - 1;
    while (a >= 0 && out[a] === undefined) a--;
    let b = i + 1;
    while (b < out.length && counts[b] === undefined) b++;
    if (a >= 0 && b < out.length) {
      const step = (counts[b]! - out[a]!) / (b - a);
      if (Number.isInteger(step)) out[i] = out[a]! + step * (i - a);
    } else if (a >= 1 && out[a - 1] !== undefined) {
      const step = out[a]! - out[a - 1]!;
      out[i] = out[a]! + step * (i - a);
    } else if (a < 0 && b < out.length - 1 && counts[b + 1] !== undefined) {
      const step = counts[b + 1]! - counts[b]!;
      const v = counts[b]! - step * (b - i);
      if (v > 0) out[i] = v;
    }
  }
  return out;
}

/** "R5: (30)" lines with gaps or missing counts get them filled in. */
export function fillChartCounts(lines: SrcLine[]): SrcLine[] {
  const idx: number[] = [];
  const nums: number[] = [];
  const counts: (number | undefined)[] = [];
  lines.forEach((l, i) => {
    const m = l.text.match(/^R(\d+):\s*(?:\((\d+)\))?\s*$/);
    if (m) {
      idx.push(i);
      nums.push(Number(m[1]));
      counts.push(m[2] ? Number(m[2]) : undefined);
    }
  });
  if (idx.length < 3 || !counts.some((c) => c === undefined)) return lines;
  const filled = inferCounts(counts);
  const out = [...lines];
  idx.forEach((li, k) => {
    if (counts[k] === undefined && filled[k] !== undefined) out[li] = { ...out[li], text: `R${nums[k]}: (${filled[k]})` };
  });
  return out;
}

// ---- Wrapped rounds, references ----

/** Rounds wrapped over several lines are joined back together. */
export function joinWrapped(lines: SrcLine[]): SrcLine[] {
  const out: SrcLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const text = l.text.trim();
    if (
      prev &&
      text &&
      prev.page === l.page &&
      matchLabel(prev.text.trim()) &&
      !matchLabel(text) &&
      !isTitle(text) &&
      !/[).\]!]\s*$/.test(prev.text.trim()) &&
      (/^[\p{Ll}(\d*,[]/u.test(text) || !/[.:!?]$/.test(prev.text.trim()))
    ) {
      prev.text = `${prev.text.trim()} ${text}`;
      prev.box = union(prev.box, l.box);
      continue;
    }
    out.push({ ...l });
  }
  return out;
}

/** Removes photo references ("[3]", "(see photo 2)") but keeps stated counts at the end of rounds. */
export function removePhotoRefs(text: string): string {
  let s = text.replace(/\s*\((?:see\s+|voir\s+(?:la\s+)?|ver\s+|siehe\s+|vedi\s+|zie\s+)?(?:photos?|pictures?|pics?|fig(?:ure)?\.?|image|bild|foto|afb\.?)\s*\d+[a-z]?\)/giu, '');
  const isRound = !!matchLabel(s.trim());
  s = s.replace(/\s*\[(\d{1,2})\](?!\s*$)/g, '');
  if (!isRound) s = s.replace(/\s*\[(\d{1,2})\]\s*$/g, '');
  return s;
}

// ---- OCR fixes ----

const LABEL_PREFIX = '(?:R|Rnd|Rd|Round|Rang|Tour|T|Row|Vuelta|V|Runde|Giro|G|Toer|Ronde)';

const VOCAB: Partial<Record<Lang, string[]>> = {
  fr: ['ms', 'aug', 'dim', 'ml', 'mc', 'db', 'br', 'dans', 'chaque', 'le', 'la', 'les', 'un', 'une', 'cercle', 'magique', 'maille', 'mailles', 'suivante', 'tout', 'tour', 'fois', 'en', 'et', 'de', 'du', 'rang', 'cm', 'm'],
  en: ['sc', 'inc', 'dec', 'ch', 'sl', 'st', 'sts', 'hdc', 'dc', 'tr', 'in', 'each', 'around', 'next', 'the', 'mr', 'magic', 'ring', 'rep', 'times', 'and', 'from', 'hook', 'rnd', 'blo', 'flo'],
};

/** Splits words run together by OCR ("msdans" → "ms dans") using the pattern vocabulary. */
export function splitRunTogether(token: string, lang: Lang): string {
  const vocab = new Set(VOCAB[lang === 'en-uk' ? 'en' : lang] ?? []);
  const low = token.toLowerCase();
  if (vocab.has(low) || low.length < 4) return token;
  // Dynamic programming: fewest pieces, all from the vocabulary.
  const best: (string[] | null)[] = Array(low.length + 1).fill(null);
  best[0] = [];
  for (let i = 1; i <= low.length; i++) {
    for (let j = Math.max(0, i - 9); j < i; j++) {
      const w = low.slice(j, i);
      if (best[j] && vocab.has(w) && (!best[i] || best[j]!.length + 1 < best[i]!.length)) best[i] = [...best[j]!, w];
    }
  }
  const parts = best[low.length];
  if (!parts || parts.length < 2 || parts.some((p) => p.length === 1)) return token;
  // Keep the original letters (case).
  let k = 0;
  return parts.map((p) => token.slice(k, (k += p.length))).join(' ');
}

/** Fixes common OCR misreadings in one line. */
export function fixOcrLine(line: string, lang: Lang): string {
  let s = line.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  // Label numbers: "R3%" → "R34", "Rl2" → "R12", "R1O" → "R10".
  s = s.replace(new RegExp(`^(${LABEL_PREFIX})\\s?([0-9lIOoS%]{1,3})(?=\\s*[:.\\-–)]|\\s)`, ''), (m, p: string, n: string) => {
    if (!/\d/.test(n)) return m;
    return p + n.replace(/[lI]/g, '1').replace(/[Oo]/g, '0').replace(/S/g, '5').replace(/%/g, '4');
  });
  // "| aug" → "1 aug": a bar or capital I standing for the digit one.
  s = s.replace(/(^|[\s(,:*])[|I](?=\s*[a-zA-Zàâéèêëîïôûüç]{2,})/g, (_m, pre: string) => `${pre}1`);
  s = s.replace(/(^|[\s(,:*])[|](?=\s)/g, '$11');
  if (lang === 'fr') {
    s = s.replace(/(\d)\s*ma\b/g, '$1 ms').replace(/\bma\b(?=\s*[,)(]|\s+dans)/g, 'ms');
    s = s.replace(/(^|[\s(,])l(?=\s+(?:ms|aug|dim|ml|mc|m)\b)/g, '$11');
  }
  if (lang === 'en' || lang === 'en-uk') s = s.replace(/(^|[\s(,])l(?=\s+(?:sc|inc|dec|ch|hdc|dc|st)\b)/g, '$11');
  // Words run together.
  s = s.replace(/(\d)([a-zA-Z]{2,})/g, (m, d: string, w: string) => {
    const split = splitRunTogether(w, lang);
    return split !== w ? `${d}${split}` : m;
  });
  s = s.replace(/[\p{L}]{4,}/gu, (w) => splitRunTogether(w, lang));
  return s;
}

/** Infers unreadable round numbers ("R?:", "R :") from the previous round. */
export function inferRoundNumbers(lines: SrcLine[]): SrcLine[] {
  let last = 0;
  return lines.map((l) => {
    const lab = matchLabel(l.text.trim());
    if (lab) {
      last = Math.max(...lab.numbers);
      return l;
    }
    const m = l.text.match(new RegExp(`^(${LABEL_PREFIX})\\s*[?#*~_-]*\\s*([:.)\\-–])\\s*(.+)$`));
    if (m && last > 0 && /\d|\p{L}{2,}/u.test(m[3])) {
      last += 1;
      return { ...l, text: `${m[1]}${last}${m[2]} ${m[3]}` };
    }
    return l;
  });
}

/** OCR lines read from photos or chart drawings: low confidence or mostly symbols. */
export function isJunkOcrLine(l: SrcLine): boolean {
  const s = l.text.trim();
  if (!s) return true;
  const alnum = (s.match(/[\p{L}\d]/gu) || []).length;
  if (alnum / s.replace(/\s/g, '').length < 0.5) return true;
  if (l.conf !== undefined && l.conf < 45) return true;
  // Isolated short fragments (chart symbols read as letters).
  if (s.length <= 3 && !/^\d+$/.test(s) && !matchLabel(s)) return true;
  const words = s.split(/\s+/);
  const vowelless = words.filter((w) => w.length > 3 && /^\p{L}+$/u.test(w) && !/[aeiouyàâéèêëîïôûüáíóú]/i.test(w)).length;
  return words.length >= 3 && vowelless / words.length > 0.5;
}

/** Garbled extracted text (fonts without a character map). */
export function looksGarbled(text: string): boolean {
  const s = text.replace(/\s+/g, '');
  if (s.length < 30) return false;
  if ((s.match(/[�-]/g) || []).length / s.length > 0.05) return true;
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (letters / s.length < 0.45) return true;
  const latin = text.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
  const vowelRatio = latin.filter((w) => /[aeiouyàâéèêëîïôûüáíóú]/i.test(w)).length / Math.max(1, latin.length);
  return latin.length > 10 && vowelRatio < 0.6;
}

export function cleanupLines(lines: SrcLine[], pages: number, lang: Lang): SrcLine[] {
  let out = removeHeadersFooters(lines, pages);
  out = out.map((l) => (l.ocr ? { ...l, text: fixOcrLine(l.text, lang) } : l));
  out = out.filter((l) => !l.ocr || !isJunkOcrLine(l));
  out = convertTables(out);
  out = out.map((l) => ({ ...l, text: removePhotoRefs(l.text) }));
  out = inferRoundNumbers(out);
  out = joinWrapped(out);
  out = fillChartCounts(out);
  return out;
}
