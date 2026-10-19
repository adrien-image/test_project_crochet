// 3D preview tab.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { h, clear, download, toast } from '../../core/dom';
import { t } from '../../core/i18n';
import type { Pattern } from '../../core/types';
import { parsed } from '../../core/progress';
import * as store from '../../store/store';
import { assemble, roleOf } from '../../three/model';
import { fileName } from '../../features/share';
import { canvasToBlob } from '../../features/images';
import { pieceColor } from './rounds';
import { hookOf } from './yarn';

export function preview3dTab(root: HTMLElement, p0: Pattern) {
  const id = p0.id;
  const res0 = parsed(p0);
  if (!res0.pieces.length) {
    root.append(h('p', { class: 'empty' }, t('no_3d')));
    return;
  }
  const wrap = h('div', { class: 'three-wrap', tabindex: '0', 'aria-label': t('keys_3d') });
  const side = h('div', { class: 'stack' });
  root.append(h('div', { class: 'cols' }, h('div', null, wrap), side));

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  } catch {
    clear(wrap);
    wrap.append(h('p', { class: 'empty' }, t('webgl_missing')));
    return;
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.append(renderer.domElement, h('div', { class: 'three-hint' }, t('keys_3d')));
  const banner = h('div', { class: 'three-banner', hidden: true });
  wrap.append(banner);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 1000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a80, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffeedd, 0.6);
  rim.position.set(-4, 2, -5);
  scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const pivot = new THREE.Group();
  scene.add(pivot);
  let separate = false;
  let upTo = Infinity;
  let placing: string | null = null;
  let assembly: ReturnType<typeof assemble> | null = null;
  let lastSize = 0;

  const resize = () => {
    const w = wrap.clientWidth;
    const hh = wrap.clientHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / Math.max(1, hh);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  const frame = (size: number) => {
    const d = Math.max(4, size * 1.6);
    camera.position.set(0, size * 0.25, d);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  const build = () => {
    const p = store.getPattern(id);
    if (!p) return;
    const res = parsed(p);
    if (assembly) {
      pivot.remove(assembly.root);
      assembly.root.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    assembly = assemble(res, p, hookOf(p), { separate, upTo, colorFor: pieceColor(p) });
    pivot.add(assembly.root);
    if (Math.abs(assembly.size - lastSize) > lastSize * 0.5) {
      lastSize = assembly.size;
      frame(assembly.size);
    }
  };

  const renderSide = () => {
    const p = store.getPattern(id);
    if (!p) return;
    const res = parsed(p);
    clear(side);
    const total = res.pieces.reduce((a, pc) => a + pc.rounds.length, 0);
    const flat = res.pieces.flatMap((pc) => pc.rounds.map((r) => ({ pc, r })));
    const sliderVal = Math.min(total, upTo);
    const label = h('span', { class: 'small muted' });
    const setLabel = (v: number) => {
      const it = flat[v - 1];
      label.textContent = v >= total ? t('construction_all') : it ? t('construction_after', { label: `${it.pc.name} · ${it.r.label}` }) : '—';
    };
    const slider = h('input', {
      type: 'range',
      min: '1',
      max: String(total),
      value: String(sliderVal),
      'aria-label': t('construction'),
      oninput: () => {
        const v = Number(slider.value);
        upTo = v >= total ? Infinity : v;
        setLabel(v);
        build();
      },
    });
    setLabel(sliderVal);
    const seg = h(
      'div',
      { class: 'seg', role: 'group' },
      h('button', { 'aria-pressed': String(!separate), onclick: () => ((separate = false), build(), renderSide()) }, t('view_assembled')),
      h('button', { 'aria-pressed': String(separate), onclick: () => ((separate = true), build(), renderSide()) }, t('view_separate')),
    );
    const pieces = res.pieces.map((pc) => {
      const keyName = pc.name.toLowerCase();
      const isPlacing = placing === pc.name;
      const canPlace = !['head', 'body'].includes(roleOf(pc.name)) && !separate;
      return h(
        'div',
        { class: 'piece-row' },
        h('input', {
          type: 'color',
          value: p.colors[keyName] ?? pc.color ?? '#d9c3a0',
          'aria-label': `${t('yarn_color')} — ${pc.name}`,
          onchange: (e: Event) => void store.update(id, (q) => (q.colors[keyName] = (e.target as HTMLInputElement).value)),
        }),
        h('span', { class: 'name' }, pc.name, pc.copies > 1 ? ` ${t('copies', { n: pc.copies })}` : '', pc.colorGuessed && !p.colors[keyName] ? h('span', { class: 'badge warn', style: 'margin-left:.3rem' }, t('guessed')) : null),
        canPlace
          ? h('button', {
              class: `btn btn-small ${isPlacing ? 'btn-primary' : ''}`,
              'aria-pressed': String(isPlacing),
              onclick: () => {
                placing = isPlacing ? null : pc.name;
                banner.hidden = !placing;
                banner.textContent = placing ? t('placing', { name: placing }) : '';
                renderSide();
              },
            }, '📍 ', t('place_piece'))
          : null,
        p.placements[keyName]
          ? h('button', { class: 'btn btn-ghost btn-small', title: t('place_reset'), 'aria-label': t('place_reset'), onclick: () => void store.update(id, (q) => delete q.placements[keyName]) }, '↺')
          : null,
      );
    });
    side.append(
      h('div', { class: 'panel stack' }, seg, h('label', { class: 'field' }, t('construction'), slider, label)),
      h('div', { class: 'panel stack' }, h('h3', { style: 'margin:0' }, t('colors')), h('div', { class: 'piece-list' }, ...pieces), h('p', { class: 'small muted', style: 'margin:0' }, t('place_help'))),
      h('button', {
        class: 'btn',
        onclick: async () => {
          renderer.render(scene, camera);
          download(await canvasToBlob(renderer.domElement, 'image/png'), fileName(p, '-3d.png'));
        },
      }, '⬇ ', t('export_png')),
    );
  };

  // Manual placement: tap the model.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!placing || !down || !assembly) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(assembly.hosts, false)[0];
    if (!hit) return;
    const hostName = assembly.hostOf.get(hit.object)!;
    const parent = hit.object.parent!;
    const local = parent.worldToLocal(hit.point.clone());
    const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
    // Mirror the tapped point so the first copy is on the viewer's left.
    const name = placing;
    placing = null;
    banner.hidden = true;
    void store.update(id, (q) => {
      q.placements[name.toLowerCase()] = { pos: [local.x, local.y, local.z], normal: [n.x, n.y, n.z], host: hostName };
    });
    toast('✓ ' + name);
  });

  // Keyboard controls.
  wrap.addEventListener('keydown', (e) => {
    const step = 0.15;
    if (e.key === 'ArrowLeft') pivot.rotation.y -= step;
    else if (e.key === 'ArrowRight') pivot.rotation.y += step;
    else if (e.key === 'ArrowUp') pivot.rotation.x -= step;
    else if (e.key === 'ArrowDown') pivot.rotation.x += step;
    else if (e.key === '+' || e.key === '=') camera.position.multiplyScalar(0.9);
    else if (e.key === '-') camera.position.multiplyScalar(1.1);
    else if (e.key === '0') {
      pivot.rotation.set(0, 0, 0);
      frame(lastSize);
    } else return;
    e.preventDefault();
  });

  let raf = 0;
  const loop = () => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  resize();
  build();
  renderSide();
  loop();
  const off = store.subscribe((ids) => {
    if (!ids.includes(id)) return;
    build();
    if (!side.contains(document.activeElement) || (document.activeElement as HTMLInputElement)?.type !== 'range') renderSide();
  });
  return () => {
    off();
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
  };
}
