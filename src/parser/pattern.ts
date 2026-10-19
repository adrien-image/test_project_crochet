// Reads a whole pattern: finds round labels, pieces, colours, sizes, hook and
// placement hints, and parses every round with parseInstructions.

import type { ColorLegendEntry, Lang, ParseResult, Piece, PositionHint, Round, StitchOp } from '../core/types';
import { colorHex, findColorWord, hashColor } from './colors';
import { canonicalize, extractStated, parseInstructions, stitchHeight, tokenize } from './instructions';
import { detectLang } from './lexicon';

// ---------- Multi-size ----------

/** Picks one size in "6 (8, 10) sc" and "(18, 24, 30)". Returns the text and the number of sizes. */
export function selectSize(text: string, index: number): { text: string; sizes: number } {
  let sizes = 1;
  const pick = (nums: string[]) => {
    sizes = Math.max(sizes, nums.length);
    return nums[Math.min(index, nums.length - 1)];
  };
  let out = text.replace(/(\d+)\s*\(\s*(\d+(?:\s*[,/;]\s*\d+)+)\s*\)/g, (_m, a: string, rest: string) =>
    pick([a, ...rest.split(/\s*[,/;]\s*/)]),
  );
  out = out.replace(/(?<!\d\s?)\(\s*(\d+(?:\s*[,/;]\s*\d+)+)\s*\)/gu, (_m, rest: string) => `(${pick(rest.split(/\s*[,/;]\s*/))})`);
  return { text: out, sizes };
}

// ---------- Round labels ----------

const PREFIX =
  '(?:rounds?|rnds?|rds?|rows?|rangs?|rgs?|tours?|vueltas?|vtas?|filas?|carreiras?|voltas?|runden?|reihen?|giri|giro|ferri|toeren|toer|rondes?|rijen|rij|r|t|v|g|c|cv|h)';
const ROWISH = /^(?:rows?|reihen?|filas?|carreiras?|rijen|rij|ferri|h)$/i;
const CONN = '(?:-|–|—|to|à|a|au|bis|al|tot|t/m|até|e|y|&|and|et|und|en|,|/|\\+)';
const ORD = '(?:st|nd|rd|th|e|ème|eme|er|re|ère|º|°|ª)';
const ROUNDWORD =
  '(?:rnds?|rounds?|rows?|rangs?|tours?|rg|vueltas?|carreiras?|voltas?|runden?|reihen?|giri|giro|toeren|toer|rondes?|ronde|rijen|rij)';

const LABEL_RE = new RegExp(
  `^\\s*(?:[-•*·]\\s*)?(${PREFIX})\\.?\\s*(\\d+)((?:\\s*${CONN}\\s*(?:${PREFIX}\\.?\\s*)?\\d+)*)\\s*(?:\\(\\s*\\d+\\s*(?:rnds?|rounds?|rows?|rangs?|tours?|fois|times|x)\\s*\\)\\s*)?(?:[:.)\\-–—]|\\s|$)\\s*(.*)$`,
  'iu',
);
const ORDINAL_RE = new RegExp(
  `^\\s*(\\d+)\\s*${ORD}?\\s*(?:${CONN}\\s*(\\d+)\\s*${ORD}?\\s*)?(${ROUNDWORD})\\.?\\s*(?:[:.\\-–—]\\s*)?(.*)$`,
  'iu',
);
const BARE_RE = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:[.)]|\s[-–—]|:)\s+(.*)$/u;

export interface Label {
  numbers: number[];
  label: string;
  rest: string;
  rowish: boolean;
  bare: boolean;
}

function expandNumbers(first: number, tail: string): number[] {
  const nums = [first];
  const re = new RegExp(`\\s*(${CONN})\\s*(?:${PREFIX}\\.?\\s*)?(\\d+)`, 'giu');
  for (const m of tail.matchAll(re)) {
    const n = Number(m[2]);
    const conn = m[1].toLowerCase();
    const last = nums[nums.length - 1];
    if (['-', '–', '—', 'to', 'à', 'a', 'au', 'bis', 'al', 'tot', 't/m', 'até'].includes(conn) && n > last && n - last < 200) {
      for (let i = last + 1; i <= n; i++) nums.push(i);
    } else nums.push(n);
  }
  return nums;
}

