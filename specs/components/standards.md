# Component standards

Reusable rules for React input components in this library, derived from the
five that already exist. A rule is here only if it applies across components;
anything specific to one component belongs in that component's spec, and
anything about code that already exists belongs in `CLAUDE.md`.

**This document does not restate `CLAUDE.md`.** That file is authoritative for
the commit model, the Wijmo prop-surface scope rule, the group-editing
(`maskTemplate`) contract, the flatpickr DOM-ownership escape hatch, the
`demo/` vs `docs/` split and the docs content policy. Read it first; the rules
below are the parts a *new* component has to satisfy, stated as requirements.

Status markers used below:

- **[C]** consistent — all applicable existing components do this.
- **[I]** inconsistent — existing components disagree; the standard states
  which side new components take.
- **[O]** open — no project standard exists yet; a new component must not
  invent one silently. Raise it.

---

## 1. Structure and packaging

1.1 **[C]** One directory per component: `src/components/<ComponentName>/`.
The minimum it contains is `<ComponentName>.tsx`, `<ComponentName>.test.tsx`
and an `index.ts` that re-exports **only** the component and its props type.
Anything further in that directory is a split by role, per 1.3 — not a place
for unrelated code.

1.2 **[C]** Pure logic (parsing, formatting, clamping, range rules) lives in
`src/lib/<domain>.ts` with its own `<domain>.test.ts`, and is unit-tested
without rendering the component. A component file holds React wiring and
markup, not algorithms.

1.3 **[C]** A component larger than roughly one screenful of concerns splits
by role, not by size — `InputDateTime` is the reference: `useX.ts` for the
field logic, `<Name>.tsx` for props/markup, `styles.ts`/`icons.tsx`/sub-views
for what is purely rendered.

1.4 **[C]** Every component gets a subpath entry point, and adding one means
editing **five** places. Doing fewer leaves a build that fails, or — worse —
one that passes without verifying the new entry:

1. `src/<kebab-name>.ts` — exports the component, its props type and its
   public helpers.
2. `src/index.ts` — the same exports, added to the barrel.
3. `package.json` — an `exports["./<kebab-name>"]` block with `types` and
   `import`.
4. `vite.config.ts` — a `build.lib.entry` key named `<kebab-name>` pointing at
   the file from (1). Without it nothing is emitted to `dist/`, and (3)'s
   target does not exist.
5. `scripts/verify-package.mjs` — **both** lists: `expectedEntries` and
   `components`. They are matched **by index**
   (`expectedEntries.slice(1)[i]` ↔ `components[i]`), so appending to one
   and not the other silently verifies the wrong component. If the new
   component cannot render from `{ 'aria-label': name, defaultValue: null }`,
   or does not carry the `rc-scalar` scope, the per-component branches in that
   file need a case for it as well.

1.5 **[C]** No new runtime dependencies without an explicit decision. The
library ships one (`flatpickr`); `react`, `react-dom` and `tailwindcss` are
peer dependencies. Reference libraries (Wijmo, TailAdmin) are never runtime
dependencies.

## 2. Public API

**Two kinds of component, and most rules below apply to only one.** A
**scalar** input edits a single value through a single `<input>` — a number, a
date, a time, a masked string (`InputNumber`, `InputDate`, `InputTime`,
`InputDateTime`). A **collection** input edits a set of values through a
composite widget (`InputTag`). Each rule below is tagged **(scalar)**,
**(collection)** or **(both)**. A rule tagged **(scalar)** is not a gap to be
filled in a collection component: adding `format` or `text`/`onTextChange` to
something that has no single draft string is added surface, which §8.3
forbids.

2.1 **(both)** **[C]** Props interface is `export interface <ComponentName>Props`,
exported from the component file and re-exported through `index.ts`, the
subpath entry and `src/index.ts`.

