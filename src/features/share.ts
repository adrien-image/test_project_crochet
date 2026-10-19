// Share links (pattern compressed into the URL), pattern files and Markdown.
// Shared data is validated field by field: a link can only carry plain text
// fields, never files, URLs to blobs or extra properties.

import type { Lang, Pattern, Round } from '../core/types';
import { parsed } from '../core/progress';
import { newPattern, uid } from '../store/store';

export interface SharedPattern {
  v: 1;
  name: string;
  text: string;
  lang?: Lang | 'auto';
  hookMm?: number;
  yarn?: string;
  tags?: string[];
  checklist?: string[];
  colors?: Record<string, string>;
  sizeIndex?: number;
}

const LANGS = ['auto', 'fr', 'en', 'en-uk', 'es', 'pt', 'de', 'it', 'nl', 'xva'];
const MAX_TEXT = 200_000;

export function toShared(p: Pattern): SharedPattern {
  const out: SharedPattern = { v: 1, name: p.name, text: p.text };
  if (p.lang !== 'auto') out.lang = p.lang;
  if (p.hookMm) out.hookMm = p.hookMm;
  if (p.yarn) out.yarn = p.yarn;
  if (p.tags.length) out.tags = p.tags;
  if (p.checklist.length) out.checklist = p.checklist.map((c) => c.text);
  if (Object.keys(p.colors).length) out.colors = p.colors;
  if (p.sizeIndex) out.sizeIndex = p.sizeIndex;
  return out;
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? stripFiles(v).slice(0, max) : undefined);

/** Removes anything that looks like an embedded file. */
function stripFiles(v: string): string {
  return v.replace(/\b(?:data|blob|filesystem|javascript):[^\s)"']*/gi, '');
}

/** Throws unless the object is a well-formed shared pattern; returns a clean copy. */
export function validateShared(raw: unknown): SharedPattern {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid');
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) throw new Error('version');
  const name = str(o.name, 200);
  const text = str(o.text, MAX_TEXT);
  if (name === undefined || text === undefined) throw new Error('fields');
  const out: SharedPattern = { v: 1, name, text };
  if (typeof o.lang === 'string' && LANGS.includes(o.lang)) out.lang = o.lang as Lang;
  if (typeof o.hookMm === 'number' && o.hookMm > 0 && o.hookMm < 30) out.hookMm = o.hookMm;
  const yarn = str(o.yarn, 300);
  if (yarn) out.yarn = yarn;
  if (Array.isArray(o.tags)) out.tags = o.tags.filter((x): x is string => typeof x === 'string').slice(0, 30).map((x) => stripFiles(x).slice(0, 40));
  if (Array.isArray(o.checklist))
    out.checklist = o.checklist.filter((x): x is string => typeof x === 'string').slice(0, 100).map((x) => stripFiles(x).slice(0, 300));
  if (o.colors && typeof o.colors === 'object' && !Array.isArray(o.colors)) {
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.colors as Record<string, unknown>).slice(0, 50)) {
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) c[k.slice(0, 60)] = v;
    }
    out.colors = c;
  }
  if (typeof o.sizeIndex === 'number' && Number.isInteger(o.sizeIndex) && o.sizeIndex >= 0 && o.sizeIndex < 20) out.sizeIndex = o.sizeIndex;
  return out;
}

export function fromShared(sp: SharedPattern, source: Pattern['source'] = 'share'): Pattern {
  return newPattern({
    name: sp.name,
    text: sp.text,
    lang: sp.lang ?? 'auto',
    hookMm: sp.hookMm,
    yarn: sp.yarn,
    tags: sp.tags ?? [],
    checklist: (sp.checklist ?? []).map((text) => ({ id: uid(), text, done: false })),
    colors: sp.colors ?? {},
    sizeIndex: sp.sizeIndex ?? 0,
    source,
  });
}

// ---- base64url + deflate ----

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(sp: SharedPattern): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(sp));
  return toB64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(data: string): Promise<SharedPattern> {
  if (!/^[A-Za-z0-9_-]+$/.test(data) || data.length > 400_000) throw new Error('format');
  const bytes = await pipe(fromB64url(data), new DecompressionStream('deflate-raw'));
  if (bytes.length > MAX_TEXT * 2) throw new Error('size');
  return validateShared(JSON.parse(new TextDecoder().decode(bytes)));
}

export function appBase(): string {
  return location.href.split('#')[0];
}

export async function shareUrl(p: Pattern, kind: 'partage' | 'imprimer' = 'partage'): Promise<string> {
  return `${appBase()}#/${kind}/${await encodeShare(toShared(p))}`;
}

// ---- Pattern file ----

export function patternFile(p: Pattern): Blob {
  const body = { format: 'mon-crochet-pattern', ...toShared(p) };
  return new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
}

export function readPatternFile(text: string): SharedPattern {
  const o = JSON.parse(text);
  if (o?.format !== 'mon-crochet-pattern') throw new Error('format');
  return validateShared(o);
}

export function fileName(p: Pattern, ext: string): string {
  const base = (p.name || 'patron')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base || 'patron'}${ext}`;
}

// ---- Markdown ----

export function toMarkdown(p: Pattern, labels: { hook: string; yarn: string; tags: string; steps: string; notes: string }): string {
  const res = parsed(p);
  const roundsByLine = res.byLine;
  const out: string[] = [`# ${p.name}`, ''];
  const meta: string[] = [];
  if (p.hookMm) meta.push(`- **${labels.hook}:** ${p.hookMm} mm`);
  if (p.yarn) meta.push(`- **${labels.yarn}:** ${p.yarn}`);
  if (p.tags.length) meta.push(`- **${labels.tags}:** ${p.tags.join(', ')}`);
  if (meta.length) out.push(...meta, '');
  if (p.checklist.length) {
    out.push(`## ${labels.steps}`, '');
    for (const c of p.checklist) out.push(`- [${c.done ? 'x' : ' '}] ${c.text}`);
    out.push('');
  }
  out.push('---', '');
  p.text.split('\n').forEach((line, i) => {
    const rs: Round[] | undefined = roundsByLine.get(i);
    if (rs?.length) {
      const allDone = rs.every((r) => p.done[r.key] !== undefined);
      out.push(`- [${allDone ? 'x' : ' '}] ${line.trim()}`);
      for (const r of rs) {
        const note = p.roundNotes[r.key];
        if (note) out.push(`  > ${r.label}: ${note.replace(/\n/g, ' ')}`);
      }
    } else if (/^[^a-z]{3,}$/.test(line.trim()) && /\p{Lu}/u.test(line)) {
      out.push('', `## ${line.trim()}`, '');
    } else out.push(line);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
