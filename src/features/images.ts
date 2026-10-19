// Image import: downscale photos and make thumbnails before storing them.

import * as store from '../store/store';

async function resize(blob: Blob, max: number, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const hgt = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, hgt);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}

/** Stores a photo (max 1600 px) with a 400 px thumbnail; returns its blob id. */
export async function storePhoto(file: Blob, name?: string): Promise<string> {
  let main: Blob = file;
  try {
    main = await resize(file, 1600);
  } catch {
    /* keep original if it can't be decoded */
  }
  let thumb: Blob | undefined;
  try {
    thumb = await resize(file, 400, 0.8);
  } catch {
    thumb = undefined;
  }
  return store.putBlob(main, name, thumb);
}

export async function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, q));
}
