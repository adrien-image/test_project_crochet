// Pattern editor (new pattern and "Edit" tab).

import { h, clear, toast, debounce } from '../core/dom';
import { t, langName, getLang } from '../core/i18n';
import type { Lang, Pattern } from '../core/types';
import { parsePattern, matchLabel } from '../parser/pattern';
import { ABBREVIATIONS, detectLang } from '../parser/lexicon';
import * as store from '../store/store';

const LANGS: (Lang | 'auto')[] = ['auto', 'fr', 'en', 'en-uk', 'es', 'pt', 'de', 'it', 'nl', 'xva'];

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Label for the round after the last one before `lineIdx`, in the same style ("R4 :" → "R5 : "). */
export function nextRoundLabel(text: string, lineIdx: number, lang: Lang): string {
  const lines = text.split('\n');
  for (let i = Math.min(lineIdx, lines.length - 1); i >= 0; i--) {
    const line = lines[i];
    const lab = matchLabel(line.trim());
    if (!lab || (lab.bare && !lab.rest)) continue;
    const next = Math.max(...lab.numbers) + 1;
    const trimmed = line.trim();
    const head = trimmed.slice(0, trimmed.length - lab.rest.length);
    const ord = head.match(/^(\s*)(\d+)(st|nd|rd|th)(\b.*?)(?:\s*(?:to|-|–)\s*\d+(?:st|nd|rd|th)?)?(\s*(?:rnds?|rounds?|rows?)s?\b.*)$/i);
    if (ord) return `${ordinal(next)}${ord[5].replace(/s\b/i, '')}`.replace(/\s*$/, ' ');
    const first = head.match(/^(\D*?)(\d+)/);
    if (!first) continue;
    // Keep the separator that follows the label ("R4 : " → " : ").
    const sep = head.slice(head.search(/\d[^\d]*$/) + 1).replace(/^\s*(?:[-–&,]|to|à|and|et)\s*\D*\d+/i, '');
    const cleanSep = sep.match(/^[^\p{L}\d]*/u)?.[0] ?? ': ';
    return `${first[1]}${next}${cleanSep || ': '}`.replace(/\s*$/, ' ');
  }
  return lang === 'fr' ? 'R1 : ' : lang === 'es' ? 'V1: ' : lang === 'de' ? 'Rd 1: ' : 'Rnd 1: ';
}

function caretLine(ta: HTMLTextAreaElement): number {
  return ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
}

