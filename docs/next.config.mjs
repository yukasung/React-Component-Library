import { fileURLToPath } from 'node:url'
import nextra from 'nextra'

const withNextra = nextra({})

export default withNextra({
  // Two package-lock.json files exist (this docs/ project and the parent
  // component-library repo) — without this, Turbopack guesses the parent
  // directory as the workspace root, which resolves app/ from the wrong
  // place.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
})
