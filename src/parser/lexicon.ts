// Vocabulary for the pattern parser. Instruction text is first rewritten into
// canonical tokens (written "§sc", "§inc", "§each"…) by these rules, then parsed
// by a single grammar in instructions.ts, whatever the source language.

import type { Lang } from '../core/types';

type Rule = [RegExp, string];

const L = '\\p{L}';
/**
 * Whole-word regex that works with accented letters. The character before the
 * word is captured as $1 (no lookbehind: Safari before 16.4 can't parse it).
 */
export function word(src: string, flags = 'giu'): RegExp {
  return new RegExp(`(^|[^${L}§])(?:${src})(?![${L}])`, flags);
}
const r = (src: string, to: string): Rule => [word(src), `$1 ${to} `];

// Applied first, before the language rules: compound English words that
// contain a plain stitch abbreviation ("sc2tog" contains "sc").
const PRE: Rule[] = [
  r('(?:working\\s+)?(?:on|along|in)\\s+(?:the\\s+)?(?:other|opposite)\\s+side(?:\\s+of\\s+(?:the\\s+)?(?:foundation\\s+)?(?:chain|ch))?|(?:back|other\\s+side)\\s+of\\s+(?:the\\s+)?(?:chain|ch)', '§otherside'),
  r('twice', '2 §times'),
  r('magic\\s*(?:ring|circle|loop)|adjustable\\s*ring|mr', '§mr'),
  r('(?:in\\s+the\\s+|through\\s+the\\s+)?back\\s*loops?(?:\\s*only)?|blo|bl\\s+only', '§blo'),
  r('(?:in\\s+the\\s+|through\\s+the\\s+)?front\\s*loops?(?:\\s*only)?|flo|fl\\s+only', '§flo'),
  r('sc\\s*3\\s*tog|sc3tog', '§dec3'),
  r('dc\\s*2\\s*tog|hdc\\s*2\\s*tog|tr\\s*2\\s*tog', '§dec'),
  r('invisible\\s+decreases?|inv\\.?\\s*dec|invdec|sc\\s*2\\s*tog|sc2tog|decreases?|decs?', '§dec'),
  r('increases?|incs?', '§inc'),
  r('(?:ch(?:ain)?)[-\\s]*(?:sp(?:ace)?s?|loops?)', '§space'),
];

// Rules shared by every language, applied after the language's own rules
// (English words appear in most patterns).
const COMMON: Rule[] = [
  r('single\\s+crochets?', '§sc'),
  r('half\\s+double\\s+crochets?|hdc', '§hdc'),
  r('slip\\s*stitch(?:es)?|sl\\s*sts?|slst|sl', '§sl'),
  r('chains?|chs?', '§ch'),
  r('picots?', '§picot'),
  r('bobbles?|bob', '§bobble'),
  r('puff\\s*(?:stitch(?:es)?)?', '§puff'),
  r('popcorns?|pc', '§popcorn'),
  r('skip(?:ping)?|sk', '§skip'),
  r('stitch(?:es)?|sts?', '§st'),
  r('each\\s+of\\s+(?:the\\s+)?next', '§each §next'),
  r('every|each|all', '§each'),
  r('next|following', '§next'),
  r('around|round\\s+and\\s+round|even', '§around'),
  r('across|to\\s+(?:the\\s+)?end|until\\s+the\\s+end', '§across'),
  r('more\\s+times', '§moretimes'),
  r('times', '§times'),
  r('same', '§same'),
  r('in(?:to)?|on', '§in'),
  r('from\\s+(?:the\\s+)?hook', '§fromhook'),
  r('rep(?:eat)?\\.?(?:\\s+from)?', '§rep'),
  r('counts?\\s+as(?:\\s+(?:a|the|first|1st))*', '§countsas'),
  r('join(?:ing)?|close|to\\s+join', '§join'),
  r('first|1st', '§first'),
  r('turn', '§turn'),
  r('sp(?:ace)?s?|arch(?:es)?', '§space'),
  r('last', '§last'),
  r('fasten\\s+off|fo', '§fo'),
];

const EN_US: Rule[] = [
  r('double\\s+treble(?:\\s+crochets?)?|dtr', '§dtr'),
  r('treble(?:\\s+crochets?)?|triple\\s+crochets?|tr', '§tr'),
  r('double\\s+crochets?|dc', '§dc'),
  r('sc', '§sc'),
];

