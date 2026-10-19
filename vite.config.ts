import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// Strict Content Security Policy, injected in the built page only (the dev
// server needs inline scripts and websockets for hot reload).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "manifest-src 'self'",
].join('; ');

const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  base: './',
  // Older phones (iOS 14+) must still parse the bundle.
  build: { target: ['es2020', 'safari14', 'chrome87', 'firefox78'], chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  plugins: [
    csp(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Mon Crochet',
        short_name: 'Crochet',
        description: 'Patrons au crochet, compteur de rangs, aperçu 2D et 3D — hors ligne, sans compte.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#fbf7f2',
        theme_color: '#c2416b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        // OCR engines (~4 MB each) are cached the first time OCR runs.
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract', expiration: { maxEntries: 10 } },
          },
          {
            // OCR language data, downloaded only when needed.
            urlPattern: ({ url }) => url.origin === 'https://cdn.jsdelivr.net' && url.pathname.includes('tesseract.js-data'),
            handler: 'CacheFirst',
            options: { cacheName: 'tessdata', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