export function matchLabel(line: string): Label | null {
  let m = line.match(LABEL_RE);
  if (m) {
    const prefix = m[1];
    // A single-letter prefix must touch its number ("R1", "T3"), to avoid prose like "a 5 mm hook".
    if (prefix.length === 1 && !new RegExp(`^\\s*(?:[-•*·]\\s*)?${prefix}\\.?\\d`, 'iu').test(line)) m = null;
    else if (prefix.length === 1 && /^[a-z]$/.test(prefix) && prefix !== 'r' && !/^\s*[a-z]\d+\s*[:.)\-–—]/iu.test(line)) m = null;
  }
  if (m) {
    const start = Number(m[2]);
    return {
      numbers: expandNumbers(start, m[3] || ''),
      label: line.slice(0, line.length - m[4].length).trim().replace(/[:.\-–—]\s*$/, '').trim(),
      rest: m[4].trim(),
      rowish: ROWISH.test(m[1]),
      bare: false,
    };
  }
  const o = line.match(ORDINAL_RE);
  if (o) {
    const a = Number(o[1]);
    const b = o[2] ? Number(o[2]) : a;
    const nums: number[] = [];
    for (let i = a; i <= Math.max(a, b) && i - a < 200; i++) nums.push(i);
    return {
      numbers: nums,
      label: line.slice(0, line.length - o[4].length).trim().replace(/[:.\-–—]\s*$/, ''),
      rest: o[4].trim(),
      rowish: /^(?:rows?|reihen?|rij)/i.test(o[3]),
      bare: false,
    };
  }
  const b = line.match(BARE_RE);
  if (b) {
    const a = Number(b[1]);
    const c = b[2] ? Number(b[2]) : a;
    if (a > 300) return null;
    const nums: number[] = [];
    for (let i = a; i <= Math.max(a, c) && i - a < 200; i++) nums.push(i);
    return { numbers: nums, label: line.slice(0, line.length - b[3].length).trim().replace(/[:.\-–—)]\s*$/, ''), rest: b[3].trim(), rowish: false, bare: true };
  }
  return null;
}

// ---------- Pieces ----------

const COPIES_RE =
  /(?:make|faire|fais|crocheter|r[ée]aliser|haz|hacer|tejer|fa[cç]a|fazer|h[äa]kle|fare|maak|haak)\s*(\d+)|[(\[]\s*(?:x\s*)?(\d+)\s*(?:x|fois|times|pcs|pieces|pi[eè]ces|st[üu]ck|piezas|pe[cç]as|pezzi|stuks)?\s*[)\]]|(?<![\p{L}])x\s*(\d+)(?![\p{L}\d])|(?<![\p{L}\d])(\d+)\s*x(?![\p{L}])|(?<![\p{L}])[×]\s*(\d+)/iu;
const CONTINUED_RE = /\(?\s*(?:continued|cont\.?|suite|continuaci[oó]n|continua[cç][aã]o|fortsetzung|continua|vervolg)\s*\)?/iu;
const PLURAL_PAIRS =
  /\b(?:ears|arms|legs|feet|eyes|wings|antennae|antennas|horns|paws|cheeks|oreilles|jambes|pieds|pattes|yeux|ailes|antennes|cornes|joues|orejas|brazos|piernas|patas|ojos|alas|orelhas|bra[cç]os|pernas|olhos|asas|ohren|arme|beine|f[üu][sß]e|augen|fl[üu]gel|orecchie|braccia|gambe|occhi|ali|oren|armen|benen|voeten|ogen|vleugels)\b/iu;

