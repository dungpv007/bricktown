/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/]/, priority: 20 },
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