const EN_UK: Rule[] = [
  r('triple\\s+treble|trtr|ttr', '§dtr'),
  r('double\\s+treble|dtr', '§tr'),
  r('half\\s+treble(?:\\s+crochets?)?|htr', '§hdc'),
  r('treble(?:\\s+crochets?)?|tr', '§dc'),
  r('double\\s+crochets?|dc', '§sc'),
  r('ss', '§sl'),
];

const FR: Rule[] = [
  r('cercle\\s+magique|anneau\\s+magique|cm|am', '§mr'),
  r('brins?\\s+arri[eè]res?|ba|ba\\.', '§blo'),
  r('brins?\\s+avants?|bav', '§flo'),
  r('mailles?\\s+serr[ée]es?|ms', '§sc'),
  r('mailles?\\s+en\\s+l[\'’]air|ml|cha[iî]nettes?', '§ch'),
  r('mailles?\\s+coul[ée]es?|mc|mcoul', '§sl'),
  r('demi[-\\s]brides?|db|dB|demi-b', '§hdc'),
  r('triples?\\s+brides?|tbr|tb', '§dtr'),
  r('doubles?\\s+brides?|dbr|dbb', '§tr'),
  r('brides?|br|b', '§dc'),
  r('augmentations?|augm?s?', '§inc'),
  r('diminutions?(?:\\s+invisibles?)?|dim(?:inutions?)?s?', '§dec'),
  r('mailles?|m|pts?|points?', '§st'),
  r('chaque|toutes?\\s+les|tous\\s+les', '§each'),
  r('suivantes?', '§next'),
  r('tout\\s+(?:le\\s+)?(?:autour|le\\s+tour)|tout\\s+le\\s+tour|sur\\s+tout\\s+le\\s+tour|en\\s+rond|autour', '§around'),
  r('jusqu[\'’]à\\s+la\\s+fin(?:\\s+du\\s+rang)?|jusqu[\'’]au\\s+bout', '§across'),
  r('fois\\s+de\\s+plus', '§moretimes'),
  r('fois', '§times'),
  r('m[eê]me', '§same'),
  r('dans(?:\\s+(?:la|le|les|un|une))?|sur(?:\\s+(?:la|le|les))?', '§in'),
  r('(?:à\\s+partir\\s+)?du\\s+crochet', '§fromhook'),
  r('r[ée]p[ée]t(?:er|ez)?|r[ée]p\\.?|reprendre', '§rep'),
  r('compte(?:nt)?\\s+(?:comme|pour)(?:\\s+(?:la|le|une|un|1re|première))*', '§countsas'),
  r('fermer|joindre|pour\\s+fermer|pour\\s+joindre', '§join'),
  r('premi[eè]re|1[eè]re|premier', '§first'),
  r('tourner', '§turn'),
  r('sauter|passer', '§skip'),
  r('(?:de\\s+l[\'’]|sur\\s+l[\'’]|l[\'’])autre\\s+c[oô]t[ée](?:\\s+de\\s+la\\s+cha[iî]nette)?', '§otherside'),
  r('arceaux?|espaces?', '§space'),
  r('derni[eè]res?', '§last'),
  r('arr[eê]ter|couper\\s+le\\s+fil', '§fo'),
  r('de\\s+plus', ''),
];