export function cleanTitle(raw: string): { name: string; copies?: number; continued: boolean; color?: string } {
  let s = raw.trim().replace(/[:：]\s*$/, '').trim();
  const continued = CONTINUED_RE.test(s);
  s = s.replace(CONTINUED_RE, ' ');
  let copies: number | undefined;
  const m = s.match(COPIES_RE);
  if (m) {
    copies = Number(m[1] || m[2] || m[3] || m[4] || m[5]);
    s = s.replace(m[0], ' ');
  }
  let color: string | undefined;
  // "LOBES — with A", "Tête en rose": the colour isn't part of the name.
  const tail = s.match(/\s*[-–—,:]?\s*\b(?:with|in|using|en|avec|con|com|em|mit|met)\s+(?:colou?r\s+|couleur\s+|la\s+couleur\s+)?([A-F]|MC|CC\d?|\p{L}+(?:\s+(?:clair|fonc[ée]|light|dark))?)\s*$/u);
  if (tail && tail.index && (/^(?:[A-F]|MC|CC\d?)$/.test(tail[1]) || colorHex(tail[1]))) {
    color = tail[1];
    s = s.slice(0, tail.index);
  }
  const paren = s.match(/\(([^)]*)\)/);
  if (paren && colorHex(paren[1])) {
    color = paren[1].trim();
    s = s.replace(paren[0], ' ');
  }
  s = s.replace(/[()[\]]/g, ' ').replace(/[-–—:,]\s*$/, '').replace(/\s+/g, ' ').trim();
  if (s.length > 2 && s === s.toUpperCase() && /\p{L}/u.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase();
  if (copies === undefined && PLURAL_PAIRS.test(s)) copies = 2;
  return { name: s, copies, continued, color };
}

function looksLikeAllCapsTitle(line: string): boolean {
  const s = line.replace(/\([^)]*\)/g, '').trim();
  if (s.length < 3 || s.length > 60) return false;
  const letters = s.match(/\p{L}/gu) || [];
  if (letters.length < 3) return false;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper / letters.length >= 0.85;
}

function looksLikeMixedTitle(line: string): boolean {
  const s = line.trim();
  if (s.length < 2 || s.length > 50) return false;
  if (/[.!?]$/.test(s) && !/\b(?:cont|etc)\.$/i.test(s)) return false;
  if (/\d{2,}/.test(s.replace(COPIES_RE, ''))) return false;
  const words = s.split(/\s+/);
  return words.length <= 6;
}

const NON_PIECE_TITLES =
  /^(?:materials?|mat[ée]riel|mat[ée]riaux|fournitures|materiales|materiais|material|materiale|materiaal|abbreviations?|abr[ée]viations?|abreviaturas|abk[üu]rzungen|abbreviazioni|afkortingen|notes?|remarques?|notas|hinweise|note|opmerkingen|assembly|assemblage|montage|montaje|montagem|zusammennähen|assemblaggio|in\s+elkaar\s+zetten|finishing|finitions?|gauge|[ée]chantillon|size|taille|tools?|outils|yarn|fils?|hook|crochet|legend|l[ée]gende|stitches|points\s+utilis[ée]s|instructions|pattern|patron|introduction)\b/iu;

// ---------- Colours ----------

const COLOR_KEY_WORD = '(?:colou?r|couleur|coloris|cor|farbe|colore|kleur|col\\.)';

