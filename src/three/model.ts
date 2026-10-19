// Builds 3D pieces from stitch counts and heights, and assembles them from
// their names ("head", "ears"…) and the positions stated in the instructions.

import * as THREE from 'three';
import type { ParseResult, Pattern, Piece, Placement } from '../core/types';
import { pieceProfile, stitchSize, stuffedProfile, type Ring } from '../core/yarn';

export type Role =
  | 'head' | 'body' | 'ear' | 'arm' | 'leg' | 'tail' | 'snout' | 'eye' | 'nose' | 'wing' | 'antenna' | 'horn' | 'spike' | 'lobe' | 'layer' | 'hat' | 'cheek' | 'other';

const ROLE_WORDS: [Role, RegExp][] = [
  ['head', /\b(?:head|t[eê]te|cabeza|cabe[cç]a|kopf|testa|hoofd)\b/iu],
  ['body', /\b(?:body|corps|cuerpo|corpo|k[öo]rper|lijf|romp|torso|base)\b/iu],
  ['ear', /\b(?:ears?|oreilles?|orejas?|orelhas?|ohr(?:en)?|orecchi[eo]|oren|oor)\b/iu],
  ['arm', /\b(?:arms?|bras|brazos?|bra[cç]os?|arme?|bracci[ao]|armen|hands?|mains?|paws?|pattes?\s+avant|flippers?|nageoires?)\b/iu],
  ['leg', /\b(?:legs?|jambes?|pieds?|feet|foot|piernas?|pernas?|beine?|f[üu](?:ß|ss)e|gambe|benen|been|pattes?)\b/iu],
  ['tail', /\b(?:tail|queue|cola|rabo|schwanz|coda|staart)\b/iu],
  ['snout', /\b(?:snout|muzzle|museau|hocico|focinho|schnauze|muso|snuit|beak|bec)\b/iu],
  ['eye', /\b(?:eyes?|yeux|[œo]eil|ojos?|olhos?|augen?|occhi[o]?|ogen|oog|pupils?)\b/iu],
  ['nose', /\b(?:nose|nez|nariz|nase|naso|neus)\b/iu],
  ['wing', /\b(?:wings?|ailes?|alas?|asas?|fl[üu]gel|ali|vleugels?)\b/iu],
  ['antenna', /\b(?:antenn(?:ae|as|a|es|e)|antenas?|f[üu]hler|voelsprieten)\b/iu],
  ['horn', /\b(?:horns?|cornes?|cuernos?|chifres?|h[öo]rner|corna|hoorns?)\b/iu],
  ['spike', /\b(?:spikes?|pics?|[ée]pines?|p[uú]as?|stacheln?|spine|stekels?|crest|cr[eê]te)\b/iu],
  ['lobe', /\b(?:lobes?|bumps?|bosses?)\b/iu],
  ['layer', /\b(?:layer|couche|capa|camada|schicht|strato|laag|front|back|devant|dos|face|top|bottom|dessus|dessous)\b/iu],
  ['hat', /\b(?:hat|chapeau|bonnet|sombrero|chap[eé]u|hut|cappello|hoed|cap)\b/iu],
  ['cheek', /\b(?:cheeks?|joues?|mejillas?|bochechas?|wangen?|guance)\b/iu],
];

export function roleOf(name: string): Role {
  for (const [r, re] of ROLE_WORDS) if (re.test(name)) return r;
  return 'other';
}

// ---- Stitch texture ----

