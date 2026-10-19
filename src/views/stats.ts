import { h, s, clear, fmtDuration } from '../core/dom';
import { t, fmtNumber, fmtMeters, getLang } from '../core/i18n';
import type { Pattern } from '../core/types';
import { parsed, progress, totalSeconds } from '../core/progress';
import { roundLengthCm } from '../core/yarn';
import * as store from '../store/store';

type Metric = 'time' | 'rounds' | 'yarn';
let metric: Metric = 'time';

function hookOf(p: Pattern): number {
  return p.hookMm ?? parsed(p).hookMm ?? 3.5;
}

/** Yarn (m) of each ticked round, with its date. */
function yarnTicks(p: Pattern): { at: number; m: number }[] {
  const res = parsed(p);
  const hook = hookOf(p);
  const out: { at: number; m: number }[] = [];
  for (const pc of res.pieces) {
    let prev: number | undefined;
    for (const r of pc.rounds) {
      const at = p.done[r.key];
      if (at !== undefined) out.push({ at, m: (roundLengthCm(r, hook, prev) * pc.copies) / 100 });
      prev = r.count ?? r.stated ?? prev;
    }
  }
  return out;
}

function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function weeklyStats(patterns: Pattern[], now = new Date()) {
  const start = weekStart(now);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() - (11 - i) * 7);
    return { start: d, time: 0, rounds: 0, yarn: 0 };
  });
  const idx = (ts: number) => {
    const w = weekStart(new Date(ts)).getTime();
    return weeks.findIndex((x) => x.start.getTime() === w);
  };
  for (const p of patterns) {
    for (const [day, sec] of Object.entries(p.timeLog)) {
      const i = idx(new Date(day + 'T12:00:00').getTime());
      if (i >= 0) weeks[i].time += sec;
    }
    for (const tk of yarnTicks(p)) {
      if (!tk.at) continue; // ticked before dates were recorded
      const i = idx(tk.at);
      if (i >= 0) {
        weeks[i].rounds += 1;
        weeks[i].yarn += tk.m;
      }
    }
  }
  return weeks;
}

