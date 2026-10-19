// Tiny DOM helpers. No innerHTML with user content anywhere: text goes through
// textContent so pattern text can't inject markup.

type Child = Node | string | number | false | null | undefined | Child[];
type Attrs = Record<string, unknown> & { class?: string; style?: string; dataset?: Record<string, string> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) applyAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, unknown> | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  append(el, children);
  return el;
}

function applyAttrs(el: HTMLElement, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function append(el: Node, children: Child[]) {
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}

// ---- Toasts ----

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

export function toast(message: string, action?: { label: string; run: () => void }, ms = 6000) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  clear(toastEl);
  toastEl.append(h('span', null, message));
  if (action) {
    toastEl.append(
      h('button', {
        class: 'btn btn-small',
        onclick: () => {
          hideToast();
          action.run();
        },
      }, action.label),
    );
  }
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, ms);
}

export function hideToast() {
  toastEl?.classList.remove('show');
}

// ---- Dialogs ----

export function dialog(title: string, body: Child, opts: { wide?: boolean; onClose?: () => void; actions?: Child } = {}): { el: HTMLDialogElement; close: () => void } {
  const el = h('dialog', { class: 'dialog' + (opts.wide ? ' wide' : ''), 'aria-label': title });
  const close = () => {
    el.close();
    el.remove();
    opts.onClose?.();
  };
  append(el, [
    h('header', { class: 'dialog-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': '×', title: '×', onclick: close }, '×')),
    h('div', { class: 'dialog-body' }, body),
    opts.actions ? h('footer', { class: 'dialog-actions' }, opts.actions) : null,
  ]);
  el.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  el.addEventListener('click', (e) => {
    if (e.target === el) close();
  });
  document.body.append(el);
  el.showModal();
  return { el, close };
}

export function confirmDialog(title: string, message: string, ok: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const d = dialog(title, h('p', null, message), {
      onClose: () => resolve(result),
      actions: [
        h('button', { class: 'btn', onclick: () => d.close() }, cancel),
        h('button', {
          class: 'btn btn-primary',
          onclick: () => {
            result = true;
            d.close();
          },
        }, ok),
      ],
    });
  });
}

export function download(blob: Blob, name: string) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: number | undefined;
  return (...a: A) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')}`;
  const s2 = Math.floor(sec % 60);
  return m ? `${m} min ${String(s2).padStart(2, '0')}` : `${s2} s`;
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
