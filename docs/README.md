# Documentation site

This is an independent Next.js + Nextra npm project, not a root workspace.
Use the root project's documented development Node range (20.19+ on 20.x,
22.13+ on 22.x, or 24+) when working on both projects.

Install the root dependencies first with `npm ci` from the library directory,
then run these commands from `docs/`:

```bash
npm ci
npm run dev    # http://localhost:3000
npm run build  # production documentation build
```

The install applies the checked-in Nextra patch through `patch-package`.
The docs lockfile is independent of the root lockfile.

From the library root, `npm run build:docs` runs this production build and
`npm run validate` includes it after the root lint, typecheck, tests, and library
build. Package-quality and publishing CI install both lockfiles and run this
combined validation. Keep the docs source-alias compilation check enabled:
it catches compatibility failures outside the root TypeScript configuration.

The package name `@yukasung/react-components` is aliased to `../src/index.ts`
for live examples. This does not test the published bundle. Root
`npm run build` verifies the package output separately.

`app/globals.css` imports the generated scalar stylesheet and InputTag styles
explicitly because Next's barrel optimization may skip the root CSS import.
After changing scalar utility classes or the calendar theme, run
`npm run generate:styles` from the library root.

Copyable examples use the real package name. Published-package consumers must
also import `@yukasung/react-components/style.css` once at their application
entry point, as described in the root README. The docs site's source aliases
and explicit CSS imports are development configuration, not consumer setup.
