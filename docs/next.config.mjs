import { fileURLToPath } from 'node:url'
import nextra from 'nextra'

const withNextra = nextra({})

// Points the "react-component-library" import straight at the library's
// TS source (mirroring how demo/vite.config.ts aliases it for the Vite
// playground) instead of the built dist/ output — so editing src/ shows up
// here immediately, with no `npm run build` step in between. Still keeps
// the "react-component-library": "file:.." dependency in package.json as
// a fallback/type-resolution safety net; this alias just wins first.
const srcEntry = fileURLToPath(new URL('../src/index.ts', import.meta.url))

export default withNextra({
  // Next only runs its TS/JSX transform on files it considers part of the
  // app by default — anything resolved into node_modules (including a
  // symlinked local package) is skipped unless explicitly listed here, so
  // the aliased src/ files still get compiled instead of erroring on raw
  // TSX syntax.
  transpilePackages: ['react-component-library'],
  // Two package-lock.json files exist (this docs/ project and the parent
  // component-library repo) — without this, Turbopack guesses the parent
  // directory as the workspace root, which resolves app/ from the wrong
  // place.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    resolveAlias: {
      'react-component-library': srcEntry,
    },
  },
  webpack: (config) => {
    config.resolve.alias['react-component-library'] = srcEntry
    return config
  },
})
