// Shared data model. Everything persisted lives in Pattern (IndexedDB "patterns")
// and StoredBlob (IndexedDB "blobs").

export type Lang = 'fr' | 'en' | 'en-uk' | 'es' | 'pt' | 'de' | 'it' | 'nl' | 'xva';
export type UiLang = 'fr' | 'en';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Attachment {
  blobId: string;
  name: string;
  type: string;
}

export interface Placement {
  /** Point on the host surface, in host-local coordinates. */
  pos: [number, number, number];
  /** Outward normal at that point. */
  normal: [number, number, number];
  host: string;
}

export interface Pattern {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  text: string;
  /** 'auto' lets the parser detect the language. */
  lang: Lang | 'auto';
  hookMm?: number;
  yarn?: string;
  tags: string[];
  sizeIndex: number;
  /** Round key → timestamp it was ticked (0 when the date is unknown). */
  done: Record<string, number>;
  /** Stitches counted so far in the current round. */
  stitchCount: number;
  roundNotes: Record<string, string>;
  roundPhotos: Record<string, string>;
  checklist: ChecklistItem[];
  photos: string[];
  coverId?: string;
  attachment?: Attachment;
  /** 'YYYY-MM-DD' → seconds crocheted that day. */
  timeLog: Record<string, number>;
  timerStartedAt?: number;
  /** Piece colour overrides, keyed by piece name (lower-case). */
  colors: Record<string, string>;
  placements: Record<string, Placement>;
  source?: 'example' | 'pdf' | 'share' | 'typed' | 'file';
  exampleId?: string;
}

export interface StoredBlob {
  id: string;
  blob: Blob;
  thumb?: Blob;
  name?: string;
  createdAt: number;
}

// ---- Parser output ----

export type StitchKind =
  | 'sc' | 'hdc' | 'dc' | 'tr' | 'dtr'
  | 'ch' | 'sl' | 'mr'
  | 'inc' | 'dec' | 'inc3' | 'dec3'
  | 'picot' | 'bobble' | 'puff' | 'popcorn' | 'skip';

export interface StitchOp {
  kind: StitchKind;
  /** Underlying stitch for inc/dec (sc by default). */
  base?: 'sc' | 'hdc' | 'dc' | 'tr';
  /** Stitches of the previous round used. */
  consumes: number;
  /** Stitches this op leaves for the next round. */
  produces: number;
  loop?: 'blo' | 'flo';
  color?: string;
}

export interface Round {
  /** Stable key used for progress: "<piece index>:<round number>". */
  key: string;
  number: number;
  /** Index of the piece copy-independent round in the piece (0-based). */
  index: number;
  line: number;
  label: string;
  instructions: string;
  ops: StitchOp[];
  /** Computed stitch count, or undefined when it can't be computed. */
  count?: number;
  stated?: number;
  /** Stated count disagrees with the computed one. */
  mismatch: boolean;
  /** Stitches used ≠ previous round's count. */
  consumeMismatch: boolean;
  consumed: number;
  /** Count inferred (no stitches in the text). */
  inferred?: boolean;
  color?: string;
  colorName?: string;
  loop?: 'blo' | 'flo';
  /** Mean stitch height, in sc units. */
  height: number;
  rows: boolean;
  unknown: string[];
}

export interface Piece {
  name: string;
  copies: number;
  flat: boolean;
  line: number;
  rounds: Round[];
  color?: string;
  colorName?: string;
  colorGuessed: boolean;
  /** Second colour if the piece uses two. */
  colors: string[];
}

export interface ColorLegendEntry {
  key: string;
  name: string;
  hex: string;
}

export interface ParseResult {
  lang: Lang;
  pieces: Piece[];
  legend: ColorLegendEntry[];
  /** Round line index → round, for ticking in the text. */
  byLine: Map<number, Round[]>;
  sizes: number;
  hookMm?: number;
  statedSizeCm?: number;
  materials: string[];
  safetyEyesMm?: number;
  /** Mentions like "eyes between rounds 9 and 10" → piece → rounds. */
  positions: PositionHint[];
}

export interface PositionHint {
  what: string;
  host?: string;
  rounds: [number, number];
  apart?: number;
}