const ES: Rule[] = [
  r('anillo\\s+m[aá]gico|am|anillo', '§mr'),
  r('(?:hebra|lazada)\\s+(?:trasera|de\\s+atr[aá]s)|ht|bl', '§blo'),
  r('(?:hebra|lazada)\\s+delantera|hd', '§flo'),
  r('medios?\\s+puntos?\\s+altos?|mpa|mp\\.a', '§hdc'),
  r('puntos?\\s+altos?\\s+dobles?|pad|pa\\s*doble', '§tr'),
  r('puntos?\\s+altos?|pa|pt\\.?\\s*alto', '§dc'),
  r('puntos?\\s+bajos?|pb|medios?\\s+puntos?|mp|pbs', '§sc'),
  r('puntos?\\s+(?:raso|deslizado|enano)s?|pr|pd|pe|pd\\.', '§sl'),
  r('cadenetas?|cad|cdna|ca', '§ch'),
  r('aumentos?|aum|au', '§inc'),
  r('disminuci[oó]n(?:es)?(?:\\s+invisibles?)?|dism?|dsm|dim', '§dec'),
  r('puntos?|pts?|p', '§st'),
  r('cada|todos\\s+los|todas\\s+las', '§each'),
  r('siguientes?', '§next'),
  r('alrededor|toda\\s+la\\s+vuelta|en\\s+toda\\s+la\\s+vuelta|en\\s+todos\\s+los\\s+puntos', '§around'),
  r('hasta\\s+el\\s+final', '§across'),
  r('veces\\s+m[aá]s', '§moretimes'),
  r('veces', '§times'),
  r('mismo|misma', '§same'),
  r('en(?:\\s+(?:el|la|los|las))?', '§in'),
  r('desde\\s+el\\s+ganchillo|del\\s+ganchillo', '§fromhook'),
  r('repetir|rep\\.?|repite', '§rep'),
  r('cuenta\\s+como(?:\\s+(?:el|un|primer))*', '§countsas'),
  r('cerrar|unir', '§join'),
  r('primer[oa]?', '§first'),
  r('girar|gira', '§turn'),
  r('saltar|salta', '§skip'),
  r('[uú]ltim[oa]s?', '§last'),
  r('rematar|cortar', '§fo'),
];

const PT: Rule[] = [
  r('anel\\s+m[aá]gico|am|anel', '§mr'),
  r('(?:al[cç]a|fio)\\s+de\\s+tr[aá]s|at', '§blo'),
  r('(?:al[cç]a|fio)\\s+da\\s+frente|af', '§flo'),
  r('meios?\\s+pontos?\\s+altos?|mpa', '§hdc'),
  r('pontos?\\s+altos?\\s+duplos?|pad|pa\\s*duplo', '§tr'),
  r('pontos?\\s+altos?|pa', '§dc'),
  r('pontos?\\s+baix[ií]ssimos?|pbx|pbb', '§sl'),
  r('pontos?\\s+baixos?|pb', '§sc'),
  r('correntes?|correntinhas?|corr|cor|ch', '§ch'),
  r('aumentos?|aum', '§inc'),
  r('diminui[cç](?:[aã]o|[oõ]es)(?:\\s+invis[ií]ve(?:l|is))?|dim', '§dec'),
  r('pontos?|pts?', '§st'),
  r('cada|todos\\s+os', '§each'),
  r('seguintes?|pr[oó]xim[oa]s?', '§next'),
  r('(?:em\\s+)?toda\\s+a\\s+volta|ao\\s+redor|em\\s+todos\\s+os\\s+pontos|em\\s+volta', '§around'),
  r('at[eé]\\s+o\\s+fim', '§across'),
  r('vezes\\s+mais', '§moretimes'),
  r('vezes', '§times'),
  r('mesm[oa]', '§same'),
  r('em|no|na|nos|nas', '§in'),
  r('(?:a\\s+partir\\s+)?da\\s+agulha', '§fromhook'),
  r('repetir|rep\\.?|repita', '§rep'),
  r('conta\\s+como(?:\\s+(?:o|um|primeiro))*', '§countsas'),
  r('fechar|unir', '§join'),
  r('primeir[oa]', '§first'),
  r('virar|vire', '§turn'),
  r('pular|pule|saltar', '§skip'),
  r('[uú]ltim[oa]s?', '§last'),
  r('arrematar|cortar', '§fo'),
];

