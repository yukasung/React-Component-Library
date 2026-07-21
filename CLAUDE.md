# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Internal reusable React 19 + TypeScript UI component library (`InputNumber`, `InputDate`, `Grid`) styled with Tailwind CSS v4. Ships as an ESM package built from `src/` into `dist/`. React and Tailwind CSS are peer dependencies, not bundled.

The repo contains **two independent npm projects**:
- **Root** (`package.json`) — the component library itself, plus a `demo/` playground app.
- **`docs/`** (`docs/package.json`) — a separate Next.js + Nextra documentation site with its own `node_modules`. It is *not* an npm workspace of the root; it depends on the library via a `file:..` dependency (see below). Root tooling (`eslint.config.js`, `tsconfig.json`, `npm run lint`/`typecheck`) explicitly ignores `docs/`.

## Commands

Run from the repo root unless noted.

```bash
npm run dev         # demo/playground app (Vite) at localhost:5173
npm run build        # library build: src/ -> dist/ (ESM + .d.ts)
npm run typecheck    # tsc --build (project references — see gotcha below)
npm run lint          # eslint .
npm run test          # vitest run (all tests, once)
npm run test:watch   # vitest (watch mode)
```

Run a single test file or a name pattern with vitest directly:
```bash
npx vitest run src/components/InputNumber/InputNumber.test.tsx
npx vitest run -t "clamps to max"
```

`docs/` has its own dev server, run from within that directory:
```bash
cd docs && npm run dev   # Next.js docs site at localhost:3000
```

## Architecture

### Commit model (core interaction pattern)

Input components do **not** call `onChange` on every keystroke. They track an in-progress typed string ("draft") separately from the committed, parsed `value`, using the `useSyncedState` hook (`src/hooks/useSyncedState.ts`) — it holds local draft state that resyncs to an external `value` only when that external value actually changes (compared during render, not via `useEffect`, to avoid an extra render/flicker).

The draft is only parsed, clamped, and committed (i.e. `onChange` fires) at explicit commit points: blur, Enter, a spin-button click, or an Arrow key press — never mid-typing. This lets users type through temporarily invalid or out-of-range intermediate values (e.g. `"1."`, `"-"`, or a number beyond `max`) without being blocked or clamped until they finish. `min`/`max` clamping is applied to the value being committed, not by re-reading the old `value` prop.

Pure parsing/formatting/clamping logic lives in `src/lib/number.ts` (`parseDraft`, `formatValue`, `clamp`, `applyPrecision`, etc.) and is unit-tested independently of the component.

### Boolean prop naming: `is`-prefix vs. native

Most boolean props follow native HTML/React convention (`truncate`, `handleWheel`, `repeatButtons`, and native passthroughs like `placeholder`). Three props are a deliberate exception: `isRequired`, `isReadOnly`, `isDisabled` use Wijmo's `is`-prefixed naming instead of the native `required`/`readOnly`/`disabled` convention, to match the Wijmo API these components are modeled after. Internally each still maps to the real native HTML attribute on the underlying `<input>` (e.g. `required={isRequired}`) — only the public React prop name differs. This split is intentional, not an oversight.

### `step` is the sole condition for the spin buttons (matches Wijmo)

There is no `showSpinButtons` prop. `step` (type `number | null`, default unset/`null`) is the *only* thing that determines whether the spin buttons, Arrow-key stepping, and `handleWheel` are active — matching Wijmo's actual behavior exactly (its `step` doc explicitly says the default `null` "hides the spinner buttons from the control"). No step means no defined increment amount, so there's nothing for any of those three interactions to step by; all three are gated on `typeof step === 'number'` (see `hasStep` in `InputNumber.tsx`). Any `InputNumber` usage that wants a visible spinner must pass an explicit `step`.

Wijmo (`developer.mescius.com/wijmo`) is used as an API/UX reference only — never copy its source or add a runtime dependency on it. `references/tailadmin-react/` (gitignored) is a visual styling reference only, same rule applies.

### `demo/` vs. `docs/`: two different consumers of the library

- `demo/vite.config.ts` aliases the package name `react-component-library` straight to `src/index.ts` — it imports library source directly for live dev, never `dist/`.
- `docs/` instead depends on the *built* package via `"react-component-library": "file:.."` in `docs/package.json`, resolving to `dist/index.js`/`dist/index.d.ts`. **After changing `src/`, you must run `npm run build` at the repo root before those changes are visible in `docs/`** — the docs dev server does not pick up source changes on its own.

### `vite-plugin-dts` tsconfig gotcha

`vite.config.ts` must pass `tsconfigPath: './tsconfig.lib.json'` explicitly to the `dts()` plugin. Root `tsconfig.json` is a references-only container (`"files": []`, just `references` to `tsconfig.lib.json`/`tsconfig.demo.json`/`tsconfig.node.json` for `tsc --build`); without the explicit `tsconfigPath`, `vite-plugin-dts` silently resolves that empty root config instead and emits an empty `dist/index.d.ts` (no build error — the JS output is still correct, only types go missing).

### `docs/` content scope

The docs site documents a property only once its corresponding Linear sub-issue (under the `React Component Library` project) has reached **"Reviewed"** status specifically — not merely "In Review". This is a deliberate, ongoing content policy, not a one-time gate.

The published docs content (`docs/app/components/**/*.mdx`) must **not** reference or link to Wijmo anywhere — no mentions, no links to `developer.mescius.com`, no "matches Wijmo API" framing in user-facing text. Wijmo stays an internal-only reference (see above); it should not be visible to anyone reading the docs site.

The published docs content must also **not** mention Linear or the Reviewed-status review process itself (e.g. "ผ่านสถานะ Reviewed บน Linear") — that's internal workflow, not something a docs reader needs to know. It's fine to say what's currently documented; just don't say why or via what process.

### Nextra patch

`docs/patches/nextra-theme-docs+4.6.1.patch` (applied via `patch-package`, wired through a `postinstall` script in `docs/package.json`) fixes an upstream bug: `nextra-theme-docs`'s `Layout` component destructures `children` out of props before passing the rest to Zod validation, which throws under Zod ≥4.4.x (see [shuding/nextra#5008](https://github.com/shuding/nextra/issues/5008)). Keep the patch until upstream releases a fix.
