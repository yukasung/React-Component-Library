# MultiSelect — Implementation plan

**Status:** approved and **implemented**. This document describes what was
built, not what was intended — where the two diverged during implementation the
text was corrected, and the divergences worth knowing about are §0.5's role
split, §1.7a's helper signatures, §2.2's derived visible set and §4.5a's
asymmetric focus/blur boundary tests.

Implements [`requirements.md`](requirements.md). Rules inherited
from [`../standards.md`](../standards.md) and `CLAUDE.md` are not restated.

This document is about *how*. Where it names a behaviour it cites the
requirement that owns it; where it proposes something with no behavioural
consequence, that is this document's own business and needs no re-approval
(`specs/README.md`).

---

## 0. Existing-code analysis

### 0.1 Reused as-is, by import

| Module | What for |
| --- | --- |
| `src/lib/inputEvents.ts` | `composeInputEvent` for `onKeyDown`/`onClick`/`onMouseDown`, `afterInputEvent` for `onFocus`/`onBlur`. Required by `standards.md` §4.6 and by the cross-component contract suite (§6). |
| `src/lib/layering.ts` | `readPopupZIndex` + `DEFAULT_POPUP_Z_INDEX` for the portalled popup's layer, per §7.8 and R12.3. |

That is the whole import list, and it is short for reasons worth stating
rather than leaving to look like an oversight — §0.2 and §0.3.

### 0.2 Listed in §8.1 as reusable, and deliberately **not** imported

`standards.md` §8.1 is a table of what to use before writing anything new.
Three of its rows look like they apply here and do not. Each is addressed
because "I did not use the thing the standard told me to use" has to be a
decision, not a silence.

**`src/hooks/useSyncedState.ts` — not used.** It exists to hold a *draft* that
diverges from a controlled `value` and resyncs when that value changes.
`MultiSelect` has no draft (R4.4): a toggle commits immediately, so the
selection is a plain controlled/uncontrolled pair over `useState`, exactly as
`InputTag` does it. The filter text is popup state (R5.6) that never
corresponds to a prop, so it has nothing to resync *to*. Importing the hook
would add a resync path for a divergence that cannot occur.

**`src/lib/domSelection.ts` — not used.** The field `<input>` is `readOnly`
and holds derived text (R9.1); there is no caret model to place. The filter
input's caret is the browser's own and is never programmatically positioned
(R9.6 hands `Home`/`End`/arrows straight to it).

**`src/components/InputTime/useTimeDropdown.ts` — reused as a model, not
imported.** This is the closest call in the plan, and §8.1 names it for exactly
this job ("dropdown list open/close/keyboard"). Three parts of its contract are
wrong here, and none can be fixed without editing it, which §8.4 forbids:

- Its highlight is seeded from a single `selectedIndex` and it documents
  "opening always starts from the current value". A multiple selection has no
  single current value, and the useful seed here is the first *visible* row
  (R13.2), which changes as the filter changes.
- It assumes focus stays on the field, because `InputTime`'s popup is a
  `listbox` that may keep focus outside. R9.5 requires DOM focus to move into
  a `dialog` popup, and R9.7 requires `Tab` to walk up to three focus stops
  inside it. There is nothing in `useTimeDropdown` for either.
- Its item count is the whole list. Here the navigable set is the *filtered*
  set, which changes under the highlight between renders.

What is carried across deliberately, because both are hard-won and neither is
about time:

- **Clamp the stored index on read, not by an effect.** A shrinking list — a
  narrowing filter, here — strands a stored index past the end, and correcting
  it with state-that-fixes-state costs a render and gives one value two
  writers. Its comment says so; the copy keeps the reasoning.
- **Scroll by setting `scrollTop`, never `scrollIntoView`.** The latter scrolls
  the page to reach a portalled popup in some browsers and **is not implemented
  in jsdom at all**, so every test touching the list would throw.

**`src/components/InputTime/TimePopup.tsx` — reused as a model, not imported.**
Its placement, dark-class propagation, `--rc-color-primary` forwarding and
`readPopupZIndex` fallback are exactly what R12.3 needs. But it applies
`maxHeight` to the popup root and observes that same node for `scrollHeight`,
and R12.4 requires the filter input and select-all checkbox to sit *outside*
the scroll area — so the capped, observed node is the inner listbox, not the
root. That is a different node relationship, not a prop.