const DE: Rule[] = [
  r('(?:ab|von)\\s+der\\s+nadel', '§fromhook'),
  r('magischer\\s+ring|fadenring|mr|fr', '§mr'),
  r('hinteres?\\s+maschenglied|hmg|nur\\s+ins\\s+hintere\\s+maschenglied', '§blo'),
  r('vorderes?\\s+maschenglied|vmg', '§flo'),
  r('feste\\s+maschen?|fm|f\\.m\\.|fe', '§sc'),
  r('halbe\\s+st[äa]bchen|hstb|hst', '§hdc'),
  r('doppel(?:te)?\\s*st[äa]bchen|dstb|dst', '§tr'),
  r('st[äa]bchen|stb', '§dc'),
  r('luftmaschen?|lm|lftm', '§ch'),
  r('kettmaschen?|km|kett', '§sl'),
  r('zunahmen?|zunehmen|zun|zu', '§inc'),
  r('(?:unsichtbare\\s+)?abnahmen?|abnehmen|abn|ab', '§dec'),
  r('maschen?|m', '§st'),
  r('jede[nrsm]?|alle', '§each'),
  r('n[äa]chste[nrsm]?|folgende[nrsm]?', '§next'),
  r('rundherum|ringsum|in\\s+der\\s+ganzen\\s+runde|die\\s+ganze\\s+runde', '§around'),
  r('bis\\s+zum\\s+ende', '§across'),
  r('weitere\\s+male|mal\\s+mehr', '§moretimes'),
  r('mal', '§times'),
  r('gleiche[nrsm]?|derselben|dieselbe', '§same'),
  r('in|im|ins|in\\s+die|in\\s+der|in\\s+den', '§in'),
  r('(?:ab|von)\\s+der\\s+nadel', '§fromhook'),
  r('wiederholen|wdh\\.?|whd\\.?|wh\\.?', '§rep'),
  r('z[äa]hlt\\s+als(?:\\s+(?:erste|1\\.))*', '§countsas'),
  r('schlie[sß]en|verbinden', '§join'),
  r('erste[nrsm]?', '§first'),
  r('wenden', '§turn'),
  r('überspringen|übergehen', '§skip'),
  r('letzte[nrsm]?', '§last'),
  r('abmaschen|faden\\s+abschneiden', '§fo'),
];

const IT: Rule[] = [
  r('anello\\s+magico|am|cerchio\\s+magico', '§mr'),
  r('asola\\s+posteriore|solo\\s+asola\\s+dietro|ad', '§blo'),
  r('asola\\s+anteriore|av', '§flo'),
  r('mezz[oie]\\s+punt[io]\\s+alt[io]|mpa|mma', '§hdc'),
  r('punt[io]\\s+alt[io]\\s+doppi[o]?|pad|mad|ma\\s*doppia', '§tr'),
  r('punt[io]\\s+alt[io]|maglie?\\s+alt[ae]|pa|ma', '§dc'),
  r('maglie?\\s+bassissim[ae]|mbss|pbss|mss|bss', '§sl'),
  r('punt[io]\\s+bass[io]|maglie?\\s+bass[ae]|pb|mb', '§sc'),
  r('catenell[ae]|cat|cad|cat\\.', '§ch'),
  r('aumenti?|aum', '§inc'),
  r('diminuzion[ei](?:\\s+invisibil[ei])?|dim', '§dec'),
  r('maglie?|punti?|m|pt', '§st'),
  r('ogni|ciascun[ao]?|tutte\\s+le|tutti\\s+i', '§each'),
  r('successiv[aeio]|seguent[ei]', '§next'),
  r('(?:per\\s+)?tutto\\s+il\\s+giro|intorno|in\\s+tondo', '§around'),
  r('fino\\s+alla\\s+fine', '§across'),
  r('volte\\s+in\\s+pi[uù]', '§moretimes'),
  r('volte', '§times'),
  r('stess[ao]', '§same'),
  r('in|nel(?:la|lo|le)?|nei|negli|su', '§in'),
  r('dall[\'’]uncinetto', '§fromhook'),
  r('ripetere|rip\\.?|ripeti', '§rep'),
  r('conta\\s+come(?:\\s+(?:la|il|un|prim[ao]))*', '§countsas'),
  r('chiudere|unire', '§join'),
  r('prim[ao]', '§first'),
  r('girare|gira', '§turn'),
  r('saltare|salta', '§skip'),
  r('ultim[aeio]', '§last'),
  r('chiudere\\s+il\\s+lavoro|tagliare', '§fo'),
];

const NL: Rule[] = [
  r('magische\\s+ring|magic\\s+ring|mr', '§mr'),
  r('achterste\\s+lus(?:sen)?|al', '§blo'),
  r('voorste\\s+lus(?:sen)?|vl', '§flo'),
  r('halve\\s+vasten?|hv|hvs', '§sl'),
  r('vasten?|v|vs', '§sc'),
  r('half\\s+stokjes?|hstk|hst', '§hdc'),
  r('dubbele\\s+stokjes?|dstk|dst', '§tr'),
  r('stokjes?|stk', '§dc'),
  r('losse(?:n)?|l|ll', '§ch'),
  r('meerder(?:en|ing(?:en)?)?|meerd|md', '§inc'),
  r('minder(?:en|ing(?:en)?)?|mind|min|2\\s+samen', '§dec'),
  r('steken?|stk\\.', '§st'),
  r('elke|iedere|alle', '§each'),
  r('volgende', '§next'),
  r('rondom|de\\s+hele\\s+toer|hele\\s+ronde', '§around'),
  r('tot\\s+het\\s+einde', '§across'),
  r('keer\\s+meer', '§moretimes'),
  r('keer|maal', '§times'),
  r('zelfde|dezelfde', '§same'),
  r('in|op', '§in'),
  r('(?:vanaf|van)\\s+de\\s+haaknaald', '§fromhook'),
  r('herhaal|herh\\.?', '§rep'),
  r('telt\\s+als(?:\\s+(?:eerste|1e))*', '§countsas'),
  r('sluiten|sluit', '§join'),
  r('eerste|1e', '§first'),
  r('keren|draai', '§turn'),
  r('overslaan|sla\\s+over', '§skip'),
  r('laatste', '§last'),
  r('afhechten', '§fo'),
];

