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

Most boolean props follow native HTML/React convention (`truncate`, `handleWheel`, `repeatButtons`, and native passthroughs like `placeholder`). Three props are a deliberate exception: `isRequired`, `isReadOnly`, `isDisabled` use Wijmo's `is`-prefixed naming instead of the native `required`/`readOnly`/`disabled` convention, to match the Wijmo API these components are modeled after. Internally each still maps to the real native HTML attribute on the underlying `<input>` (e.g. `required={isRequired}`) — only the public React prop name differs. This split is intentional, not an oversight. `InputDate`'s `isOpen`/`onOpenChange` (controlled calendar-dropdown open state) extends this same exception set, mirroring Wijmo's `isDroppedDown`.

### `step` is the sole condition for the spin buttons (matches Wijmo)

There is no `showSpinButtons` prop. `step` (type `number | null`, default unset/`null`) is the *only* thing that determines whether the spin buttons, Arrow-key stepping, and `handleWheel` are active — matching Wijmo's actual behavior exactly (its `step` doc explicitly says the default `null` "hides the spinner buttons from the control"). No step means no defined increment amount, so there's nothing for any of those three interactions to step by; all three are gated on `typeof step === 'number'` (see `hasStep` in `InputNumber.tsx`). Any `InputNumber` usage that wants a visible spinner must pass an explicit `step`.

Wijmo (`developer.mescius.com/wijmo`) is used as an API/UX reference only — never copy its source or add a runtime dependency on it. `references/tailadmin-react/` (gitignored) is a visual styling reference only — never copy its source or add a runtime dependency on it, **with one deliberate, scoped exception**: `InputDate`'s calendar dropdown is permitted to depend on and adapt `references/tailadmin-react/src/components/form/date-picker.tsx`, specifically via a real runtime dependency on `flatpickr` (an MIT-licensed third-party calendar library, listed in `dependencies` and bundled into `dist/index.js`, unlike React/Tailwind which stay external peer dependencies). This exception applies only to `InputDate`'s calendar popup — every other component, and every other use of `references/tailadmin-react/`, still follows the general visual-reference-only rule with no runtime dependency.

### `InputDate` + flatpickr: DOM-ownership escape hatch (required, not optional)

flatpickr mutates the DOM outside React's tracking — in `static: true` mode it wraps whatever element it's bound to in a new `.flatpickr-wrapper` div it creates itself, moving that element inside. If flatpickr is bound directly to a JSX-managed `<input ref={...} />` that React itself renders and later needs to remove, React's own commit-phase DOM removal (which runs *before* `useEffect` cleanups fire) still expects that input to be a direct child of the parent React originally committed it under. Since flatpickr has since moved it into `.flatpickr-wrapper`, React's `removeChild` call fails immediately with `NotFoundError: The node to be removed is not a child of this node` — confirmed to reproduce on a plain single mount+unmount, not just under `StrictMode`'s double-invoke.

The fix, and the pattern `InputDate` must use: render an **empty, React-opaque `<div ref={containerRef} />`** in JSX (React commits and tracks only this one div, never diffing anything inside it), then in `useEffect` **imperatively** `document.createElement` the actual input flatpickr binds to and `appendChild` it into that div. flatpickr's wrap/unwrap dance then happens entirely inside a subtree React was never tracking node-by-node, so `instance.destroy()` on cleanup is safe, and whenever React itself removes the outer container div, it does so as one atomic operation that doesn't care what flatpickr rearranged inside it. This is the standard React pattern for any third-party library that mutates DOM structure outside React's control (same category as jQuery-plugin/Google-Maps-widget wrappers) — don't bind flatpickr to a JSX-rendered leaf node directly, even though that looks simpler.

### `InputDate` Buddhist Era (`locale="th"`): why the year-header spinner is replaced, not patched

