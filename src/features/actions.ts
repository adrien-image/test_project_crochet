// Pattern actions shared by several views.

import type { Pattern } from '../core/types';
import { dayKey } from '../core/dom';
import { rounds } from '../core/progress';
import * as store from '../store/store';

export async function setRoundDone(id: string, key: string, done: boolean) {
  await store.update(id, (p) => {
    if (done) p.done[key] = Date.now();
    else delete p.done[key];
  });
}

/** Ticks the current round and moves on. Returns the round ticked. */
export async function completeCurrent(id: string) {
  const p = store.getPattern(id);
  if (!p) return undefined;
  const r = rounds(p).find((x) => p.done[x.key] === undefined);
  if (!r) return undefined;
  await store.update(id, (q) => {
    q.done[r.key] = Date.now();
    q.stitchCount = 0;
  });
  return r;
}

/** Unticks the last ticked round (in pattern order). */
export async function undoLast(id: string) {
  const p = store.getPattern(id);
  if (!p) return undefined;
  const all = rounds(p);
  const firstUndone = all.findIndex((x) => p.done[x.key] === undefined);
  const r = all[(firstUndone === -1 ? all.length : firstUndone) - 1];
  if (!r) return undefined;
  await store.update(id, (q) => {
    delete q.done[r.key];
    q.stitchCount = 0;
  });
  return r;
}

// ---- Timer ----

/** Splits a time span over the days it covers. */
export function addSpan(p: Pattern, from: number, to: number) {
  let t = from;
  while (t < to) {
    const d = new Date(t);
    const end = new Date(d);
    end.setHours(24, 0, 0, 0);
    const stop = Math.min(to, end.getTime());
    const key = dayKey(d);
    p.timeLog[key] = (p.timeLog[key] ?? 0) + (stop - t) / 1000;
    t = stop;
  }
}

export async function startTimer(id: string) {
  await store.update(id, (p) => {
    if (!p.timerStartedAt) p.timerStartedAt = Date.now();
  }, { touch: false });
}

export async function stopTimer(id: string) {
  await store.update(id, (p) => {
    if (p.timerStartedAt) {
      addSpan(p, p.timerStartedAt, Date.now());
      delete p.timerStartedAt;
    }
  });
}