function form(root: HTMLElement, p: Pattern | null, onSave: (data: Partial<Pattern>) => Promise<void>, isNew: boolean) {
  const name = h('input', { type: 'text', value: p?.name ?? '', required: true });
  const hook = h('input', { type: 'number', step: '0.25', min: '0.5', max: '25', value: p?.hookMm ? String(p.hookMm) : '' });
  const yarn = h('input', { type: 'text', value: p?.yarn ?? '' });
  const tags = h('input', { type: 'text', value: p?.tags.join(', ') ?? '' });
  const lang = h('select', null, ...LANGS.map((l) => h('option', { value: l, selected: (p?.lang ?? 'auto') === l }, l === 'auto' ? t('lang_auto') : langName(l))));
  const ta = h('textarea', { spellcheck: false, placeholder: t('editor_placeholder'), 'aria-label': t('field_text') });
  ta.value = p?.text ?? '';
  const live = h('div', { class: 'live', 'aria-live': 'polite' });
  const sugg = h('div', { class: 'sugg' });
  const detected = h('p', { class: 'small muted' });
  let suggestions: string[] = [];

  const curLang = (): Lang => {
    if (lang.value !== 'auto') return lang.value as Lang;
    // Too little text to tell: follow the interface language.
    return ta.value.trim().length < 12 ? getLang() : detectLang(ta.value);
  };

  const check = () => {
    const l = curLang();
    detected.textContent = lang.value === 'auto' && ta.value.trim() ? t('detected', { l: langName(l) }) : '';
    const res = parsePattern(ta.value, { lang: l });
    const li = caretLine(ta);
    const rs = res.byLine.get(li);
    live.className = 'live';
    if (!rs?.length) {
      live.textContent = ta.value.trim() ? t('live_none') : '';
      return;
    }
    const r = rs[0];
    if (r.mismatch) {
      live.className = 'live bad';
      live.textContent = `⚠ ${r.label} — ${t('count_mismatch', { got: r.count ?? '?', stated: r.stated ?? '?' })}`;
    } else if (r.consumeMismatch) {
      live.className = 'live bad';
      const piece = res.pieces.find((pc) => pc.rounds.includes(r));
      live.textContent = `⚠ ${r.label} — ${t('consume_mismatch', { used: r.consumed, prev: piece?.rounds[r.index - 1]?.count ?? '?' })}`;
    } else if (r.count !== undefined) {
      live.className = 'live ok';
      live.textContent = `✓ ${t('live_ok', { label: r.label, n: r.count })}`;
    } else live.textContent = t('live_unknown', { label: r.label });
  };
  const checkSoon = debounce(check, 150);

  const wordBefore = () => ta.value.slice(0, ta.selectionStart).match(/[\p{L}]+$/u)?.[0] ?? '';
  const complete = (abbr: string) => {
    const w = wordBefore();
    const pos = ta.selectionStart;
    ta.setRangeText(abbr + ' ', pos - w.length, pos, 'end');
    ta.focus();
    updateSugg();
    checkSoon();
  };
  const updateSugg = () => {
    clear(sugg);
    const w = wordBefore();
    const list = ABBREVIATIONS[curLang()] ?? [];
    suggestions = w
      ? list.filter((a) => a.abbr.toLowerCase().startsWith(w.toLowerCase()) && a.abbr.toLowerCase() !== w.toLowerCase()).map((a) => a.abbr)
      : [];
    const shown = w ? list.filter((a) => suggestions.includes(a.abbr)) : list;
    for (const a of shown.slice(0, 12))
      sugg.append(h('button', { type: 'button', title: a.meaning, onmousedown: (e: Event) => e.preventDefault(), onclick: () => complete(a.abbr) }, a.abbr));
  };

  ta.addEventListener('input', () => {
    updateSugg();
    checkSoon();
  });
  ta.addEventListener('click', checkSoon);
  ta.addEventListener('keyup', (e) => {
    if (e.key.startsWith('Arrow')) checkSoon();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && suggestions.length) {
      e.preventDefault();
      complete(suggestions[0]);
    }
  });
  lang.addEventListener('change', () => {
    updateSugg();
    check();
  });

  const nextRound = () => {
    const li = caretLine(ta);
    const label = nextRoundLabel(ta.value, li, curLang());
    const lines = ta.value.split('\n');
    const cur = lines[li] ?? '';
    // Insert at the end of the caret line, on a new line if it has text.
    const lineEnd = ta.value.split('\n').slice(0, li + 1).join('\n').length;
    const insert = cur.trim() ? '\n' + label : label;
    ta.setRangeText(insert, lineEnd, lineEnd, 'end');
    ta.focus();
    check();
  };

  const submit = async () => {
    if (!name.value.trim()) {
      toast(t('name_required'));
      name.focus();
      return;
    }
    const hk = parseFloat(hook.value.replace(',', '.'));
    await onSave({
      name: name.value.trim(),
      hookMm: hk > 0 ? hk : (parsePattern(ta.value).hookMm ?? undefined),
      yarn: yarn.value.trim() || undefined,
      tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean),
      lang: lang.value as Lang | 'auto',
      text: ta.value,
    });
  };

  const field = (label: string, el: HTMLElement) => h('label', { class: 'field' }, label, el);
  root.append(
    h(
      'div',
      { class: 'editor' },
      h(
        'div',
        null,
        h('div', { class: 'fields' }, field(t('field_name'), name), field(t('field_hook'), hook), field(t('field_yarn'), yarn), field(t('field_tags'), tags), field(t('field_lang'), lang)),
        detected,
        ta,
        h('div', { class: 'row', style: 'margin-top:.5rem' },
          h('button', { type: 'button', class: 'btn', onclick: nextRound }, '↵ ', t('next_round')),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: () => void submit() }, isNew ? t('create') : t('save'))),
      ),
      h(
        'aside',
        { class: 'stack' },
        h('div', { class: 'panel stack' }, h('h3', { style: 'margin:0' }, t('live_check')), live),
        h('div', { class: 'panel stack' }, h('h3', { style: 'margin:0' }, t('suggestions')), h('p', { class: 'small muted', style: 'margin:0' }, t('tab_completes')), sugg),
      ),
    ),
  );
  updateSugg();
  check();
  return { name, ta };
}

export function newPatternView(root: HTMLElement) {
  root.append(h('h1', null, t('editor_new')));
  const draft = sessionDraft();
  const { name, ta } = form(root, draft, async (data) => {
    const p = store.newPattern({ ...data, source: 'typed' });
    await store.save(p);
    clearDraft();
    location.hash = `#/patron/${p.id}`;
  }, true);
  // Keep an unsent draft per viewer.
  const keep = debounce(() => saveDraft(name.value, ta.value), 400);
  name.addEventListener('input', keep);
  ta.addEventListener('input', keep);
  if (!draft) name.focus();
}

export function editTab(root: HTMLElement, p: Pattern) {
  form(root, p, async (data) => {
    await store.update(p.id, (q) => Object.assign(q, data));
    location.hash = `#/patron/${p.id}/instructions`;
  }, false);
}

function sessionDraft(): Pattern | null {
  try {
    const d = JSON.parse(localStorage.getItem('mc.draft') || 'null');
    if (d && (d.name || d.text)) return store.newPattern({ name: d.name, text: d.text });
  } catch {
    /* ignore */
  }
  return null;
}
function saveDraft(name: string, text: string) {
  try {
    localStorage.setItem('mc.draft', JSON.stringify({ name, text }));
  } catch {
    /* ignore */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem('mc.draft');
  } catch {
    /* ignore */
  }
}

