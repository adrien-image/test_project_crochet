// Colour words in seven languages → hex, and colour mentions in pattern text.

const NAMES: [string, string][] = [
  // [regex alternatives, hex]
  ['light\\s*pink|rose\\s*(?:clair|p[aâ]le|poudr[ée])|baby\\s*pink|rosa\\s*claro|hellrosa|rosa\\s*chiaro|lichtroze', '#f6c6d3'],
  ['hot\\s*pink|fuchsia|fuschia|magenta|rose\\s*vif', '#d6337a'],
  ['pink|rose|rosa|roze|pinke?', '#ef98b2'],
  ['white|blanc(?:he)?|blanco|branco|wei(?:ß|ss)e?|bianco|wit|snow', '#f7f5f0'],
  ['cream|cr[eè]me|[ée]cru|off[-\\s]?white|ivory|ivoire|crudo|natural|naturel|beige\\s*clair|creme|panna', '#f1e8d2'],
  ['beige|sand|sable|arena|areia|camel|tan', '#d9c3a0'],
  ['black|noir(?:e)?|negro|preto|schwarz(?:e)?|nero|zwart', '#26252b'],
  ['dark\\s*gr[ae]y|gris\\s*fonc[ée]|anthracite|charcoal|dunkelgrau|grigio\\s*scuro|donkergrijs', '#55555c'],
  ['light\\s*gr[ae]y|gris\\s*clair|hellgrau|grigio\\s*chiaro|lichtgrijs|silver|argent', '#c8c8cc'],
  ['gr[ae]y|gris|cinza|grau|grigio|grijs', '#9a9aa0'],
  ['dark\\s*red|bordeaux|burgundy|wine|bordeau', '#7c1f2e'],
  ['red|rouge|rojo|vermelho|rot(?:e)?|rosso|rood', '#d23a35'],
  ['coral|corail|coralle?|koraal', '#f27a68'],
  ['peach|p[eê]che|melocot[oó]n|pfirsich|pesca|perzik|apricot|abricot', '#f8b896'],
  ['mustard|moutarde|mostaza|mostarda|senf|senape|mosterd|ochre|ocre', '#d6a12a'],
  ['gold(?:en)?|dor[ée]e?|dorado|dourado|oro', '#d4ae37'],
  ['yellow|jaune|amarillo|amarelo|gelb(?:e)?|giallo|geel|lemon|citron', '#f5d33d'],
  ['light\\s*blue|bleu\\s*(?:clair|ciel|p[aâ]le|b[ée]b[ée])|sky\\s*blue|baby\\s*blue|celeste|azul\\s*claro|hellblau|azzurro|lichtblauw', '#a9cdea'],
  ['navy|marine|bleu\\s*marine|dark\\s*blue|bleu\\s*fonc[ée]|azul\\s*marino|dunkelblau|blu\\s*scuro|donkerblauw', '#25365e'],
  ['turquoise|teal|aqua|turquesa|t[üu]rkis|turchese|turkoois|canard', '#2fa3a0'],
  ['blue|bleu(?:e)?|azul|blau(?:e)?|blu|blauw', '#3d72c4'],
  ['mint|menthe|vert\\s*d[\'’]eau|menta|minze|munt|sage|sauge', '#a8dcc0'],
  ['dark\\s*green|vert\\s*fonc[ée]|forest|sapin|bottle\\s*green|dunkelgr[üu]n|verde\\s*scuro|donkergroen', '#2b5d3a'],
  ['light\\s*green|vert\\s*clair|lime|anis|pistache|pistachio|hellgr[üu]n|lichtgroen', '#a7d37a'],
  ['green|vert(?:e)?|verde|gr[üu]n(?:e)?|groen|olive|kaki|khaki', '#4f9a52'],
  ['orange|naranja|laranja|arancione|oranje|rust|rouille', '#ef8a2e'],
  ['dark\\s*brown|chocolat|chocolate|brun\\s*fonc[ée]|marron\\s*fonc[ée]|dunkelbraun|marrone\\s*scuro', '#4e3324'],
  ['light\\s*brown|caramel|noisette|hazel|cognac|toffee', '#a8744a'],
  ['brown|marron|brun(?:e)?|marr[oó]n|castanho|caf[ée]|braun(?:e)?|marrone|bruin|taupe', '#7a5236'],
  ['lilac|lilas|lila|lavender|lavande|lavanda|lavendel|mauve|parme', '#c4a7dc'],
  ['purple|violet(?:te)?|morado|roxo|violett|viola|paars|plum|prune', '#7d4f9e'],
];

const COMPILED = NAMES.map(([src, hex]) => ({
  // The character before the word is group 1 (no lookbehind for older Safari).
  re: new RegExp(`(^|[^\\p{L}])(${src})(?![\\p{L}])`, 'iu'),
  hex,
}));

/** Hex for a colour named in free text, or undefined. */
export function colorHex(name: string): string | undefined {
  const s = name.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  for (const c of COMPILED) if (c.re.test(s)) return c.hex;
  return undefined;
}

/** First colour word in the text, with its exact spelling. */
export function findColorWord(text: string): { word: string; hex: string; index: number } | undefined {
  let best: { word: string; hex: string; index: number } | undefined;
  for (const c of COMPILED) {
    const m = text.match(c.re);
    if (m && m.index !== undefined && (!best || m.index + m[1].length < best.index)) best = { word: m[2], hex: c.hex, index: m.index + m[1].length };
  }
  return best;
}

export const COLOR_WORDS_RE = new RegExp(NAMES.map(([s]) => `(?:${s})`).join('|'), 'iu');

/** Deterministic pleasant colour for an unnamed key (e.g. "#8008"). */
export function hashColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return hslToHex(hue, 45, 65);
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount))),
  );
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