### 0.3 React wiring: copied, not shared

`standards.md` §8.2 and `CLAUDE.md` both state the rule — pure rules are
shared, React wiring is deliberately duplicated so each control stays usable on
its own. §0.2's two "model, not import" entries are that rule applying, not
exceptions to it.

**The cost is named so it is not discovered later as a defect:** the popup
placement maths will exist twice, in `TimePopup.tsx` and in
`MultiSelect/OptionPopup.tsx`, roughly a hundred lines. Extracting a shared
popup primitive is worth doing and is **out of scope** — it would edit a
shipped control, which §8.4 makes a separate, separately approved change. This
plan does not touch `InputTime`, `InputTag` or any other existing component's
source (R1.6).

### 0.4 Dependencies

No new runtime dependency (`standards.md` §1.5). Nothing here needs a platform
API beyond what the library already uses: `ResizeObserver` and
`MutationObserver` for placement (as `TimePopup` already does),
`String.prototype.toLocaleLowerCase` for R11.3.

### 0.5 New code, and why each piece has to be new

| New file | Why nothing existing covers it |
| --- | --- |
| `src/lib/optionList.ts` | No module anywhere derives a header summary, filters an option list, or computes a tri-state select-all. `InputTag` does its own matching inline in TSX, which §1.2 forbids for new code. |
| `src/components/MultiSelect/useMultiSelectField.ts` | The value layer: the controlled/uncontrolled pair, the commit, the derived header, and `checkOnFilter`'s gate 2. |
| `src/components/MultiSelect/useOptionDropdown.ts` | Open state, the filtered set, the active row over it, and the focus-stop ring of R9.5/R9.7 (§0.2). |
| `src/components/MultiSelect/OptionPopup.tsx` | Placement with the cap on the inner listbox (§0.2). |
| `src/components/MultiSelect/OptionRow.tsx` | One row, purely rendered. |
| `src/components/MultiSelect/styles.ts` | Class strings, kept out of the markup. |
| `src/components/MultiSelect/MultiSelect.tsx` | Props, the two hooks' composition, keyboard and focus coordination, markup. |
| `src/components/MultiSelect/icons.tsx` | The chevron and check marks, per §2.8's overridable-icon rule. |

The split follows `standards.md` §1.3 and uses `InputDateTime` as its reference:
`useMultiSelectField` is to this control what `useDateTimeField` is to that one —
everything that works on the value alone — while the component keeps the props,
the popup coordination and the markup. The field hook deliberately knows nothing
about the popup: it takes the visible set as an argument wherever a rule needs
it, which is what makes "a filter never changes the value" true by construction
rather than by discipline.

**What was considered and not split out:** the four keyboard handlers. They are
~140 lines and would be the obvious next extraction, but they close over the
dropdown, the field, `visible`, `applyFilterText`, `closeToField`, `moveTab` and
`openWith` — a hook taking that many bindings is displacement, not a role. They
are coordination, which §1.3 assigns to the component, and the per-focus-stop
split already makes each one readable on its own.

### 0.6 Module naming