`locale="th"` switches `InputDate` to Thai month/weekday names *and* Buddhist Era (พ.ศ. = ค.ศ. + 543) years together — one combined prop, not independent language/era props (matches how Thai UIs conventionally pair the two; see the property's own doc comment in `InputDateProps` for the full rationale). Language is native flatpickr (`locale: Thai`, imported from `flatpickr/dist/l10n/th.js` — not the `esm/` path, which has no matching `.d.ts`). Buddhist Era has no flatpickr equivalent at all and is built entirely in `src/lib/date.ts` (`formatDateWithYearOffset`/`unshiftYearInDraft`) — see those functions' doc comments for the format/parse mechanism.

The one piece that can't be fixed by wrapping flatpickr's documented `formatDate`/`parseDate` config hooks (which the day-cell aria-labels do use): the calendar popup's own year-navigation spinner. flatpickr writes its value **directly** from the raw Gregorian year — `self.currentYearElement[type] = dateObj.getFullYear().toString()` — from *four* separate internal call sites (`jumpToDate`, `clear`, `changeYear`, generic `set()`), none of which route through any override hook. `InputDate` hides this native spinner (`instance.yearElements[0]`, scoped to `locale === 'th'`) and replaces it with a small plain-DOM control (not JSX/a portal — flatpickr's popup DOM lives entirely outside React's tree, same reasoning as the hidden-input escape hatch above) driven by flatpickr's own public `instance.currentYear`/`instance.changeYear()` API.

**A related flatpickr quirk this replacement's own effect has to route around**: calling `instance.set('showMonths', n)` — which `InputDate`'s own `monthCount` prop effect does, including redundantly on every mount, regardless of whether the value actually changed — triggers flatpickr's internal `buildMonths()`, which rebuilds `instance.yearElements` with fresh DOM nodes but **never reassigns the separately-cached `instance.currentYearElement`** (assigned once, only during the very first build). Read `instance.currentYearElement` after any `set('showMonths', ...)` call and you get a silently-detached, stale reference. The fix: always use `instance.yearElements[0]` instead (which *does* get refreshed), and make the custom-year-control effect depend on `[locale, monthCount]` together so it re-anchors itself whenever a `showMonths` rebuild could have invalidated its reference.

### `demo/` vs. `docs/`: two different consumers of the library

- `demo/vite.config.ts` aliases the package name `react-component-library` straight to `src/index.ts` — it imports library source directly for live dev, never `dist/`.
- `docs/next.config.mjs` aliases `react-component-library` straight to `src/index.ts` too (via `transpilePackages` + a `webpack`/`turbopack` `resolveAlias`), the same live-source pattern as `demo/` — **not** the built `dist/` output, despite `docs/package.json` still listing `"react-component-library": "file:.."` as a dependency (kept only as a type-resolution fallback). Editing `src/` shows up in `docs/`'s dev server immediately, with no `npm run build` step needed in between.

### `vite-plugin-dts` tsconfig gotcha

`vite.config.ts` must pass `tsconfigPath: './tsconfig.lib.json'` explicitly to the `dts()` plugin. Root `tsconfig.json` is a references-only container (`"files": []`, just `references` to `tsconfig.lib.json`/`tsconfig.demo.json`/`tsconfig.node.json` for `tsc --build`); without the explicit `tsconfigPath`, `vite-plugin-dts` silently resolves that empty root config instead and emits an empty `dist/index.d.ts` (no build error — the JS output is still correct, only types go missing).

### `docs/` content scope

The docs site documents a property only once its corresponding Linear sub-issue (under the `React Component Library` project) has reached **"Reviewed"** status specifically — not merely "In Review". This is a deliberate, ongoing content policy, not a one-time gate.

The published docs content (`docs/app/components/**/*.mdx`) must **not** reference or link to Wijmo anywhere — no mentions, no links to `developer.mescius.com`, no "matches Wijmo API" framing in user-facing text. Wijmo stays an internal-only reference (see above); it should not be visible to anyone reading the docs site.

The published docs content must also **not** mention Linear or the Reviewed-status review process itself (e.g. "ผ่านสถานะ Reviewed บน Linear") — that's internal workflow, not something a docs reader needs to know. It's fine to say what's currently documented; just don't say why or via what process.

### Nextra patch

`docs/patches/nextra-theme-docs+4.6.1.patch` (applied via `patch-package`, wired through a `postinstall` script in `docs/package.json`) fixes an upstream bug: `nextra-theme-docs`'s `Layout` component destructures `children` out of props before passing the rest to Zod validation, which throws under Zod ≥4.4.x (see [shuding/nextra#5008](https://github.com/shuding/nextra/issues/5008)). Keep the patch until upstream releases a fix.
