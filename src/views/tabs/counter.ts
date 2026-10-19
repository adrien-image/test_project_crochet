// Counter: one round at a time, with a large touch ring.

import { h, s, clear, toast, debounce, pickFile } from '../../core/dom';
import { t, getLang } from '../../core/i18n';
import type { Pattern, Round, StitchOp } from '../../core/types';
import { currentRound, parsed } from '../../core/progress';
import * as store from '../../store/store';
import { completeCurrent, undoLast } from '../../features/actions';
import { storePhoto } from '../../features/images';
import * as hf from '../../features/handsfree';
import { timerBox } from '../pattern';

const ABBR: Record<'fr' | 'en', Record<string, string>> = {
  fr: { sc: 'ms', hdc: 'db', dc: 'br', tr: 'dbr', dtr: 'tbr', ch: 'ml', sl: 'mc', mr: 'cm', inc: 'aug', dec: 'dim', inc3: '3/1', dec3: '3ens', picot: 'pic', bobble: 'bob', puff: 'puff', popcorn: 'pop', skip: 'saut' },
  en: { sc: 'sc', hdc: 'hdc', dc: 'dc', tr: 'tr', dtr: 'dtr', ch: 'ch', sl: 'sl', mr: 'MR', inc: 'inc', dec: 'dec', inc3: '3-in-1', dec3: 'sc3tog', picot: 'picot', bobble: 'bob', puff: 'puff', popcorn: 'pop', skip: 'sk' },
};

export function opLabel(op: StitchOp): string {
  const d = ABBR[getLang()];
  let l = d[op.kind] ?? op.kind;
  if ((op.kind === 'inc' || op.kind === 'dec') && op.base && op.base !== 'sc') l = `${d[op.base]}-${l}`;
  if (op.produces > 1 && !['inc', 'inc3'].includes(op.kind)) l = `${op.produces}${d[op.kind]}`;
  return l;
}

function expected(p: Pattern, r: Round): number {
  const res = parsed(p);
  const piece = res.pieces.find((pc) => pc.rounds.includes(r));
  const prev = piece?.rounds[r.index - 1];
  return r.count ?? r.stated ?? prev?.count ?? 0;
}

let wakeLock: { release(): Promise<void> } | null = null;
async function keepAwake(on: boolean) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock.request('screen');
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