export const RULES: Record<Lang, Rule[]> = {
  en: [...PRE, ...EN_US, ...COMMON],
  'en-uk': [r('dc\\s*2\\s*tog', '§dec'), ...PRE, ...EN_UK, ...COMMON],
  fr: [...PRE, ...FR, ...COMMON],
  es: [...PRE, ...ES, ...COMMON],
  pt: [...PRE, ...PT, ...COMMON],
  de: [...PRE, ...DE, ...COMMON],
  it: [...PRE, ...IT, ...COMMON],
  nl: [...PRE, ...NL, ...COMMON],
  xva: [...PRE, ...EN_US, ...COMMON],
};

/** XVA symbol notation: X = sc, V = inc, A = dec, W = 3-in-1, M = 3-tog, T = hdc, F = dc, E = tr. */
export function xvaToCanonical(s: string): string {
  return s.replace(/(^|[^\p{L}])(\d*)\s*([XVAWMTFE])(?![\p{L}])/gu, (_m, pre: string, n: string, c: string) => {
    const k = { X: '§sc', V: '§inc', A: '§dec', W: '§inc3', M: '§dec3', T: '§hdc', F: '§dc', E: '§tr' }[c];
    return `${pre} ${n} ${k} `;
  });
}

// ---- Language detection ----

const DETECT: Record<Exclude<Lang, 'en-uk'>, RegExp[]> = {
  fr: [word('ms|aug|dim|ml|mc|mailles?|rang|tour|cercle magique|anneau magique|dans|chaque|fois|brides?|tout le tour|suivante', 'giu')],
  en: [word('sc|inc|dec|ch|rnd|round|magic ring|st|sts|in each|around|stitch(?:es)?|hdc|sl st|times|repeat|rep|row', 'giu')],
  es: [word('pb|aum|dism|vuelta|anillo|cad|puntos?|cada|veces|vta|disminuci[oó]n', 'giu')],
  pt: [word('pb|aum|carreira|volta|anel|corr|pontos?|vezes|correntinha|pbx|diminui[cç][aã]o', 'giu')],
  de: [word('fm|fM|zun|abn|runde|lm|km|maschen?|jede|mal|stb|fadenring|feste', 'giu')],
  it: [word('pb|aum|giro|anello|catenella|mbss|maglie?|ogni|volte|punti|diminuzione', 'giu')],
  nl: [word('v|meerd|mind|toer|ronde|losse|hv|stk|steken|vasten|elke|keer|meerderen|minderen', 'giu')],
  xva: [/(?:^|[^\p{L}])\d*\s*[XVA](?![\p{L}])/gu],
};