R14.3 left the pure module's name to this document. It is
**`src/lib/optionList.ts`**, named for what it holds — option-list rules:
ordering, filtering, summarising, select-all. Not `multiSelect.ts`: naming a
`lib/` module after one component is exactly how `src/lib/inputMask.ts` came to
be routinely confused with the `InputMask` component (`CLAUDE.md`, and that
spec's R13.1), and this plan is not going to reproduce that in the same
release. Nothing about these rules is specific to this control, so nothing in
the name should be either.

---

## Task groups

Each group ends green: `npm run lint && npm run typecheck && npm run test` pass
before the next begins. Group 1 is pure and has no React, so it lands first.

### 1. Option-list rules — `src/lib/optionList.ts`

Pure, no React, no DOM. Every rule in §§2–6 of the requirements that is an
algorithm rather than wiring lives here, so it is unit-tested without rendering
(`standards.md` §1.2, §9.2).

1.1 `MultiSelectOption` — `{ value: string; label: string }` (R2.1). Declared
here and re-exported by the component, not the reverse: the component may not
be the source of truth for a type `lib/` operates on.

1.2 `uniqueOptions(options)` — drops later duplicates by `value`, first wins
(R2.6). Every other function takes its output, so the de-dup happens once.

1.3 `normalizeSelection(selected, options)` — the canonical committed array:
de-duplicated (R13.5), matched values in `options` order, unmatched values
after them in arrival order (R2.4, R2.5). **Every array this module returns and
every array handed to `onChange` passes through this**, which is what makes
"canonical order" a property of the type rather than a convention each call
site remembers.

`options` here is always the **full** list, never a filtered subset — which is
why 1.8–1.10 take it as well (1.7a).

1.4 `selectedOptions(selected, options)` — the matched options in committed
order, with unmatched values as `{ value, label: value }` (R2.5, R3.7), so no
consumer callback and no header path has to handle a missing label.

1.5 `formatHeader(checked, { headerFormat, maxHeaderItems })` — R3.2–R3.6:
empty → `''`; `length <= maxHeaderItems` → labels joined `', '`;
otherwise `headerFormat` with every literal `{count}` replaced by
`String(count)`. `maxHeaderItems: 0` falls into the count branch from the first
item (R3.6). A `{count:n0}`-style token is **not** matched and is left verbatim
(R3.5) — the replacement is a literal `{count}`, not a regex over
`\{count[^}]*\}`, and a test pins that.

1.6 `filterOptions(options, filterText, { caseSensitiveSearch, customFilter })`
— R5.2, R5.3, R5.3a, R5.3b, R11.3. Empty `filterText` returns the list unchanged
**unless a `customFilter` is supplied**, which is consulted for every text
including `''` (R5.3a). Default
test is `label.includes(text)`, both sides `toLocaleLowerCase()` unless
`caseSensitiveSearch`. `customFilter` replaces the test entirely and receives
`(option, filterText)`.

1.7 `selectAllState(visible, selected)` → `'checked' | 'unchecked' | 'mixed'`
(R6.3), over the visible set only, and `'unchecked'` for an empty visible set
(which R6.6 renders disabled anyway).

1.7a **Every function that returns a selection takes the full `options` list**,
not only the rows it operates on. Stating "returns through 1.3" without it was
unimplementable: 1.3 needs `options` to know the canonical order at all, and a
function holding only `visible` cannot distinguish a **matched value the filter
is hiding** from an **unmatched value** (R2.5) — it would sort every hidden
match into the unmatched tail and silently reorder the committed array on each
filter change, breaking R2.4 and V2.5.

So the signatures below carry `options` as well as the subset they act on. The
subset says *what to change*; `options` says *how to order the result*, and the
two are not the same list whenever a filter is applied.

1.8 `applySelectAll(selected, visible, state, options)` — R6.4, R6.5: from
`'checked'`, remove every visible value; otherwise add every visible value.
Values outside `visible`, matched or not, are untouched. Returns through 1.3
with `options`.

1.9 `toggleValue(selected, value, options)` — add or remove by `===` (R4.6).
Returns through 1.3 with `options`.

1.10 `unionSelection(selected, add, options)` — R5.7's union, used by
`checkOnFilter`. Separate from 1.8 because it must never remove, whatever the
state.

**The alternative was considered and rejected:** normalise only at the commit
boundary in the component and let these return unordered arrays. It gives one
call site the job instead of four, but it makes every intermediate value a
different shape from the committed one, so a test asserting a helper's output
asserts something the consumer never sees — and 1.3's guarantee stops being a
property of the type, which is the whole reason it exists.

**Tests** (`src/lib/optionList.test.ts`), by function:

- ordering: selection order in, `options` order out; unmatched after matched
  in arrival order; duplicates collapsed; idempotent (normalising twice is
  normalising once).
- **a matched value hidden by a filter keeps its `options` position** through
  `toggleValue`, `applySelectAll` and `unionSelection` — the regression 1.7a
  exists to prevent, and the one case a `visible`-only signature gets wrong.
- unmatched preservation through `toggleValue` and `applySelectAll`.
- header: all six branches of 1.5, including `maxHeaderItems: 0`, a
  multi-`{count}` format, and `{count:n0}` surviving verbatim.
- filter: substring, case folding both ways, a non-ASCII label,
  `customFilter` overriding, empty text returning the input.
- select-all: the three states, and that `applySelectAll` under a filter leaves
  hidden and unmatched values alone.

### 2. Dropdown state — `src/components/MultiSelect/useOptionDropdown.ts`

React state only; no markup, no option semantics (those are group 1).

2.1 Open state, plus `open`/`close`/`toggle`. Close clears the filter text
(R5.5) and is the single place that happens, so no closing route can forget.

2.2 The filter text, **the set it leaves visible**, and **the match set the
field last rendered**.

The hook derives the visible set itself, from `options` plus
`caseSensitiveSearch`/`customFilter`, rather than being handed it. The signature
this plan first gave — `itemCount` and `visible` as inputs — was circular:
clamping needs the row count, the count comes from filtering, and filtering
needs the filter text the hook owns. Lifting the text into the component instead
would have cost R5.5's single place to clear it. The hook calls group 1's
`filterOptions`, so no option semantics are reimplemented here.

Gate 1 is expressed as **two functions rather than a flag**: `editFilter` is the
user path and `close()` clears the filter without it, so a caller cannot forget
to set a flag and no state has to carry the distinction. `close()` is also the
single place the filter is cleared (R5.5), so no closing route can forget to.

The retained match set is gate 2's `P` (R5.7d) — without it there is nothing for
`N ⊆ P` to compare against, and it cannot be recomputed after the fact because
`customFilter` may have changed in the same render. It is a ref written in an
effect after each **committed** render, which is exactly what "the set the field
last rendered" means: a render React discarded must not become the baseline.

2.3 The active row index over the **filtered** set, clamped **on read**
(§0.2), with `move(±1)` clamping at both ends (R9.6) rather than wrapping, and
`-1` — no active row — when the filtered set is empty (R9.6a). Opening seeds the
first visible row, and so does editing the filter (R13.2a).

`move(-1)` at the first row reports that it could not move, so the caller can
apply R9.6/R9.7a's focus transfer to select-all. The hook does not move focus
itself: the exception is a focus decision and belongs with the other focus
transitions in 2.4.

2.4 The focus-stop ring of R9.5: refs for the filter input, the select-all
checkbox and the listbox; an ordered array of the stops that currently exist
**and can accept focus** (R9.5e — tested on the node, so an `aria-disabled` stop
is included and a natively `disabled` one is not); `focusStop(index)`,
`nextStop()`, `previousStop()`. `nextStop()` from the last and `previousStop()`
from the first return `null`, which is how R9.7's "fall back to the field"
reaches the caller without this hook knowing what closing means.

2.4a The whole-control focus boundary (R9.5d): a predicate over an event's
`relatedTarget` that answers whether focus is leaving the field, the popup and
the portalled subtree together. It lives here because the refs do, and it is
what §4.5's blur wiring is built on.

2.5 Click-away on `mousedown` (matching `useTimeDropdown`'s reasoning: closing
on the way down, so a drag that starts in the list and ends outside is not a
click-away), scoped to the field wrapper **and** the portalled popup.

2.6 Scroll the active row into view with `scrollTop` arithmetic (§0.2).

2.7 Force-close when `isDisabled` or `isReadOnly` becomes true (R4.7).

**Tests**: covered through the component (§5), not directly — this hook is
wiring, and `standards.md` §9.1 tests behaviour through the rendered component.

### 3. Popup — `src/components/MultiSelect/OptionPopup.tsx`

3.1 Placement, dark-class propagation across the portal, `--rc-color-primary`
forwarding, and the `portalZIndex` → `--rc-z-popup` → `DEFAULT_POPUP_Z_INDEX`
cascade — modelled on `TimePopup` (§0.2), with `maxDropdownHeight` applied to
the **inner listbox** and the filter input and select-all rendered above it,
outside the scroll area (R12.4).

3.2 `role="dialog"` on the popup root with a `useId` id (R9.3), and
`onPointerDown` stopping propagation so a click inside is never a click-away.

3.3 Non-portalled mode renders in place, absolutely positioned, same as the
existing controls.

### 4. Component — `src/components/MultiSelect/MultiSelect.tsx`

4.1 Props exactly as `requirements.md`'s **Proposed prop surface**, with a
`//` doc comment on every non-obvious one (§3.5) and, specifically, on the
three that will otherwise read as bugs: `checkOnFilter` (default inverted,
R5.7), `isRequired` (`aria-required` only and no behavioural effect, R7.2–R7.3)
and `headerFormatter` (returns a string, not a `ReactNode`, R3.7).

4.2 Controlled/uncontrolled selection per §2.3, with **every** `onChange`
argument passing through `normalizeSelection` (1.3), and no `onChange` on any
prop application (R2.7).

4.3 Header from `selectedOptions` + `formatHeader`, or `headerFormatter`,
written to the `<input>`'s `value` (R3.1, R3.7). Derived on render, never
stored — there is no state to go stale.

4.4 `forwardRef<HTMLInputElement, MultiSelectProps>` with a named inner
function, forwarding to the field `<input>` (§2.10).

4.5 Keyboard: one handler per focus stop, mirroring R9.6's four tables
one-to-one, plus R9.6a's no-active-row case. The field's handler goes through
`composeInputEvent` (§4.6). `Tab` is R9.7's fall-back-to-the-field rule over
2.4's `nextStop`/`previousStop` returning `null`; `ArrowUp` on the first row is
R9.7a's transfer, driven by 2.3's "could not move" report.

4.5a **Focus and blur: filter, then compose — in that order.** R9.5d reports
only focus that crosses the control's boundary, and `afterInputEvent` invokes
the consumer unconditionally, so it cannot be the outer layer:

```
onBlur  = (event) => { recordInternalFocusState(event)
                       if (leavingControl(event)) consumerOnBlur?.(event) }
```

`recordInternalFocusState` runs on every focus change — it is what R9.7c's ring
and 2.4's stop tracking read. `afterInputEvent` still composes the pair, applied
to the filtered consumer callback rather than to the raw one, so §4.6's ordering
guarantee (internal bookkeeping and any commit before the consumer's callback) is
kept for the blurs that are reported.

**The two boundary tests are different, and the asymmetry is the point.** Blur
uses 2.4a's predicate over `relatedTarget`: on a blur, `relatedTarget` is where
focus is going, and `null` correctly means "nowhere inside", i.e. an exit. Focus
cannot use it — on a focus event `relatedTarget` is the element *losing* focus
and is routinely `null`, so the same predicate would read every internal move as
a fresh entry and fire `onFocus` twice on opening the popup. `onFocus` therefore
tests the tracked stop instead:

```
onFocus = (event) => { recordInternalFocusState(event)
                       if (wasUnfocused) consumerOnFocus?.(event) }
```

Saying "`onFocus` is symmetric on entry" was wrong about the mechanism, though
right about the contract (R9.5d).

The handler goes on the **wrapper**, not the `<input>`: React's focus events
bubble, and the portalled popup's events bubble through the React tree to the
same wrapper, so one handler sees every transition including the portal's. That
is also why the prop is typed `FocusEventHandler<HTMLElement>` rather than
`<HTMLInputElement>` (R9.5d, R9.2) — the event's `target` is whichever stop the
user left.

4.5b **`Space` on select-all is not handled, deliberately.** R9.6 lists
`Space`/`Enter`, and only `Enter` gets a `keydown` branch: a native checkbox
already turns `Space` into a synthesised click, which arrives at `onChange`, so
handling it as well would toggle twice. A missing `Space` branch there is
intentional, not an omission.

4.6 `checkOnFilter` is R5.7a's **two gates**, evaluated in order at the point
the filter text changes: gate 1 is 2.2's user-edit flag, gate 2 is
`isSubset(N, P)` against 2.2's retained match set, and a pass unions via 1.10.

Nothing here inspects the keystroke — R5.7b makes membership authoritative, and
an implementation that branches on "was this a deletion" reproduces the defect
that framing caused. **No `useEffect` watching the filter text** either: an
effect sees only the new value, so it cannot evaluate either gate.

4.6a `isSubset(N, P)` belongs in `optionList.ts` beside the other pure rules
(§1), not in the component — it is set arithmetic over option values and is
exactly the kind of thing §1.2 of `standards.md` keeps out of TSX.

4.7 `name` → one `<input type="hidden">` per committed value, `disabled` with
the field (R10.1).

4.8 Styling: `.rc-scalar` on the root and the shared visual language of
§7.5–§7.6, with dark variants on every colour-bearing class. Long-header
truncation is an explicit `truncate`-equivalent (R13.6), not left to the
`<input>`.

The focus ring is a **class driven by 4.5a's focus state**, not
`focus-within:` — a portalled popup is not inside the wrapper's DOM subtree, so
`:focus-within` would drop the ring exactly when `portal={true}` (R9.7c). The
same class is used in both modes so inline and portalled cannot diverge.

4.9 ARIA per §9, and in particular: the dialog's `aria-label` from
`popupAriaLabel`, defaulted to the field's own `aria-label` and then to
`'Options'` (R9.8a, R9.8b), and the listbox's from `optionsAriaLabel`;
`aria-activedescendant` on the filter input or the listbox and **never** on the
field (R9.5a); `aria-controls` on the
filter input naming the listbox (R9.5a); `aria-haspopup="dialog"` fixed
(R9.3); `aria-checked="mixed"` plus the DOM `indeterminate` property on
select-all (R6.3); the four explicit `aria-*` props declared rather than spread
(R8.2).

4.10 `index.ts` re-exporting only `MultiSelect` and `MultiSelectProps` (§1.1).

### 5. Component tests — `src/components/MultiSelect/MultiSelect.test.tsx`

`describe` blocks named after the prop or behaviour under test (§9.3), so the
prop surface is legible from the block names: `options`, `value / defaultValue`,
`onChange`, `header`, `headerFormatter`, `filter`, `checkOnFilter`,
`select all`, `keyboard`, `focus`, `ARIA`, `isRequired`, `isReadOnly`,
`isDisabled`, `placeholder`, `name`, `portal`, `StrictMode`.

Two things about how these are written, both load-bearing:

- **Focus is asserted, not assumed.** R9.5 is a DOM-focus contract, so the
  tests assert `document.activeElement` at each transition. Asserting only
  `aria-activedescendant` would pass for the arrangement R9.5 rejects.
- **`checkOnFilter` is tested per row of R5.7a's table**, including the two
  regressions that table exists for: deleting the last filter character, and
  `Escape` while a filter is active.

### 6. Cross-component contracts

`standards.md` §9.5 says these suites must be **extended, not bypassed**. Both
need a change, and both changes are to test scaffolding, not to any shipped
component.

6.1 **`src/components/scalarEvents.test.tsx`.** Its `cases` array cannot carry
`MultiSelect`: every case commits by `fireEvent.change(input, { target: { value: draft } })`,
and this field's `<input>` is `readOnly` and holds a derived header — there is
no draft to type and `change` is not a commit point (R4.4). Forcing a `draft`
into the case would assert a contract this control is specified not to have.

Bypassing it is also not allowed, and the contract §9.5 protects — consumer
`onKeyDown`/`onClick` cancellation, and `onBlur` firing after internal
bookkeeping — **does** apply here. So a second `describe` block is added to the
same file for controls whose value is not typed, asserting:

- consumer `onFocus`/`onBlur` run once, with a toggle's `onChange` preceding
  `onBlur`;
- consumer `onKeyDown` cancelling `ArrowDown` prevents the popup opening;
- consumer `onClick` cancelling prevents it too.

`InputTag` is *not* added to that block, although it is the other collection
control: its `onBlur` is a declared prop rather than an `InputHTMLAttributes`
passthrough and it takes required props of its own, so including it means
changing it or special-casing it. §8.4. A comment in the file records that,
so the omission reads as a decision.

6.2 **`src/scalar-styles.test.tsx`.** Its loop renders `<Component />` with no
props; `MultiSelect` requires `options` (R2.1). The map becomes
name → `{ Component, props }`, with the five existing controls keeping `{}` and
therefore rendering exactly as they do today. A branch is added for the
`'Toggle options'` button that opens the popup and asserts the portalled
`role="dialog"` carries `rc-scalar`, mirroring the existing calendar and time
branches — otherwise the new control's popup is the one surface in the library
whose style scope is unverified.

6.3 **`scripts/verify-package.mjs`.** All of `standards.md` §1.4's five places,
plus the two per-component branches this control needs:

- `expectedEntries` gains `'./multi-select'` and `components` gains
  `'MultiSelect'`, **appended to both** — they are matched by index, and
  appending to one silently verifies the wrong component (§1.4).
- The render probe is `{ 'aria-label': name, defaultValue: null }`, which is
  wrong twice here: `options` is required and `defaultValue` is an array
  (R2.3). It gains a `MultiSelect` case, `{ 'aria-label': name, options: [] }`,
  beside the existing `InputTag` one.
- The scope assertion (`rc-scalar`) and the control assertion (`<input>`) both
  hold unchanged, per R9.1 and R12.1 — no branch needed, and that is worth
  confirming rather than assuming.
- Any declaration the new component is the only source of goes into
  `requiredStyles`, per §7.4.

### 7. Styles

7.1 Add every class-bearing file to the `sources` array in
`scripts/generate-scalar-styles.mjs` — `MultiSelect/MultiSelect.tsx`,
`MultiSelect/OptionPopup.tsx` and `MultiSelect/icons.tsx` if it carries
classes. A file left out is not compiled and the control renders unstyled in
`demo/` and `docs/` while every test still passes (§7.3).

7.2 Run `npm run generate:styles` and commit the regenerated
`src/scalar-utilities.css`; `--check` must report no staleness (§11.2).

7.3 No new CSS custom property escapes the scope (§7.4). No `input-tag.css`
equivalent is added — R12.1 settles that.

### 8. Packaging

The five places of §1.4, in order: `src/multi-select.ts`, `src/index.ts`,
`package.json` `exports['./multi-select']`, `vite.config.ts`
`build.lib.entry['multi-select']`, and both lists in `verify-package.mjs`
(§6.3).

8.1 `src/multi-select.ts` exports `MultiSelect`, `MultiSelectProps` and
`MultiSelectOption` — and **nothing from `optionList.ts`**.

An earlier draft of this plan published `formatHeader`, `filterOptions` and
`normalizeSelection`, on the precedent of `src/input-number.ts` exporting
`parseDraft`. That was public API decided in a plan: `requirements.md`'s prop
surface is the sanctioned surface and says nothing about helpers, and an export
is a compatibility commitment that no criterion checked. They stay internal
until a requirement asks for them, which costs a consumer nothing today and can
be added without a breaking change. `MultiSelectOption` is exported because the
`options` prop's type is unusable without it.

8.2 Update `package.json`'s `description`, which lists the component names.

### 9. Demo and docs

9.1 A `<Section>` in `demo/App.tsx` (§10.4): the default control, one with
`showFilterInput` and `showSelectAllCheckbox`, one with a long option list
inside a scrolling/overflow container to exercise the portal, and one showing
the committed array beside the header so the gap between the two is visible.

9.2 `docs/app/components/multi-select/{page.mdx,demo.tsx,property-index.tsx}`
plus the `_meta.js` entry, per §10.1–§10.2. Thai prose, one `###` section per
property with a `<PropertySignature />`, a demo and a `tsx` snippet; each demo
shows the committed value below the field. No Wijmo, no Linear, nothing about
review process (§10.3).

9.3 `README.md`: the entry point in the published list, and a `###` section for
the three things a consumer cannot guess from a prop table — that `onChange`
fires per toggle rather than on blur (R4.4), that `isRequired` is
`aria-required` only so the form must validate (R7.2), and that `name` submits
hidden inputs rather than the header text (R10.1).

9.4 `CHANGELOG.md` entry (§10.6).

### 10. Validation

`npm run validate` end to end, then [`validation.md`](validation.md) as the
Definition of Done.

---

## Sequencing and risk

Group 1 carries the rules and no React, so it is written and green first — if
the ordering or select-all semantics are wrong, they are wrong cheaply and
visibly. Groups 2–4 are wiring over proven rules.

The real risk is **group 4.5/4.9, the focus model**, not the option rules: R9.5
is the part of the spec with no precedent in this library, since every existing
popup keeps DOM focus on the field. It is scheduled with its tests in the same
group (§5's first bullet) rather than after them, because a focus contract
asserted only through `aria-activedescendant` passes in exactly the arrangement
R9.5 rejects.

Groups 6–8 are mechanical and are the ones that pass silently when skipped —
an entry point missing from `vite.config.ts` emits nothing, a `sources` entry
missing from the style generator renders the control unstyled, and a list
appended on one side only in `verify-package.mjs` verifies the wrong
component. That is why they are their own groups rather than a step inside
group 4.