let tex: THREE.Texture | null = null;
export function stitchTexture(): THREE.Texture {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a7a7a';
  g.fillRect(0, 0, 64, 64);
  g.lineCap = 'round';
  for (const [lw, col, off] of [
    [16, '#9a9a9a', 0],
    [11, '#e8e8e8', 0],
    [3, '#ffffff', -2],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(10 + off, 8 + off);
    g.quadraticCurveTo(24 + off, 34 + off, 32 + off, 58 + off);
    g.moveTo(54 + off, 8 + off);
    g.quadraticCurveTo(40 + off, 34 + off, 32 + off, 58 + off);
    g.stroke();
  }
  tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---- Piece geometry ----

const SEG = 48;

export interface BuiltPiece {
  mesh: THREE.Mesh;
  rings: Ring[];
  height: number;
  maxR: number;
  flat: boolean;
  piece: Piece;
  role: Role;
}

export function buildPiece(piece: Piece, hook: number, colorFor: (roundColor?: string) => string, upTo = Infinity): BuiltPiece | null {
  const role = roleOf(piece.name);
  const { w, h } = stitchSize(hook);
  if (piece.flat) return buildFlat(piece, hook, colorFor, upTo, role);
  let rings = pieceProfile(piece, hook, upTo);
  if (rings.length < 2) return null;
  rings = stuffedProfile(rings, h, w);
  const shown = piece.rounds.slice(0, upTo);
  // Ring i (after the optional centre) belongs to round i-offset.
  const offset = rings.length - shown.length;
  const last = rings[rings.length - 1];
  const closeTop = last.r <= w * 1.4;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const color = new THREE.Color();
  let v = 0;
  rings.forEach((ring, i) => {
    const round = shown[Math.max(0, i - offset)];
    color.set(colorFor(round?.color));
    const count = Math.max(ring.count || 6, 3);
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      pos.push(ring.r * Math.sin(a), ring.z, ring.r * Math.cos(a));
      uv.push((j / SEG) * count, v);
      col.push(color.r, color.g, color.b);
    }
    if (i < rings.length - 1) v += round ? round.height : 1;
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (closeTop && last.r > 0) {
    const c = pos.length / 3;
    pos.push(0, last.z + h * 0.25, 0);
    uv.push(0, v + 0.5);
    col.push(color.r, color.g, color.b);
    const base = (rings.length - 1) * (SEG + 1);
    for (let j = 0; j < SEG; j++) idx.push(base + j, c, base + j + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stitchTexture(), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = piece.name;
  const maxR = Math.max(...rings.map((r) => r.r));
  // Unstuffed flat pieces (ears, wings) are pressed flat.
  if (['ear', 'wing'].includes(role) || (!closeTop && role === 'other' && last.r > maxR * 0.85 && rings.length < 10)) mesh.scale.z = 0.35;
  return { mesh, rings, height: last.z, maxR, flat: false, piece, role };
}

function buildFlat(piece: Piece, hook: number, colorFor: (c?: string) => string, upTo: number, role: Role): BuiltPiece | null {
  const { w, h } = stitchSize(hook);
  const rows = piece.rounds.slice(0, upTo);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.count ?? r.stated ?? 1)) * w;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const color = new THREE.Color();
  let y = 0;
  const count = Math.max(...rows.map((r) => r.count ?? r.stated ?? 1));
  rows.forEach((r, i) => {
    color.set(colorFor(r.color));
    const y1 = y + h * r.height;
    const base = pos.length / 3;
    for (const [yy, vv] of [
      [y, i],
      [y1, i + r.height],
    ] as const) {
      pos.push(-width / 2, yy, 0, width / 2, yy, 0);
      uv.push(0, vv, count, vv);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    y = y1;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stitchTexture(), roughness: 0.92, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = piece.name;
  return { mesh, rings: [], height: y, maxR: width / 2, flat: true, piece, role };
}

// ---- Surface sampling ----

/** Point and outward normal on a built piece, in its local frame. round: fractional round index (1-based); angle: 0 = front (+z). */
export function surfaceAt(b: BuiltPiece, round: number, angle: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  if (b.flat || !b.rings.length) {
    const y = Math.min(b.height, Math.max(0, (round / Math.max(1, b.piece.rounds.length)) * b.height));
    return { p: new THREE.Vector3(Math.sin(angle) * b.maxR, y, 0.05), n: new THREE.Vector3(0, 0, 1) };
  }
  const offset = b.rings.length - b.piece.rounds.length;
  const fi = Math.min(b.rings.length - 1.001, Math.max(0, round - 1 + offset));
  const i = Math.floor(fi);
  const f = fi - i;
  const r0 = b.rings[i];
  const r1 = b.rings[Math.min(i + 1, b.rings.length - 1)];
  const r = r0.r + (r1.r - r0.r) * f;
  const z = r0.z + (r1.z - r0.z) * f;
  const dr = r1.r - r0.r;
  const dz = r1.z - r0.z || 1e-3;
  const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const n = radial.clone().multiplyScalar(dz).add(new THREE.Vector3(0, -dr, 0)).normalize();
  const p = radial.multiplyScalar(r).add(new THREE.Vector3(0, z, 0));
  p.z *= b.mesh.scale.z;
  return { p, n };
}

/** Fraction of the piece height → fractional round number. */
function roundAtFraction(b: BuiltPiece, frac: number): number {
  if (b.flat || !b.rings.length) return frac * b.piece.rounds.length;
  const target = frac * b.height;
  const offset = b.rings.length - b.piece.rounds.length;
  for (let i = 1; i < b.rings.length; i++) {
    if (b.rings[i].z >= target) {
      const f = (target - b.rings[i - 1].z) / Math.max(1e-6, b.rings[i].z - b.rings[i - 1].z);
      return i - 1 + f + 1 - offset;
    }
  }
  return b.piece.rounds.length;
}

// ---- Assembly ----

export interface Assembly {
  root: THREE.Group;
  /** Pieces that can receive others (for manual placement). */
  hosts: THREE.Mesh[];
  hostOf: Map<THREE.Object3D, string>;
  size: number;
}

interface Slot {
  frac: number;
  angle: number;
  /** Sew by the open end (true) or lay against the surface (false). */
  byEnd: boolean;
}

const DEFAULT_SLOTS: Partial<Record<Role, Slot>> = {
  ear: { frac: 0.85, angle: 0.95, byEnd: true },
  arm: { frac: 0.55, angle: Math.PI / 2, byEnd: true },
  leg: { frac: 0.08, angle: 0.45, byEnd: true },
  tail: { frac: 0.25, angle: Math.PI, byEnd: true },
  snout: { frac: 0.45, angle: 0, byEnd: true },
  nose: { frac: 0.5, angle: 0, byEnd: true },
  eye: { frac: 0.55, angle: 0.35, byEnd: true },
  wing: { frac: 0.55, angle: Math.PI - 0.55, byEnd: true },
  antenna: { frac: 0.97, angle: 0.3, byEnd: true },
  horn: { frac: 0.95, angle: 0.45, byEnd: true },
  spike: { frac: 0.6, angle: Math.PI, byEnd: true },
  hat: { frac: 1, angle: 0, byEnd: true },
  cheek: { frac: 0.45, angle: 0.7, byEnd: false },
  other: { frac: 0.5, angle: Math.PI / 2, byEnd: true },
};

const HINT_ROLE: [RegExp, Role][] = [
  [/^(?:eyes?|yeux|[œo]eil|ojos?|olhos?|augen?|occhi|ogen|oog)$/iu, 'eye'],
  [/^(?:ears?|oreilles?|orejas?|orelhas?|ohren?|orecchie|oren)$/iu, 'ear'],
  [/^(?:arms?|bras|brazos?|bra[cç]os?|arme|braccia|armen)$/iu, 'arm'],
  [/^(?:legs?|jambes?|pieds?|piernas?|pernas?|beine|gambe|benen)$/iu, 'leg'],
  [/^(?:snout|museau|hocico|focinho|schnauze|muso|snuit)$/iu, 'snout'],
  [/^(?:nose|nez|nariz|nase|naso|neus)$/iu, 'nose'],
  [/^(?:wings?|ailes?|alas|asas|fl[üu]gel|ali|vleugels)$/iu, 'wing'],
  [/^(?:tail|queue|cola|rabo|schwanz|coda|staart)$/iu, 'tail'],
  [/^(?:antennae?|antennes?|antenas)$/iu, 'antenna'],
  [/^(?:horns?|cornes?)$/iu, 'horn'],
];

export function assemble(
  res: ParseResult,
  p: Pattern,
  hook: number,
  opts: { separate: boolean; upTo: number; colorFor: (piece: Piece, roundColor?: string) => string },
): Assembly {
  const root = new THREE.Group();
  const hosts: THREE.Mesh[] = [];
  const hostOf = new Map<THREE.Object3D, string>();
  // Construction slider: rounds in pattern order.
  let budget = opts.upTo;
  const built: BuiltPiece[] = [];
  for (const piece of res.pieces) {
    const n = Math.min(piece.rounds.length, Math.max(0, budget));
    budget -= piece.rounds.length;
    if (n <= 0) continue;
    const b = buildPiece(piece, hook, (rc) => opts.colorFor(piece, rc), n);
    if (b) built.push(b);
  }
  if (!built.length) return { root, hosts, hostOf, size: 1 };

  if (opts.separate) {
    let x = 0;
    const gap = stitchSize(hook).w * 3;
    for (const b of built) {
      const g = new THREE.Group();
      g.add(b.mesh);
      x += b.maxR;
      g.position.set(x, 0, 0);
      x += b.maxR + gap;
      root.add(g);
    }
    root.position.x = -x / 2;
    const box = new THREE.Box3().setFromObject(root);
    return { root, hosts, hostOf, size: box.getSize(new THREE.Vector3()).length() };
  }

  const byRole = (r: Role) => built.filter((b) => b.role === r);
  const head = byRole('head')[0];
  const body = byRole('body')[0];
  const largest = [...built].sort((a, b) => b.maxR * b.height - a.maxR * a.height)[0];
  const main = body ?? head ?? largest;
  const mainGroup = new THREE.Group();
  mainGroup.add(main.mesh);
  root.add(mainGroup);
  hosts.push(main.mesh);
  hostOf.set(main.mesh, main.piece.name);
  const placedHosts = new Map<BuiltPiece, THREE.Object3D>([[main, mainGroup]]);

  const lobes = byRole('lobe');
  if (lobes.length && main.role !== 'lobe') {
    // Heart: the body hangs point-down under two lobes.
    mainGroup.rotation.z = Math.PI;
    mainGroup.position.y = main.height;
  } else if (!(head && body)) {
    // A head (or a one-piece body acting as one) starts at the crown.
    mainGroup.rotation.z = Math.PI;
  }

  if (head && body && head !== main) {
    const hg = new THREE.Group();
    hg.add(head.mesh);
    // Heads are worked from the crown down.
    hg.rotation.z = Math.PI;
    hg.position.y = main.height * 0.92 + head.height;
    root.add(hg);
    hosts.push(head.mesh);
    hostOf.set(head.mesh, head.piece.name);
    placedHosts.set(head, hg);
  }

  const layers = byRole('layer');
  layers.forEach((b, i) => {
    if (b === main) return;
    const g = new THREE.Group();
    g.add(b.mesh);
    g.position.z = -(i + 1) * stitchSize(hook).h * 1.2;
    root.add(g);
  });

  lobes.forEach((b) => {
    if (b === main) return;
    for (let c = 0; c < Math.max(2, b.piece.copies); c++) {
      const g = new THREE.Group();
      const m = c === 0 ? b.mesh : b.mesh.clone();
      g.add(m);
      const side = c % 2 === 0 ? -1 : 1;
      g.position.set(side * b.maxR * 0.95, main.height + b.height * 0.75, 0);
      g.rotation.z = Math.PI + side * 0.18;
      root.add(g);
    }
  });

  root.updateMatrixWorld(true);
  const headHost = head && placedHosts.has(head) ? head : main;
  const hostFor = (role: Role): BuiltPiece => {
    if (['ear', 'snout', 'nose', 'eye', 'antenna', 'horn', 'hat', 'cheek'].includes(role)) return headHost;
    return main;
  };

  const hintFor = (role: Role) =>
    res.positions.find((h) => HINT_ROLE.some(([re, r]) => r === role && re.test(h.what)));

  const attach = (b: BuiltPiece | null, role: Role, copies: number, makeMesh: (i: number) => THREE.Object3D, name: string, depth: number) => {
    const host = hostFor(role);
    const hostObj = placedHosts.get(host)!;
    const slot = DEFAULT_SLOTS[role] ?? DEFAULT_SLOTS.other!;
    const hint = hintFor(role);
    let round = roundAtFraction(host, slot.frac);
    let angle = slot.angle;
    if (hint) {
      round = (hint.rounds[0] + hint.rounds[1]) / 2;
      if (hint.apart && role === 'eye') {
        const ri = Math.min(host.piece.rounds.length - 1, Math.max(0, Math.round(round) - 1));
        const cnt = host.piece.rounds[ri]?.count ?? 30;
        angle = ((hint.apart + 1) / 2 / cnt) * Math.PI * 2;
      }
    }
    // Pieces worked from the top down: rounds count from the other end.
    const manual: Placement | undefined = p.placements[name.toLowerCase()];
    for (let c = 0; c < copies; c++) {
      const mirrored = copies >= 2 && c % 2 === 1;
      let point: THREE.Vector3;
      let normal: THREE.Vector3;
      let target: THREE.Object3D = hostObj;
      if (manual) {
        const hostB = built.find((x) => x.piece.name === manual.host);
        target = (hostB && placedHosts.get(hostB)) ?? hostObj;
        point = new THREE.Vector3(...manual.pos);
        normal = new THREE.Vector3(...manual.normal);
        if (mirrored) {
          point.x = -point.x;
          normal.x = -normal.x;
        }
        if (c >= 2) point.y -= (c >> 1) * 0.6;
      } else {
        let a = angle;
        if (copies === 1 && ['arm', 'ear', 'eye', 'leg', 'wing', 'antenna', 'horn', 'cheek'].includes(role) === false) a = slot.angle;
        else if (copies === 1) a = 0;
        if (mirrored) a = -a;
        if (copies > 2) a += Math.floor(c / 2) * 0.5;
        if (role === 'spike') {
          a = Math.PI;
          round = roundAtFraction(host, 0.25 + (0.6 * c) / Math.max(1, copies - 1));
        }
        const s = surfaceAt(host, round, a);
        point = s.p;
        normal = s.n;
      }
      const obj = makeMesh(c);
      const g = new THREE.Group();
      g.add(obj);
      if (mirrored) obj.scale.x *= -1;
      // The piece's growth axis (+y) points into the host; its open end sits on the surface.
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().negate());
      g.quaternion.copy(q);
      const sink = depth * 0.12;
      g.position.copy(point.clone().add(normal.clone().multiplyScalar(depth - sink)));
      if (b?.role === 'ear' || role === 'wing') g.rotateY(Math.PI / 2);
      target.add(g);
    }
  };

  for (const b of built) {
    if (b === main || placedHosts.has(b) || ['lobe', 'layer'].includes(b.role)) continue;
    attach(b, b.role, b.piece.copies, (c) => (c === 0 ? b.mesh : b.mesh.clone()), b.piece.name, b.height);
  }

  // Safety eyes when no eye piece is crocheted.
  const eyeHint = hintFor('eye');
  if (!byRole('eye').length && (res.safetyEyesMm || eyeHint)) {
    const rad = ((res.safetyEyesMm ?? 8) / 10) * 0.5;
    const geo = new THREE.SphereGeometry(rad, 24, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x141218, roughness: 0.15, metalness: 0.1 });
    attach(null, 'eye', 2, () => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.y = 0.6;
      return m;
    }, 'eyes', rad * 0.5);
  }

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  return { root, hosts, hostOf, size: box.getSize(new THREE.Vector3()).length() };
}