export function statsView(root: HTMLElement) {
  const wrap = h('div');
  root.append(h('h1', null, t('stats_title')), wrap);
  const render = () => {
    clear(wrap);
    const all = store.list();
    const prs = all.map((p) => ({ p, pr: progress(p), sec: totalSeconds(p), yarn: yarnTicks(p).reduce((a, x) => a + x.m, 0) }));
    const totalTime = prs.reduce((a, x) => a + x.sec, 0);
    const totalRounds = prs.reduce((a, x) => a + x.pr.done, 0);
    const totalYarn = prs.reduce((a, x) => a + x.yarn, 0);
    const kpi = (v: string, l: string) => h('div', { class: 'panel kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
    wrap.append(
      h(
        'div',
        { class: 'kpis' },
        kpi(fmtDuration(totalTime), t('stat_time')),
        kpi(fmtNumber(totalRounds), t('stat_rounds')),
        kpi(fmtNumber(prs.filter((x) => x.pr.status === 'done').length), t('stat_finished')),
        kpi(fmtNumber(prs.filter((x) => x.pr.status === 'progress').length), t('stat_in_progress')),
        kpi(fmtMeters(totalYarn), t('stat_yarn')),
      ),
    );

    const weeks = weeklyStats(all);
    const chartBox = h('div', { class: 'chart-wrap' });
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('weeks_12') });
    for (const m of ['time', 'rounds', 'yarn'] as Metric[]) {
      seg.append(
        h('button', {
          'aria-pressed': String(metric === m),
          onclick: () => {
            metric = m;
            render();
          },
        }, t(`metric_${m}`)),
      );
    }
    const fmtVal = (v: number) => (metric === 'time' ? fmtDuration(v) : metric === 'yarn' ? fmtMeters(v) : fmtNumber(v));
    const dateFmt = (d: Date) => d.toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' });
    chartBox.append(barChart(weeks.map((w) => ({ label: dateFmt(w.start), value: w[metric], title: `${t('week_of', { date: dateFmt(w.start) })} : ${fmtVal(w[metric])}` })), fmtVal));
    const table = h(
      'table',
      { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, t('col_week')), h('th', { class: 'num' }, t('metric_time')), h('th', { class: 'num' }, t('metric_rounds')), h('th', { class: 'num' }, t('metric_yarn')))),
      h('tbody', null, ...weeks.map((w) => h('tr', null, h('td', null, dateFmt(w.start)), h('td', { class: 'num' }, fmtDuration(w.time)), h('td', { class: 'num' }, fmtNumber(w.rounds)), h('td', { class: 'num' }, fmtMeters(w.yarn))))),
    );
    wrap.append(
      h(
        'section',
        { class: 'panel', style: 'margin-bottom:1.25rem' },
        h('div', { class: 'row', style: 'margin-bottom:.75rem' }, h('h2', { style: 'margin:0' }, t('weeks_12')), h('span', { class: 'spacer' }), seg),
        chartBox,
        h('details', null, h('summary', { class: 'small muted' }, t('show_table')), h('div', { class: 'table-scroll' }, table)),
        h('p', { class: 'small muted', style: 'margin:.5rem 0 0' }, t('stats_note')),
      ),
    );

    const rows = prs.filter((x) => x.sec > 0 || x.pr.done > 0).sort((a, b) => b.sec - a.sec);
    wrap.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', null, t('per_pattern')),
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, t('col_pattern')), h('th', { class: 'num' }, t('col_time')), h('th', { class: 'num' }, t('col_rounds')), h('th', { class: 'num' }, t('col_rph')), h('th', { class: 'num' }, t('col_yarn')))),
            h(
              'tbody',
              null,
              ...rows.map((x) =>
                h(
                  'tr',
                  null,
                  h('td', null, h('a', { href: `#/patron/${x.p.id}` }, x.p.name)),
                  h('td', { class: 'num' }, fmtDuration(x.sec)),
                  h('td', { class: 'num' }, `${x.pr.done} / ${x.pr.total}`),
                  h('td', { class: 'num' }, x.sec > 60 ? fmtNumber(x.pr.done / (x.sec / 3600), 1) : '—'),
                  h('td', { class: 'num' }, fmtMeters(x.yarn)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };
  render();
  return store.subscribe(render);
}

function barChart(data: { label: string; value: number; title: string }[], fmt: (v: number) => string): Element {
  const W = 720;
  const H = 240;
  const m = { l: 56, r: 8, t: 12, b: 28 };
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const nice = niceMax(max);
  const bw = (W - m.l - m.r) / data.length;
  const y = (v: number) => m.t + (H - m.t - m.b) * (1 - v / nice);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('weeks_12') });
  const muted = 'var(--ink-2)';
  for (let i = 0; i <= 4; i++) {
    const v = (nice * i) / 4;
    svg.append(
      s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }),
      s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: muted }, fmt(v)),
    );
  }
  const tip = s('g', { visibility: 'hidden', 'pointer-events': 'none' });
  const tipBg = s('rect', { rx: 6, fill: 'var(--ink)' });
  const tipText = s('text', { 'font-size': 12, fill: 'var(--bg)' });
  tip.append(tipBg, tipText);
  data.forEach((d, i) => {
    const x = m.l + i * bw;
    const barW = Math.min(36, bw - 2);
    const bx = x + (bw - barW) / 2;
    const top = y(d.value);
    const hgt = H - m.b - top;
    const r = Math.min(4, hgt);
    if (d.value > 0)
      svg.append(
        s('path', {
          d: `M${bx},${H - m.b} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + barW - r} Q${bx + barW},${top} ${bx + barW},${top + r} V${H - m.b} Z`,
          fill: 'var(--accent)',
        }),
      );
    if (i % 2 === 1 || data.length <= 8) svg.append(s('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: muted }, d.label));
    // Hit target: the whole column, larger than the bar.
    const hit = s('rect', { x, y: m.t, width: bw, height: H - m.t - m.b, fill: 'transparent', tabindex: 0, 'aria-label': d.title });
    const show = () => {
      tipText.textContent = d.title;
      tip.setAttribute('visibility', 'visible');
      const tw = d.title.length * 6.4 + 16;
      const tx = Math.min(W - tw - 2, Math.max(2, x + bw / 2 - tw / 2));
      const ty = Math.max(2, top - 34);
      tipBg.setAttribute('x', String(tx));
      tipBg.setAttribute('y', String(ty));
      tipBg.setAttribute('width', String(tw));
      tipBg.setAttribute('height', '24');
      tipText.setAttribute('x', String(tx + 8));
      tipText.setAttribute('y', String(ty + 16));
    };
    const hide = () => tip.setAttribute('visibility', 'hidden');
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('focus', show);
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('blur', hide);
    svg.append(hit);
  });
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: muted, 'stroke-width': 1 }));
  svg.append(tip);
  return svg;
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
