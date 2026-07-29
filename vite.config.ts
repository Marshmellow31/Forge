import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    /**
     * Installable PWA — ROADMAP 1.17.
     *
     * The caching strategy is where the thought went. Two rules drive it:
     *
     * 1. **Never cache Firestore or Auth.** Their traffic is authenticated and
     *    frequently mutated; a stale cached response would show one person
     *    another person's data or resurrect a deleted challenge. The Firestore
     *    SDK already has its own IndexedDB persistence (`core/firebase/app.ts`)
     *    which understands documents, permissions and invalidation — a service
     *    worker caching the same requests by URL would fight it and lose.
     * 2. **Cache what is immutable and expensive.** Hashed build assets, fonts,
     *    and Drive-hosted cover images are all safe to serve from cache.
     */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Forge — run any challenge',
        short_name: 'Forge',
        description:
          'Create, run, judge and reward challenges of any kind. Registration, submissions, judging and results in one place.',
        theme_color: '#FDF8EC',
        background_color: '#FDF8EC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/home',
        scope: '/',
        categories: ['productivity', 'education', 'business'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // `maskable` is a separate entry with a wider safe area — a launcher
          // crops it to its own shape, and the plain icon would lose its arms.
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Discover challenges', short_name: 'Discover', url: '/discover' },
          { name: 'My entries', short_name: 'Entries', url: '/me/registrations' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // Client-side routing: any navigation resolves to the app shell.
        navigateFallback: '/index.html',
        // …except these, which are not app routes and must hit the network.
        navigateFallbackDenylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // See rule 1 above. This entry exists to be explicit rather than to
            // rely on the absence of a matching rule.
            urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Drive-hosted covers. Opaque cross-origin responses are status 0,
            // hence the explicit allowance.
            urlPattern: /^https:\/\/drive\.google\.com\/thumbnail.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'drive-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Off in dev: an auto-updating service worker and HMR interfere, and a
        // stale precache during development is a confusing bug to chase.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@mock': path.resolve(__dirname, 'src/mock'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
  build: {
    // Vendor code changes far less often than app code. Splitting it means a
    // redeploy invalidates only the small app chunk and leaves the large
    // vendor chunks cached in every viewer's browser and on Vercel's CDN.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
          // Auth and Firestore are split rather than bundled together: the
          // Firestore SDK is by far the largest dependency in the app and
          // changes on a different release cadence from Auth, so keeping them
          // apart means a Firebase bump usually invalidates only one of the
          // two in every returning visitor's cache. They also download in
          // parallel rather than as one serial 780 kB chunk.
          'firebase-core': ['firebase/app'],
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          query: ['@tanstack/react-query'],
        },
      },
    },
    // The vendor chunks are legitimately large; the warning is noise once they
    // are deliberately split and long-cached.
    chunkSizeWarningLimit: 700,
  },
  // Honour PORT when the environment assigns one, so several instances can run
  // side by side; 5173 stays the default for a plain `npm run dev`.
  server: { port: process.env.PORT ? Number(process.env.PORT) : 5173 },
});
