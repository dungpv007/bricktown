/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// No @types/node in this project: read the environment without it.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

export default defineConfig({
  // The e2e dev server (playwright.config.ts) keeps its own dependency cache beside a developer's server.
  cacheDir: env.BT_VITE_CACHE_DIR ?? 'node_modules/.vite',
  plugins: [
    react(),
    VitePWA({
      // A new version waits until the app applies it from the main menu (src/pwa/registerUpdates.ts): taking
      // over mid-game would delete the chunk files the running version still needs for its next scene.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BrickTown',
        short_name: 'BrickTown',
        description: 'Xây thành phố, nhà hàng và lắp ráp xe bằng gạch',
        lang: 'vi',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#87ceeb',
        theme_color: '#e3000b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,wasm,json}'], // webp: the main menu's poster
        // Game models (the claw machine's prizes) are not part of the install: fetched when a game opens.
        globIgnores: ['models/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Background music is optional: not part of the install, cached the first time it plays (one
        // whole-file fetch, see src/audio/music.ts) and served offline from then on.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/[^/]+\.m4a$/,
            handler: 'CacheFirst',
            options: { cacheName: 'bt-audio', expiration: { maxEntries: 2 } },
          },
          {
            // 3D models a game loads when it opens (public/models/): cached the first time, offline after.
            urlPattern: /\/models\/.+\.glb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bt-models',
              expiration: { maxEntries: 8 },
              // Only a real model: never an error page, nor the app shell a host may serve for a missing file.
              cacheableResponse: { statuses: [200] },
              plugins: [{ cacheWillUpdate: async ({ response }) => (response.headers.get('content-type')?.includes('text/html') ? null : response) }],
            },
          },
        ],
        // The first install controls the open page right away (offline after one visit); later versions
        // only take over through the update flow, which reloads.
        clientsClaim: true,
      },
    }),
  ],
  build: {
    // three.js (~760 kB) and Rapier (its WASM is inlined as base64, ~2.2 MB) are single vendor chunks by
    // nature and only load with the scenes that need them; everything else stays far below this.
    chunkSizeWarningLimit: 2400,
    rolldownOptions: {
      output: {
        // Stable vendor chunks: the engine rarely changes, so it stays cached while app code is updated.
        codeSplitting: {
          groups: [
            // React and the state library the menu needs, in their own chunk: otherwise they land in the r3f chunk
            // (which also uses them) and drag three.js into the menu's first paint.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/, priority: 40 },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/, priority: 30 },
            // Not the glTF loader: only the claw machine uses it, so it stays in that game's own chunk.
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/](?!examples[\\/]jsm[\\/]loaders[\\/]GLTFLoader)/, priority: 20 },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/](fiber|drei)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  // Drive is lazy: pre-bundle its engine up front so the dev server never re-optimizes (and reloads the page) mid-session.
  optimizeDeps: { include: ['@react-three/rapier'] },
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