export function detectLang(text: string): Lang {
  const sample = text.slice(0, 20000);
  let best: Lang = 'en';
  let bestScore = 0;
  for (const [lang, res] of Object.entries(DETECT) as [Lang, RegExp[]][]) {
    let score = 0;
    for (const re of res) score += (sample.match(re) || []).length;
    // Uppercase XVA letters appear in prose too; only count dense use.
    if (lang === 'xva') score = score > 12 ? score * 1.2 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  if (best === 'en' && isUkTerms(sample)) return 'en-uk';
  return best;
}

export function isUkTerms(text: string): boolean {
  if (/\bUK\s+(?:terms|terminology|crochet)\b/i.test(text)) return true;
  if (/\bUS\s+(?:terms|terminology)\b/i.test(text)) return false;
  return /\b(?:htr|dtr|trtr)\b/i.test(text) && !/\bsc\b/i.test(text);
}

// ---- Abbreviation suggestions for the editor ----

export interface Abbrev {
  abbr: string;
  meaning: string;
}

const ABBR_RAW: Record<Lang, [string, string][]> = {
  fr: [
    ['ms', 'maille serrée'], ['aug', 'augmentation'], ['dim', 'diminution'], ['ml', 'maille en l’air'],
    ['mc', 'maille coulée'], ['db', 'demi-bride'], ['br', 'bride'], ['dbr', 'double bride'], ['cm', 'cercle magique'],
    ['m', 'maille'], ['BA', 'brin arrière'], ['BAv', 'brin avant'], ['picot', 'picot'], ['tout le tour', ''],
    ['dans chaque m', ''], ['fois', ''], ['changer de couleur', ''],
  ],
  en: [
    ['sc', 'single crochet'], ['inc', 'increase'], ['dec', 'decrease'], ['ch', 'chain'], ['sl st', 'slip stitch'],
    ['hdc', 'half double crochet'], ['dc', 'double crochet'], ['tr', 'treble'], ['MR', 'magic ring'], ['st', 'stitch'],
    ['sts', 'stitches'], ['BLO', 'back loop only'], ['FLO', 'front loop only'], ['invdec', 'invisible decrease'],
    ['sc2tog', 'sc 2 together'], ['picot', ''], ['around', ''], ['in each st', ''], ['rep from *', ''], ['times', ''],
  ],
  'en-uk': [
    ['dc', 'double crochet (UK)'], ['htr', 'half treble'], ['tr', 'treble (UK)'], ['dtr', 'double treble'],
    ['inc', 'increase'], ['dec', 'decrease'], ['ch', 'chain'], ['ss', 'slip stitch'], ['MR', 'magic ring'],
    ['st', 'stitch'], ['BLO', 'back loop only'], ['FLO', 'front loop only'], ['around', ''],
  ],
  es: [
    ['pb', 'punto bajo'], ['aum', 'aumento'], ['dism', 'disminución'], ['cad', 'cadeneta'], ['pd', 'punto deslizado'],
    ['mpa', 'medio punto alto'], ['pa', 'punto alto'], ['am', 'anillo mágico'], ['p', 'punto'], ['veces', ''],
    ['en cada punto', ''], ['alrededor', ''],
  ],
  pt: [
    ['pb', 'ponto baixo'], ['aum', 'aumento'], ['dim', 'diminuição'], ['corr', 'corrente'], ['pbx', 'ponto baixíssimo'],
    ['mpa', 'meio ponto alto'], ['pa', 'ponto alto'], ['am', 'anel mágico'], ['vezes', ''], ['em cada ponto', ''],
  ],
  de: [
    ['fM', 'feste Masche'], ['zun', 'zunehmen'], ['abn', 'abnehmen'], ['Lm', 'Luftmasche'], ['Km', 'Kettmasche'],
    ['hStb', 'halbes Stäbchen'], ['Stb', 'Stäbchen'], ['MR', 'magischer Ring'], ['M', 'Masche'], ['hMg', 'hinteres Maschenglied'],
    ['mal', ''], ['in jede M', ''],
  ],
  it: [
    ['pb', 'punto basso'], ['aum', 'aumento'], ['dim', 'diminuzione'], ['cat', 'catenella'], ['mbss', 'maglia bassissima'],
    ['mma', 'mezza maglia alta'], ['ma', 'maglia alta'], ['am', 'anello magico'], ['volte', ''], ['in ogni maglia', ''],
  ],
  nl: [
    ['v', 'vaste'], ['meerd', 'meerderen'], ['mind', 'minderen'], ['l', 'losse'], ['hv', 'halve vaste'],
    ['hstk', 'half stokje'], ['stk', 'stokje'], ['mr', 'magische ring'], ['keer', ''], ['in elke steek', ''],
  ],
  xva: [
    ['X', 'maille serrée / sc'], ['V', 'augmentation / inc'], ['A', 'diminution / dec'], ['W', '3 en 1'],
    ['M', '3 ensemble'], ['T', 'demi-bride / hdc'], ['F', 'bride / dc'], ['ch', 'chaînette'], ['MR', 'cercle magique'],
  ],
};

export const ABBREVIATIONS = Object.fromEntries(
  Object.entries(ABBR_RAW).map(([k, list]) => [k, list.map(([abbr, meaning]) => ({ abbr, meaning }))]),
) as Record<Lang, Abbrev[]>;
