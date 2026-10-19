// Parsed pattern cache and progress helpers.

import type { ParseResult, Pattern, Round } from './types';
import { parsePattern } from '../parser/pattern';
import { getLang } from './i18n';

const cache = new Map<string, { sig: string; res: ParseResult }>();

export function parsed(p: Pattern): ParseResult {
  const sig = `${p.lang}|${p.sizeIndex}|${getLang()}|${p.text}`;
  const hit = cache.get(p.id);
  if (hit && hit.sig === sig) return hit.res;
  const res = parsePattern(p.text, { lang: p.lang, sizeIndex: p.sizeIndex, partLabel: getLang() === 'fr' ? 'Pièce' : 'Part' });
  cache.set(p.id, { sig, res });
  return res;
}

export function rounds(p: Pattern): Round[] {
  return parsed(p).pieces.flatMap((pc) => pc.rounds);
}

export type Status = 'new' | 'progress' | 'done';

export function progress(p: Pattern): { done: number; total: number; ratio: number; status: Status } {
  const all = rounds(p);
  const total = all.length;
  const done = all.filter((r) => p.done[r.key] !== undefined).length;
  const ratio = total ? done / total : 0;
  const status: Status = total && done === total ? 'done' : done > 0 || Object.keys(p.timeLog).length ? 'progress' : 'new';
  return { done, total, ratio, status };
}

/** First round not ticked yet. */
export function currentRound(p: Pattern): Round | undefined {
  return rounds(p).find((r) => p.done[r.key] === undefined);
}

export function totalSeconds(p: Pattern): number {
  let s = Object.values(p.timeLog).reduce((a, b) => a + b, 0);
  if (p.timerStartedAt) s += (Date.now() - p.timerStartedAt) / 1000;
  return s;
}

export function lastDaysSeconds(p: Pattern, days: number): number {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  let s = 0;
  for (const [day, sec] of Object.entries(p.timeLog)) if (new Date(day + 'T00:00:00') >= since) s += sec;
  if (p.timerStartedAt) s += (Date.now() - p.timerStartedAt) / 1000;
  return s;
}
