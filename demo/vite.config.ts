import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Demo/Playground app: simulates a TailAdmin-based consumer importing the
// library. Aliases the package name to source (not dist) for live dev.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      'react-component-library': fileURLToPath(
        new URL('../src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-demo', import.meta.url)),
    emptyOutDir: true,
  },
})
