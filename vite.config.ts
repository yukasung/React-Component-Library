import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// Library build config: bundles src/ into dist/ as ESM + type declarations.
// react/react-dom are peerDependencies and must stay external (see plan Section 8).
export default defineConfig({
  plugins: [
    react(),
    dts({ bundleTypes: true, include: ['src'], insertTypesEntry: true, tsconfigPath: './tsconfig.lib.json' }),
  ],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        'input-number': fileURLToPath(new URL('./src/input-number.ts', import.meta.url)),
        'input-date': fileURLToPath(new URL('./src/input-date.ts', import.meta.url)),
        'input-time': fileURLToPath(new URL('./src/input-time.ts', import.meta.url)),
        'input-date-time': fileURLToPath(new URL('./src/input-date-time.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, entryName) => entryName,
      // InputDate imports flatpickr's CSS + our own theme override — Vite
      // extracts that into a standalone asset since a bundled ESM library
      // can't auto-inject a <style> tag. Named explicitly (rather than
      // defaulting to fileName) to match the "./style.css" subpath already
      // declared in package.json's "exports" map.
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