function parseLegendLine(line: string): ColorLegendEntry | null {
  const s = line.replace(/^\s*[-•*·]\s*/, '');
  let m = s.match(new RegExp(`^${COLOR_KEY_WORD}\\s*([A-Z0-9]{1,2}|#\\s*\\d+)\\s*[:=\\-–(]\\s*(.+)$`, 'iu'));
  let key: string | undefined;
  let rest: string | undefined;
  if (m) {
    key = m[1].replace(/\s/g, '').toUpperCase();
    rest = m[2];
  } else if ((m = s.match(/^(MC|CC\d?|main\s+colou?r|contrast(?:ing)?\s+colou?r(?:\s*\d)?)\s*[:=\-–(]\s*(.+)$/iu))) {
    key = /^main/i.test(m[1]) ? 'MC' : /^contrast/i.test(m[1]) ? 'CC' : m[1].toUpperCase();
    rest = m[2];
  } else if ((m = s.match(/^([A-F])\s*[:=]\s*(.+)$/u)) && findColorWord(m[2])) {
    key = m[1];
    rest = m[2];
  }
  if (!key || !rest) return null;
  const cw = findColorWord(rest);
  const name = cw ? cw.word : rest.replace(/[()].*$/, '').trim().slice(0, 30);
  return { key, name, hex: cw?.hex ?? colorHex(rest) ?? hashColor(key + name) };
}

interface ColorRef {
  name: string;
  hex: string;
  index: number;
  change: boolean;
}

function findColorRef(raw: string, legend: ColorLegendEntry[], fullText: string): ColorRef | undefined {
  // Keys are upper-case ("with C"), the words before them may not be ("With C").
  const text = raw.replace(/(?<![\p{L}])(With|In|Using|Use|En|Avec|Con|Com|Em|Mit|Met|To|Pour|Para|Zu|Naar)(?![\p{L}])/gu, (w) => w.toLowerCase());
  const change = /\b(?:change|switch|changer|changez|passer|cambiar|cambia|trocar|troque|wechseln|wechsle|cambiare|wissel|fasten off|join|attach|use|utiliser|prendre|continue[rz]?|continuer)\b/iu.test(text);
  const keyRe = new RegExp(
    `(?:${COLOR_KEY_WORD}\\s*(#?\\s*[A-Z0-9]{1,5})(?![\\p{L}\\d])|(?<![\\p{L}])(?:with|in|using|use|en|avec|con|com|em|mit|met|to|à|au|pour|a|para|zu|naar)\\s+(MC|CC\\d?|[A-F])(?![\\p{L}\\d]))`,
    'u',
  );
  const km = text.match(keyRe);
  if (km && km.index !== undefined) {
    const key = (km[1] || km[2]).replace(/\s/g, '').toUpperCase();
    const entry = legend.find((e) => e.key.toUpperCase() === key || e.key.toUpperCase() === key.replace('#', ''));
    if (entry) return { name: entry.name, hex: entry.hex, index: km.index, change };
    const code = key.replace('#', '');
    if (/^\d{2,5}$/.test(code)) {
      // "Use color #8008": find the colour named next to that code elsewhere in the pattern.
      const near = fullText.split('\n').find((l) => l.includes(code) && findColorWord(l) && !l.includes(km[0]));
      const cw = near ? findColorWord(near) : undefined;
      return { name: cw ? cw.word : `#${code}`, hex: cw?.hex ?? hashColor(code), index: km.index, change };
    }
  }
  const cw = findColorWord(text);
  if (cw) return { name: cw.word, hex: cw.hex, index: cw.index, change };
  return undefined;
}

// ---------- Misc extraction ----------

export function findHook(text: string): number | undefined {
  const res = [
    /(?:hook|crochet|ganchillo|agulha|h[äa]kelnadel|nadel|uncinetto|haaknaald|aiguille)[^\n\d]{0,40}?(\d+(?:[.,]\d+)?)\s*mm/iu,
    /(\d+(?:[.,]\d+)?)\s*mm\s*(?:\(?[A-Z]?[-/]?\d*\)?\s*)?(?:hook|crochet|ganchillo|agulha|h[äa]kelnadel|uncinetto|haaknaald)/iu,
  ];
  for (const re of res) {
    const m = text.match(re);
    if (m) {
      const v = Number(m[1].replace(',', '.'));
      if (v >= 0.5 && v <= 25) return v;
    }
  }
  return undefined;
}

export function findStatedSize(text: string): number | undefined {
  const m = text.match(
    /(?:finished\s+size|size|measures?|mesure|taille\s+finale|taille|dimensions?|hauteur|height|tall|tama[nñ]o|medida|tamanho|gr[öo][sß]e|misura|dimensione|grootte|maat|environ|about|approx(?:imately)?\.?|ca\.)[^\n\d]{0,30}?(\d+(?:[.,]\d+)?)\s*(cm|mm|in(?:ches)?|")/iu,
  ) || text.match(/(\d+(?:[.,]\d+)?)\s*(cm|in(?:ches)?|")\s*(?:tall|high|de\s+haut|hoch|alto|alta|hoog|long|wide)/iu);
  if (!m) return undefined;
  const v = Number(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  const cm = unit === 'mm' ? v / 10 : unit === 'cm' ? v : v * 2.54;
  return cm > 1 && cm < 300 ? cm : undefined;
}

const MATERIALS: [RegExp, string][] = [
  [/\b(?:cotton|coton|algod[oó]n|algod[aã]o|baumwolle|cotone|katoen)\b/iu, 'cotton'],
  [/\b(?:wool|laine|lana|l[ãa]|wolle|wol|merino|m[ée]rinos)\b/iu, 'wool'],
  [/\b(?:chenille|velvet|velours|terciopelo|veludo|samt|velluto|fluweel)\b/iu, 'chenille'],
  [/\b(?:acrylic|acrylique|acr[ií]lico|acryl|acrilico)\b/iu, 'acrylic'],
  [/\b(?:mohair)\b/iu, 'mohair'],
  [/\b(?:bamboo|bambou|bamb[uú]|bambus)\b/iu, 'bamboo'],
  [/\b(?:linen|lin|lino|linho|leinen|linnen)\b/iu, 'linen'],
  [/\b(?:alpaca|alpaga)\b/iu, 'alpaca'],
];

export function findMaterials(text: string): string[] {
  return MATERIALS.filter(([re]) => re.test(text)).map(([, n]) => n);
}

function findSafetyEyes(text: string): number | undefined {
  const m =
    text.match(/(\d+(?:[.,]\d+)?)\s*mm\s*(?:\w+\s+)?(?:safety\s+eyes|yeux\s+(?:de\s+s[ée]curit[ée]|s[ée]curit[ée])|ojos\s+de\s+seguridad|olhos\s+de\s+seguran[cç]a|sicherheitsaugen|occhi(?:\s+di)?\s+sicurezza|veiligheidsoogjes)/iu) ||
    text.match(/(?:safety\s+eyes|yeux\s+de\s+s[ée]curit[ée]|ojos\s+de\s+seguridad|olhos\s+de\s+seguran[cç]a|sicherheitsaugen|occhi\s+di\s+sicurezza|veiligheidsoogjes)[^\n\d]{0,20}(\d+(?:[.,]\d+)?)\s*mm/iu);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

const PART_WORDS =
  '(?:eyes?|yeux|œil|oeil|ojos?|olhos?|augen?|occhi|occhio|ogen|oog|ears?|oreilles?|orejas?|orelhas?|ohren?|orecchie|oren|arms?|bras|brazos?|bra[cç]os?|arme|braccia|armen|legs?|jambes?|pieds?|piernas?|pernas?|beine|gambe|benen|tail|queue|cola|rabo|schwanz|coda|staart|snout|museau|hocico|focinho|schnauze|muso|snuit|nose|nez|nariz|nase|naso|neus|wings?|ailes?|alas|asas|fl[üu]gel|ali|vleugels|horns?|cornes?|antennae?|antennes?|spikes?|pics?|cheeks?|joues)';

export function findPositions(text: string): PositionHint[] {
  const hints: PositionHint[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const between = new RegExp(
    `(?:between|entre|zwischen|tra|fra|tussen)\\s+(?:the\\s+|les\\s+|las\\s+|os\\s+|den\\s+|i\\s+|de\\s+)?(?:${ROUNDWORD}|r)?\\.?\\s*(\\d+)\\s*(?:and|et|y|e|und|en|&|-|–|à)\\s*(?:${ROUNDWORD}|r)?\\.?\\s*(\\d+)`,
    'iu',
  );
  const at = new RegExp(`(?:at|on|in|au|sur|en|na|no|in|auf|op|al|nel)\\s+(?:the\\s+|le\\s+)?(?:${ROUNDWORD}|r)\\.?\\s*(\\d+)`, 'iu');
  const apart = /(\d+)\s*(?:sts?|stitches|mailles?|m|puntos|pontos|maschen|maglie|steken|pts)\s*(?:apart|d['’]écart|d['’]intervalle|de\s+distancia|de\s+dist[âa]ncia|abstand|di\s+distanza|uit\s+elkaar|between\s+them|entre\s+(?:eux|les\s+deux))/iu;
  const partRe = new RegExp(PART_WORDS, 'iu');
  for (const s of sentences) {
    const part = s.match(partRe);
    if (!part) continue;
    const b = s.match(between);
    const a = b ? null : s.match(at);
    if (!b && !a) continue;
    const r1 = Number(b ? b[1] : a![1]);
    const r2 = Number(b ? b[2] : a![1]);
    const ap = s.match(apart);
    hints.push({ what: part[0].toLowerCase(), rounds: [Math.min(r1, r2), Math.max(r1, r2)], apart: ap ? Number(ap[1]) : undefined });
  }
  return hints;
}

// ---------- Main ----------

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'piece'
  );
}

const REF_RE = new RegExp(
  `^(?:(?:work\\s+)?(?:same\\s+)?as|rep(?:eat)?\\.?|like|comme(?:\\s+(?:le|au|pour\\s+le))?|r[ée]p[ée]ter(?:\\s+le)?|r[ée]p\\.?(?:\\s+le)?|igual\\s+(?:que\\s+)?(?:la|el)?|como\\s+(?:la|a|o|el)?|repetir\\s+(?:la|a|o|el)?|wie|wdh\\.?|come\\s+(?:il|la)?|ripetere\\s+(?:il|la)?|als|herhaal)\\s*(?:the\\s+|le\\s+|la\\s+)?(?:(\\d+)\\s*${ORD}?\\s*${ROUNDWORD}|(?:${PREFIX})\\.?\\s*(\\d+))\\.?\\s*`,
  'iu',
);

function avgHeight(ops: StitchOp[]): number {
  const made = ops.filter((o) => o.produces > 0 && o.kind !== 'ch');
  if (!made.length) return 1;
  return made.reduce((a, o) => a + stitchHeight(o), 0) / made.length;
}

export interface ParseOptions {
  lang?: Lang | 'auto';
  sizeIndex?: number;
  partLabel?: string;
}

export function parsePattern(rawText: string, opts: ParseOptions = {}): ParseResult {
  const { text, sizes } = selectSize(rawText.replace(/\r\n?/g, '\n'), opts.sizeIndex ?? 0);
  const lang: Lang = opts.lang && opts.lang !== 'auto' ? opts.lang : detectLang(text);
  const lines = text.split('\n');
  const partLabel = opts.partLabel ?? (lang === 'fr' ? 'Pièce' : 'Part');

  const legend: ColorLegendEntry[] = [];
  for (const l of lines) {
    const e = parseLegendLine(l);
    if (e && !legend.some((x) => x.key === e.key)) legend.push(e);
    // "Yarn: chenille, colour A: red."
    for (const m of l.matchAll(new RegExp(`${COLOR_KEY_WORD}\\s+([A-F]|MC|CC\\d?)\\s*[:=]\\s*([^,.;()]+)`, 'giu'))) {
      const cw = findColorWord(m[2]);
      if (cw && !legend.some((x) => x.key === m[1].toUpperCase())) legend.push({ key: m[1].toUpperCase(), name: cw.word, hex: cw.hex });
    }
  }

  const pieces: Piece[] = [];
  const byLine = new Map<number, Round[]>();
  let current: Piece | null = null;
  let pendingTitle: { name: string; copies?: number; continued: boolean; color?: string; line: number } | null = null;
  let lastTitleLine = -10;
  let currentColor: { name: string; hex: string } | undefined;
  let nextColor: { name: string; hex: string } | undefined;
  let foundation: number | undefined;
  const instructionsByKey = new Map<string, string>();

  const startPiece = (name: string, copies: number | undefined, line: number, continued: boolean, color?: string) => {
    const existing = pieces.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing && (continued || existing.rounds.length)) {
      current = existing;
      if (copies && copies > existing.copies) existing.copies = copies;
      return;
    }
    const p: Piece = { name, copies: copies ?? 1, flat: false, line, rounds: [], colorGuessed: true, colors: [] };
    if (color) {
      // A legend key ("with A") or a colour word ("en rose").
      const entry = legend.find((e) => e.key === color.toUpperCase());
      p.colorName = entry?.name ?? color;
      p.color = entry?.hex ?? colorHex(color);
      p.colorGuessed = !p.color;
    }
    pieces.push(p);
    current = p;
    currentColor = p.color ? { name: p.colorName!, hex: p.color } : undefined;
    nextColor = undefined;
    foundation = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const label = matchLabel(trimmed);
    let accepted = false;
    if (label) {
      const st = extractStated(label.rest);
      const probe = parseInstructions(stripColorRefs(st.rest, legend), lang, { prev: 6, firstOfPiece: false, last: false });
      accepted = !label.bare || probe.hasStitches || (st.stated !== undefined && st.rest === '');
      if (label.bare && accepted && !current && !pendingTitle && probe.unknown.length > 3) accepted = false;
    }
    if (!label || !accepted) {
      // Titles, colour changes, foundation chains.
      const isTitle =
        (looksLikeAllCapsTitle(trimmed) && !parseLegendLine(trimmed)) ||
        (/^[^:]{2,40}:$/.test(trimmed) && !parseLegendLine(trimmed) && looksLikeMixedTitle(trimmed));
      if (isTitle && !NON_PIECE_TITLES.test(trimmed.replace(/^[-•*\s]+/, ''))) {
        pendingTitle = { ...cleanTitle(trimmed), line: i };
        lastTitleLine = i;
        continue;
      }
      if (isTitle) {
        pendingTitle = null;
        current = null;
        continue;
      }
      if (looksLikeMixedTitle(trimmed) && (nextLabelIsFirst(lines, i) || (CONTINUED_RE.test(trimmed) && /\(/.test(trimmed)))) {
        pendingTitle = { ...cleanTitle(trimmed), line: i };
        lastTitleLine = i;
        continue;
      }
      if (parseLegendLine(trimmed)) continue;
      const toks = tokenize(canonicalize(trimmed, lang));
      const chainOnly = toks.filter((t) => t.t !== 'p' && !(t.t === 'w' && /^(?:foundation|base|monter|faire|make|chain|une|a|de|d)$/i.test(t.v)));
      if (chainOnly.length === 2 && chainOnly.some((t) => t.t === 'k' && t.v === 'ch') && chainOnly.some((t) => t.t === 'num')) {
        foundation = (chainOnly.find((t) => t.t === 'num') as { v: number }).v;
        continue;
      }
      if (current || pendingTitle) {
        const ref = findColorRef(trimmed, legend, text);
        if (ref && trimmed.length < 140) {
          currentColor = { name: ref.name, hex: ref.hex };
          if (pendingTitle && !pendingTitle.color) pendingTitle.color = ref.name;
        }
      }
      continue;
    }
    const lab = label!;

    // Start a new piece on a title, or when numbering restarts.
    const firstNum = lab.numbers[0];
    if (pendingTitle && i - lastTitleLine < 12) {
      startPiece(pendingTitle.name, pendingTitle.copies, pendingTitle.line, pendingTitle.continued, pendingTitle.color);
      pendingTitle = null;
    } else {
      const cur = current as Piece | null;
      const lastNum = cur?.rounds[cur.rounds.length - 1]?.number;
      if (!cur || (lastNum !== undefined && firstNum <= lastNum)) {
        startPiece(`${partLabel} ${pieces.length + 1}`, undefined, i, false);
      }
    }
    const piece = current as unknown as Piece;
    if (lab.rowish) piece.flat = true;

    let rest = lab.rest;
    const roundColor = findColorRef(rest, legend, text);
    if (nextColor) {
      currentColor = nextColor;
      nextColor = undefined;
    }
    if (roundColor) {
      const pos = roundColor.index / Math.max(1, rest.length);
      if (roundColor.change && pos > 0.4) nextColor = { name: roundColor.name, hex: roundColor.hex };
      else currentColor = { name: roundColor.name, hex: roundColor.hex };
    }
    if (/\b(?:turn|tourner|tournez|girar|gire|wenden|girare|keren|draai)\b/iu.test(rest)) piece.flat = true;

    const st = extractStated(rest);
    rest = st.rest;
    let refText: string | undefined;
    const ref = rest.match(REF_RE);
    if (ref) {
      const n = Number(ref[1] || ref[2]);
      refText = instructionsByKey.get(`${slug(piece.name)}:${n}`);
      if (refText !== undefined) rest = refText + ' ' + rest.slice(ref[0].length);
    }
    const clean = stripColorRefs(rest, legend);

    for (const num of lab.numbers) {
      const prevRound = piece.rounds[piece.rounds.length - 1];
      const prev = prevRound ? (prevRound.count ?? prevRound.stated) : foundation;
      const res = parseInstructions(clean, lang, {
        prev,
        stated: st.stated,
        firstOfPiece: !prevRound,
        last: false,
      });
      let count = res.count;
      let inferred = false;
      if (count === undefined && st.stated !== undefined) {
        count = st.stated;
        inferred = !res.hasStitches;
      }
      const statedCmp = st.stated !== undefined && st.picots ? (res.count ?? 0) + res.picots : res.count;
      const mismatch = st.stated !== undefined && res.count !== undefined && statedCmp !== st.stated;
      const consumeMismatch =
        prev !== undefined &&
        res.resolved &&
        res.hasStitches &&
        !res.space &&
        !res.otherside &&
        !res.ops.some((o) => o.kind === 'mr') &&
        res.consumed !== prev &&
        !(piece.flat && res.consumed < prev);
      const key = `${slug(piece.name)}:${num}`;
      instructionsByKey.set(key, rest);
      const round: Round = {
        key,
        number: num,
        index: piece.rounds.length,
        line: i,
        label: lab.label,
        instructions: lab.rest,
        ops: res.ops,
        count,
        stated: st.stated,
        mismatch,
        consumeMismatch: !!consumeMismatch,
        consumed: res.consumed,
        inferred,
        color: currentColor?.hex,
        colorName: currentColor?.name,
        loop: res.loop ?? (res.ops.length && res.ops.every((o) => o.loop === 'blo') ? 'blo' : res.ops.length && res.ops.every((o) => o.loop === 'flo') ? 'flo' : undefined),
        height: avgHeight(res.ops),
        rows: piece.flat || lab.rowish,
        unknown: res.unknown,
      };
      piece.rounds.push(round);
      if (!byLine.has(i)) byLine.set(i, []);
      byLine.get(i)!.push(round);
    }
  }

  // Piece colours: stated in the piece, else guessed.
  const main = legend[0] ?? undefined;
  for (const p of pieces) {
    p.rounds = p.rounds.filter(Boolean);
    const named = p.rounds.map((r) => r.color).filter((c): c is string => !!c);
    const distinct = [...new Set(named)];
    p.colors = distinct;
    if (!p.color && p.rounds[0]?.color) {
      p.color = p.rounds[0].color;
      p.colorName = p.rounds[0].colorName;
      p.colorGuessed = false;
    }
    if (!p.color) {
      p.colorGuessed = true;
      if (/\b(?:eyes?|yeux|œil|ojos?|olhos?|augen|occhi|ogen|pupil|nose|nez|nariz|nase|naso|neus)\b/iu.test(p.name)) {
        p.color = '#26252b';
        p.colorName = lang === 'fr' ? 'noir' : 'black';
      } else if (main) {
        p.color = main.hex;
        p.colorName = main.name;
      }
    } else if (!p.colorGuessed) {
      // Rounds before the first named colour use the piece colour.
      for (const r of p.rounds) {
        if (!r.color) {
          r.color = p.color;
          r.colorName = p.colorName;
        }
      }
    }
  }

  return {
    lang,
    pieces: pieces.filter((p) => p.rounds.length),
    legend,
    byLine,
    sizes,
    hookMm: findHook(text),
    statedSizeCm: findStatedSize(text),
    materials: findMaterials(text),
    safetyEyesMm: findSafetyEyes(text),
    positions: findPositions(text),
  };
}

/** True when the next labelled line within 3 lines is a round 1 (a mixed-case title sits right above it). */
function nextLabelIsFirst(lines: string[], i: number): boolean {
  for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    const l = matchLabel(t);
    if (l) return l.numbers[0] === 1 && !l.bare;
    if (/^(?:ch|ml|cad|corr|lm|cat|l)\s*\d+/i.test(t)) continue;
    if (t.length > 80) return false;
  }
  return false;
}

function stripColorRefs(text: string, legend: ColorLegendEntry[]): string {
  let s = text.replace(new RegExp(`${COLOR_KEY_WORD}\\s*#?\\s*[A-Z0-9]{1,5}(?![\\p{L}\\d])`, 'giu'), ' ');
  if (legend.length) {
    const keys = legend.map((e) => e.key.replace(/[^A-Z0-9]/gi, '')).filter(Boolean).join('|');
    if (keys) s = s.replace(new RegExp(`(?<![\\p{L}])(?:with|in|using|en|avec|con|com|em|mit|met|to|à|au|pour|para|zu|naar)\\s+(?:${keys})(?![\\p{L}\\d])`, 'gu'), ' ');
  }
  s = s.replace(/\b(?:change|switch)\s+to\b/giu, ' ');
  return s;
}

/** Count used for drawing: computed, stated, else the previous one. */
export function effectiveCount(r: Round, prev?: number): number {
  return r.count ?? r.stated ?? prev ?? 6;
}

export function allRounds(res: ParseResult): Round[] {
  return res.pieces.flatMap((p) => p.rounds);
}