2.2 **(scalar)** **[C]** A single-`<input>` ("scalar") component extends
`Omit<InputHTMLAttributes<HTMLInputElement>, …>`, omitting exactly the native
props it redefines: `'value' | 'defaultValue' | 'onChange' | 'type' | 'required' | 'readOnly' | 'disabled'`
plus any of `'min' | 'max' | 'step'` it redefines. Everything else native
(`className`, `id`, `name`, `placeholder`, `onFocus`, `onBlur`, …) passes
through via `...rest` onto the `<input>`.

2.3 **(both)** **[C]** Controlled/uncontrolled: `value?: T` /
`defaultValue?: T`, with `const isControlled = value !== undefined` and
internal `useState` otherwise, and
`onChange?: (value: T) => void` — **the parsed value, never an event**.

What `T` is, and what the default is, follows the kind:

- **(scalar)** `T = <DomainType> | null`, `defaultValue = null`. `null` is the
  empty field.
- **(collection)** `T = readonly <ItemType>[]`, `defaultValue = []`. The empty
  collection is the empty field; `null` is not used
  (`InputTag: readonly string[]`, default `[]`).

2.4 **(both)** **[C]** State props use the `is`-prefix set: `isRequired`,
`isReadOnly`, `isDisabled`. **(scalar)** each maps onto the real native
attribute on the `<input>` (`required=`, `readOnly=`, `disabled=`);
**(collection)** onto the equivalent ARIA state and behavior, stated per
§5.4. Every other boolean uses native/plain naming (`handleWheel`, `truncate`, `showDropdownButton`, `portal`). This split
is deliberate — see `CLAUDE.md`.

2.5 **(both)** **[I]** Defaults: `isDisabled = false`, `isReadOnly = false`,
`isRequired = true`. The four scalar inputs default `isRequired` to `true`;
`InputTag` defaults it to `false`. **New scalar inputs default `isRequired` to
`true`** and must document what "required" does to the displayed value
(`InputNumber` shows `0`; `InputDate`/`InputTime` refuse to blur empty and
revert).

2.6 **(scalar)** **[C]** Draft text is exposed as a two-way pair `text?: string` /
`onTextChange?: (text: string) => void`, with the contract stated in
`InputNumber`'s doc comment: setting `text` overrides the draft verbatim,
`onTextChange` fires for any internal text change but never echoes a `text`
prop the consumer just set. A component with no single editable draft string
has no `text` pair and must not grow one.

2.7 **(scalar)** **[C]** Display formatting is a `format?: string` prop with a documented
token vocabulary and a documented fallback when the format cannot be honoured
(fall back to a format that renders correctly — never render something subtly
wrong). Only where the value has more than one valid rendering: a component
whose value is already its own display has no `format`.

2.8 **(both)** **[C]** Every icon is overridable (`<x>Icon?: ReactNode`) and every
generated accessible name is overridable (`<x>AriaLabel?: string`) with an
English default.

2.9 **(both)** **[C]** Popup/overlay state never appears in the prop surface — no
`isOpen`, no `onOpenChange`. `aria-expanded` is the only outward trace.

2.10 **(both)** **[I]** Ref: scalar inputs use `forwardRef<HTMLInputElement, Props>` with
a named inner function; `InputTag` takes `ref?: Ref<HTMLDivElement>` as a prop.
**New components use `forwardRef`** and forward to the element a form library
would focus. Where the component wraps the input in a div, the ref still points
at the `<input>`, not the wrapper.

2.11 **(both)** **[C]** Prop names are chosen against the reference API (Wijmo) where one
exists, with casing normalized and events mapped to `on*`. A prop with no
counterpart needs a documented reason in its own doc comment. See `CLAUDE.md`.

## 3. TypeScript

3.1 **[C]** Strict TS, no `any`, no non-null assertions in component code;
`tsc --build` via `npm run typecheck` is part of validation.

3.2 **[C]** Public value types are real domain types (`number | null`,
`Date | null`, `readonly string[]`), never strings-that-mean-something-else.
Read-only arrays for collection values.

3.3 **[C]** Union literal types for enumerations (`locale?: 'en' | 'th'`), not
string + runtime validation.