export function counterTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const left = h('div', { class: 'ring-wrap' });
  const right = h('div', { class: 'stack' });
  const timer = timerBox(id);
  root.append(h('div', { class: 'counter' }, left, right));
  let mediaOn = false;
  let voiceOn = false;
  const heard = h('p', { class: 'small muted', 'aria-live': 'polite' });

  const plus = () => void store.update(id, (q) => (q.stitchCount += 1), { touch: false });
  const minus = () => void store.update(id, (q) => (q.stitchCount = Math.max(0, q.stitchCount - 1)), { touch: false });
  const zero = () => void store.update(id, (q) => (q.stitchCount = 0), { touch: false });
  const done = async () => {
    const r = await completeCurrent(id);
    if (r) toast(t('round_done_toast', { label: r.label }));
  };
  const cmds: hf.Commands = { plus, minus, done: () => void done(), zero };

  const saveNote = debounce((key: string, v: string) => void store.update(id, (q) => (v.trim() ? (q.roundNotes[key] = v) : delete q.roundNotes[key]), { silent: true }), 500);

  const render = () => {
    const p = store.getPattern(id);
    if (!p) return;
    const r = currentRound(p);
    clear(left);
    clear(right);
    if (!r) {
      left.append(h('p', { class: 'empty' }, parsed(p).pieces.length ? `🎉 ${t('all_done')}` : t('no_rounds')));
      right.append(h('button', { class: 'btn', onclick: () => void undoLast(id) }, '↶ ', t('counter_undo')), timer.el);
      return;
    }
    const res = parsed(p);
    const piece = res.pieces.find((pc) => pc.rounds.includes(r))!;
    const total = expected(p, r);
    const n = p.stitchCount;
    const color = p.colors[piece.name.toLowerCase()] ?? r.color ?? piece.color ?? '#c2416b';
    left.append(
      h('h2', { style: 'text-align:center;margin-bottom:.25rem' }, r.label, res.pieces.length > 1 ? h('span', { class: 'muted' }, ` · ${piece.name}`) : null),
      h('p', { class: 'small muted', style: 'text-align:center;max-width:36rem' }, r.instructions),
      h('button', { class: 'ring-btn', 'aria-label': `${t('counter_plus')} — ${n} / ${total}`, onclick: plus }, ring(n, total, color)),
      h('p', { class: 'small muted', style: 'text-align:center' }, t('counter_tap')),
      h(
        'div',
        { class: 'counter-controls' },
        h('button', { class: 'btn', onclick: minus, 'aria-label': t('counter_minus') }, '−1'),
        h('button', { class: 'btn btn-primary', onclick: () => void done() }, '✓ ', t('counter_next')),
        h('button', { class: 'btn', onclick: () => void undoLast(id) }, '↶ ', t('counter_undo')),
        h('button', { class: 'btn btn-ghost', onclick: zero }, t('counter_reset')),
      ),
      h('p', { class: 'small muted', style: 'text-align:center;margin-top:.75rem' }, t('counter_shortcuts')),
    );

    // Stitches of the round, with what's done so far.
    const ops = r.ops.filter((o) => o.kind !== 'mr' && o.kind !== 'skip');
    let acc = 0;
    const chips = ops.map((o) => {
      const before = acc;
      acc += o.produces;
      const cls = acc <= n && o.produces > 0 ? 'made' : before <= n && n < acc ? 'next' : before === n && o.produces === 0 ? 'next' : '';
      return h('span', { class: cls }, opLabel(o));
    });
    const info: (HTMLElement | null)[] = [
      r.colorName || r.color ? h('p', { style: 'margin:0' }, h('span', { class: 'color-dot', style: `background:${color}` }), ' ', t('counter_color', { c: r.colorName ?? '' })) : null,
      r.loop ? h('p', { style: 'margin:0' }, h('span', { class: 'badge warn' }, r.loop === 'blo' ? t('counter_blo') : t('counter_flo'))) : null,
    ];
    const note = h('textarea', { rows: 3, placeholder: t('counter_note'), 'aria-label': t('counter_note'), style: 'width:100%' });
    note.value = p.roundNotes[r.key] ?? '';
    note.addEventListener('input', () => saveNote(r.key, note.value));
    note.addEventListener('keydown', (e) => e.stopPropagation());
    const photoBox = h('div', { class: 'row' });
    const photoId = p.roundPhotos[r.key];
    if (photoId) {
      const img = h('img', { alt: t('counter_photo'), style: 'width:96px;height:96px;object-fit:cover;border-radius:10px' });
      void store.blobUrl(photoId, true).then((u) => u && (img.src = u));
      photoBox.append(img);
    }
    photoBox.append(
      h('button', {
        class: 'btn btn-small',
        onclick: async () => {
          const [f] = await pickFile('image/*');
          if (!f) return;
          const bid = await storePhoto(f, f.name);
          void store.update(id, (q) => (q.roundPhotos[r.key] = bid));
        },
      }, '📷 ', t('counter_photo')),
    );
    right.append(
      h('div', { class: 'panel stack' }, h('h3', { style: 'margin:0' }, t('counter_stitches')), h('div', { class: 'round-ops' }, ...chips), ...info),
      h('div', { class: 'panel stack' }, h('h3', { style: 'margin:0' }, '📝 ', t('counter_note')), note, photoBox),
      timer.el,
      handsfreeBox(p.name),
      h('p', { class: 'small muted' }, '💡 ', t('counter_awake')),
    );
    hf.updateMedia(`${r.label} — ${n} / ${total}`, p.name);
  };

  function handsfreeBox(name: string): HTMLElement {
    const media = h('input', {
      type: 'checkbox',
      checked: mediaOn,
      disabled: !hf.mediaSupported(),
      onchange: async () => {
        mediaOn = media.checked;
        if (mediaOn) await hf.startMedia(cmds, name).catch(() => (mediaOn = false));
        else hf.stopMedia();
      },
    });
    const voice = h('input', {
      type: 'checkbox',
      checked: voiceOn,
      disabled: !hf.voiceSupported(),
      onchange: () => {
        voiceOn = voice.checked;
        if (voiceOn)
          hf.startVoice(cmds, getLang() === 'fr' ? 'fr-FR' : 'en-US', (w) => (heard.textContent = t('voice_heard', { w })), (e) => {
            voiceOn = false;
            voice.checked = false;
            toast(e);
          });
        else hf.stopVoice();
      },
    });
    return h(
      'div',
      { class: 'panel stack' },
      h('h3', { style: 'margin:0' }, '🎧 ', t('handsfree')),
      h('label', { class: 'row' }, media, t('handsfree_media')),
      h('p', { class: 'small muted', style: 'margin:0' }, t('handsfree_media_help')),
      h('label', { class: 'row' }, voice, t('handsfree_voice')),
      h('p', { class: 'small muted', style: 'margin:0' }, hf.voiceSupported() ? t('handsfree_voice_help') : t('voice_unsupported')),
      heard,
    );
  }

  const onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement;
    if (tgt.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      plus();
    } else if (e.key === 'Enter') {
      if (tgt.closest('button, a')) return;
      e.preventDefault();
      void done();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      minus();
    }
  };
  document.addEventListener('keydown', onKey);
  const onVis = () => document.visibilityState === 'visible' && void keepAwake(true);
  document.addEventListener('visibilitychange', onVis);
  void keepAwake(true);
  render();
  const off = store.subscribe((ids) => ids.includes(id) && render());
  return () => {
    off();
    timer.stop();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    void keepAwake(false);
    hf.stopMedia();
    hf.stopVoice();
  };
}

function ring(n: number, total: number, color: string): SVGSVGElement {
  const size = 200;
  const c = size / 2;
  const R = 84;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
  const segs = Math.max(1, total);
  const gap = segs > 60 ? 0 : 0.03;
  svg.append(s('circle', { cx: c, cy: c, r: R + 12, fill: 'var(--surface)', stroke: 'var(--line)' }), s('circle', { cx: c, cy: c, r: R, fill: 'none', stroke: 'var(--line)', 'stroke-width': 18 }));
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI / 2 + (i / segs) * Math.PI * 2 + gap / 2;
    const a1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI * 2 - gap / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)}`;
    svg.append(s('path', { d, fill: 'none', stroke: i < n ? color : 'var(--surface-2)', 'stroke-width': 16, 'stroke-linecap': segs > 40 ? 'butt' : 'round' }));
  }
  const over = total > 0 && n > total;
  svg.append(
    s('text', { x: c, y: c + 6, 'text-anchor': 'middle', 'font-size': 46, 'font-weight': 700, fill: over ? 'var(--bad)' : 'var(--ink)' }, String(n)),
    s('text', { x: c, y: c + 32, 'text-anchor': 'middle', 'font-size': 16, fill: 'var(--ink-2)' }, total ? `/ ${total}` : ''),
  );
  return svg;
}
