import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// Library build config: bundles src/ into dist/ as ESM + type declarations.
// react/react-dom are peerDependencies and must stay external (see plan Section 8).
export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], insertTypesEntry: true, rollupTypes: false }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