3.4 **[C]** `null` means "no value"; `undefined` means "not supplied / use the
default". Parsers distinguish them deliberately (`parseDateDraft` returns
`null` for empty and `undefined` for invalid).

3.5 **[C]** Every non-obvious prop carries a `//` doc comment above it
explaining the contract and, where the choice was contested, the reason.

## 4. Behavior

4.1 **[C]** **Commit model.** `onChange` never fires per keystroke. The typed
draft is held locally (`useSyncedState`) and parsed/clamped/committed only at
explicit commit points: blur, Enter, and each deliberate value gesture
(spin click, Arrow key, wheel notch, popup selection). See `CLAUDE.md`.

4.2 **[C]** The committed `value` is the only submission-worthy output. Draft
text is display-only.

4.3 **[C]** Bounds (`min`/`max`) are applied to the value being committed, not
to the draft while typing, and are clamped at the component's own value
granularity.

4.4 **[C]** `isReadOnly` keeps the field focusable and its value submittable
but blocks every value change. `isDisabled` blocks interaction and excludes the
field from submission. A component with a third editability axis states it as
its own prop (`InputTime.isEditable`).

4.5 **[C]** Escape reverts the draft to the committed value without committing.

4.6 **[C]** Consumer event composition uses `src/lib/inputEvents.ts`:
`composeInputEvent` for `onKeyDown`/`onClick`/`onMouseDown` (consumer first,
`preventDefault()` cancels the internal action) and `afterInputEvent` for
`onFocus`/`onBlur` (internal bookkeeping and the commit run first, so a
commit-time `onChange` precedes the consumer's `onBlur`). Not optional — it is
a documented consumer contract in `README.md`.

4.7 **[C]** `handleWheel` is opt-in (`false`) and focus-gated.

## 5. Validation and error state

5.1 **[O]** The library has **no** `error`, `isInvalid`, `errorMessage`,
`helperText` or `label` props on any component, and no error styling. Feedback
is the consuming form's job; the component exposes `aria-invalid`,
`aria-describedby` and `aria-errormessage` for it to wire up.

5.2 **[I]** Scalar inputs receive those ARIA attributes implicitly through
`InputHTMLAttributes` passthrough; `InputTag` declares them explicitly because
it does not extend an input's attributes. Either is acceptable; a component
that does not extend `InputHTMLAttributes` **must** declare them.

5.3 **[C]** Invalid input is rejected or reverted, never silently normalized
into a different value. A draft that cannot be parsed at commit time restores
the previous committed value.

5.4 **[C]** `isRequired` on a scalar input sets the native `required`
attribute; on `InputTag` it sets `aria-required` only and the consumer must
validate. A new component states explicitly which of the two it does.

## 6. Accessibility

6.1 **[C]** The control is a real `<input>` (or, for a non-text control, a
focusable element with an explicit role). No `div` pretending to be a field
without a role.

6.2 **[C]** A field with a popup is `role="combobox"` with `aria-expanded`,
`aria-haspopup` (`"listbox"` or `"dialog"` — whichever the open popup is),
`aria-controls` naming the open popup's `useId`-generated id,
`aria-autocomplete="none"`, and `aria-activedescendant` while a list option is
active. A field with stepping and no popup is `role="spinbutton"` with
`aria-valuenow`/`aria-valuetext`/`aria-valuemin`/`aria-valuemax` — and only
while stepping is actually configured; otherwise it stays a plain textbox.

6.3 **[C]** Ids are generated with `useId`, never hand-built.

6.4 **[C]** Keyboard: Arrow keys perform the value gesture, Alt+Arrow toggles
the popup, Enter commits, Escape reverts and/or closes and returns focus to the
field, Tab follows the natural form order and closes any popup. Popup buttons
are `tabIndex={-1}` so they do not add tab stops.

6.5 **[C]** Every interactive element inside the control has an accessible
name, supplied by an overridable `*AriaLabel` prop.

6.6 **[O]** `inputMode` is set only on `InputNumber` (`"decimal"`).
`InputDate`, `InputTime` and `InputDateTime` set none, so mobile keyboards are
alphabetic on digit-only fields. **A new digit-entry component must decide
`inputMode` explicitly in its spec** rather than inheriting this gap.

## 7. Styling

7.1 **[I]** Two styling systems exist. The four scalar inputs use Tailwind
utility classes in TSX, compiled into `src/scalar-utilities.css` by
`scripts/generate-scalar-styles.mjs` and scoped to `.rc-scalar`. `InputTag`
uses a hand-written BEM stylesheet (`input-tag.css`, `.rc-input-tag__*`).
**A new scalar input uses the `.rc-scalar` Tailwind path.**

7.2 **[C]** The root element carries `rc-scalar` plus the consumer's
`className`, concatenated last in the string.

That ordering is **not** an override guarantee, and must not be documented as
one: CSS resolves by specificity first and by order **within the stylesheet**
second — never by the order of names in a `class` attribute. A consumer's
`.my-field { border-color: red }` loses to the library's own
`:where(.rc-scalar, .rc-scalar *).border-gray-300` only if it is less specific
or declared earlier; it does not win by being last in `className`.

What the library actually guarantees, and what a component must preserve:

- The generated stylesheet wraps utilities in
  `:where(.rc-scalar, .rc-scalar *)`, which adds **zero** specificity. A
  library utility therefore has the specificity of a bare single class
  (0,1,0) — so any consumer selector of equal specificity that loads after the
  library stylesheet wins, and any more specific one wins regardless of order.
- The consumer's `className` reaching the root element at all is what makes
  that possible; dropping it, or placing it where a component-owned class can
  shadow it at higher specificity, is the real defect to guard against.
- Consumers who need a guarantee independent of load order use the themeable
  custom properties (`--rc-color-primary`, `--rc-z-popup`), which cross the
  portal boundary as well (§7.8).

A component that needs a consumer-overridable value beyond colour and layer
adds a custom property for it rather than relying on class ordering.

7.3 **[C]** Adding a scalar component **requires** adding its class-bearing
source files to the `sources` array in
`scripts/generate-scalar-styles.mjs` and running `npm run generate:styles`.
Classes not listed there are not compiled and the component renders unstyled in
`demo/` and `docs/`. `node scripts/generate-scalar-styles.mjs --check` detects
staleness.

7.4 **[C]** No global reset, no Tailwind theme, no CSS custom property
registrations may escape the scope. `src/style.test.ts` and
`scripts/verify-package.mjs` enforce this; new required declarations go into
`verify-package.mjs`'s `requiredStyles` list.

7.5 **[C]** Shared visual language: `h-11` field height, `rounded-lg`,
`border-gray-300` / `dark:border-gray-700`, `text-sm`, `shadow-theme-xs`,
brand focus ring (`focus:ring-3` + `ring-brand-500/20`, or `focus-within:` when
the border lives on a wrapper), `placeholder:text-gray-400`. Dark mode via the
`dark:` variant on every colour-bearing class — not optional.

7.6 **[C]** Disabled and read-only have distinct treatments:
disabled = `cursor-not-allowed` + `bg-gray-100` + `opacity-40`;
read-only = `cursor-default` + `bg-gray-50`.

7.7 **[C]** There are **no size variants**. One field size, `h-11`. Do not add
one without a decision.

7.8 **[C]** Portalled surfaces resolve their layer through
`src/lib/layering.ts`: `portalZIndex` prop → `--rc-z-popup` custom property →
`DEFAULT_POPUP_Z_INDEX`, and carry the field's `.dark` class and
`--rc-color-primary` across the portal boundary.

## 8. Reuse

8.1 Before writing anything new, use what exists:

| Need | Use |
| --- | --- |
| Draft state that resyncs to a controlled `value` | `src/hooks/useSyncedState.ts` |
| Composing consumer/internal event handlers | `src/lib/inputEvents.ts` |
| Caret/selection handling on the input | `src/lib/domSelection.ts` |
| Portal z-index resolution | `src/lib/layering.ts` |
| Format → fixed-width segments, acceptance rules, placeholder, diffing | `src/lib/inputMask.ts` |
| Fixed-width group editing of a field | `src/lib/maskTemplate.ts` |
| Dropdown list open/close/keyboard | `src/components/InputTime/useTimeDropdown.ts` |

8.2 **[C]** Pure rules are shared; React wiring is deliberately **not** shared
between components. `InputDate`, `InputTime` and `InputDateTime` each hold
their own copy of the group-editing wiring so each stays usable alone. A new
component follows the same rule: import the pure module, copy the wiring.

8.3 **[C]** Do not add a second way to do something that already has one. The
draft-mutating masker was deleted rather than kept alongside the group editor.

8.4 Do not refactor an existing component to enable a new one without a
separate, approved decision.

## 9. Testing

9.1 **[C]** Vitest + `@testing-library/react` + `@testing-library/user-event`,
jsdom, `src/test/setup.ts`. Behavior is tested through the rendered component
by role and visible value — no snapshots, no internal-state assertions.

9.2 **[C]** Pure `src/lib/` modules have their own unit tests covering the
rules directly; the component test covers the wiring, not the algorithm.

9.3 **[C]** Test files sit next to their subject and are organized into
`describe` blocks named after the prop or behavior under test (`min / max`,
`isDisabled`, `isRequired`, `placeholder`, `ARIA`, `keyboard`, …), so coverage
of the prop surface is legible from the block names.

9.4 **[C]** Required coverage for a new input, at minimum: controlled and
uncontrolled use; external `value` change does not re-fire `onChange`; every
commit point; draft rejection/revert; `min`/`max` clamping; `isDisabled`,
`isReadOnly`, `isRequired`; `placeholder`; `text`/`onTextChange`; keyboard;
ARIA attributes; paste/autofill ("text the field is given rather than typed");
StrictMode mount/unmount safety.

9.5 **[C]** Cross-component suites must be extended, not bypassed: add the new
component to the `cases` array in `src/components/scalarEvents.test.tsx` (the
consumer event-composition contract) and to `src/scalar-styles.test.tsx` (the
style-scope contract).

9.6 **[C]** Keyboard typing into a group-edited field is driven from `keydown`
(`user.type(input, keys, { skipClick: true })` or `fireEvent.keyDown`), never
from a click-then-type, which lands the caret in the last group.

## 10. Documentation and demo

10.1 **[C]** `docs/app/components/<kebab-name>/` gets three files:
`page.mdx`, `demo.tsx` (one exported `*Demo` component per documented
property, each showing the committed value below the field) and
`property-index.tsx` listing the properties in documentation order. Register
the page in `docs/app/components/_meta.js`.

10.2 **[C]** `page.mdx` structure: `metadata` (Thai `description`), an intro
line and a `<DefaultDemo />`, `## Import`, `## Properties` with
`<PropertyIndex />`, then one `### <propName>` section per property with a
`<PropertySignature />`, Thai prose, a demo and a `tsx` snippet. Prose is
Thai; code, prop names and types are not translated.

10.3 **[C]** Docs content must not mention Wijmo, Linear, issue numbers or any
part of how the work gets reviewed — internal workflow is not something a docs
reader needs. There is **no** review-status gate on what may be documented: a
property is documented once it is implemented and its behaviour is settled.
See `CLAUDE.md`.

10.4 **[C]** `demo/App.tsx` gets a `<Section>` for the component exercising the
live states developers need to eyeball, including at least one
overflow/portal case if the component has a popup.

10.5 **[C]** `README.md` gains the component's entry point in the published
entry-point list, and a `###` section for any consumer contract that is not
obvious from the prop table (form integration, keyboard contract, layering).

10.6 **[C]** `CHANGELOG.md` entry for the release that adds the component.

## 11. Validation gate

11.1 **[C]** `npm run validate` (= `lint` → `typecheck` → `test` → `build` →
`build:docs`) must pass before a component is considered done. `build`
regenerates styles and runs `verify:package`.

11.2 **[C]** `npm run generate:styles` must have been run and its output
committed; `--check` must report no staleness.
