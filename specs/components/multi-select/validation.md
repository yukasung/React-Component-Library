# MultiSelect — Validation

**Status:** approved. **Every criterion is met except `V12.9`**, which asks
that the control render styled in `demo/` and in the docs dev server — that is a
visual check nothing here can perform, and it is outstanding.

Behavioural criteria are discharged by 122 tests in
`src/components/MultiSelect/MultiSelect.test.tsx` and 62 in
`src/lib/optionList.test.ts`; the inspection criteria were checked against the
source and the build. Worth knowing when reading the rest: three defects in this
component were found by a check other than a test — an uncompiled utility class,
unnormalised hidden inputs, and a popup whose height measurement fed back on
itself — the last of which reached a browser with 119 green tests behind it,
because jsdom has no layout engine. A green suite here is not evidence about
layout.

Definition of Done for [`requirements.md`](requirements.md), implemented per
[`plan.md`](plan.md). Every criterion is checkable: a test, a command, or a
named file inspection. Each **V** cites the requirement it discharges, so an
amended requirement has a visible criterion to amend with it
(`specs/README.md`, "When approved behavior has to change").

---

## 1. Scope

| | Criterion | Covers |
| --- | --- | --- |
| V1.1 | No free-text entry exists: with `showFilterInput` set, typing text no option matches and committing by every route leaves `value` unchanged — the filter never becomes a value | R1.3 |
| V1.2 | No prop exists for option groups, per-option disabling, a selection cap, virtualization or async loading — asserted against the exported `MultiSelectProps` type, not by reading the component | R1.4 |
| V1.3 | **No existing component's source changed.** `git diff` touches no file under `src/components/{InputNumber,InputDate,InputTime,InputDateTime,InputTag,InputMask}/` and neither `src/lib/inputMask.ts` nor `src/lib/maskTemplate.ts` | R1.6, standards §8.4 |
| V1.4 | No new entry in `package.json` `dependencies` | standards §1.5, plan §0.4 |

## 2. Options and the value contract

| | Criterion | Covers |
| --- | --- | --- |
| V2.1 | `options` is required and `{ value, label }`; a label differing from its value shows the label in the row and the header and commits the value | R2.1 |
| V2.2 | `MultiSelectOption` is declared in `src/lib/optionList.ts` and re-exported by the component, not the reverse | plan §1.1 |
| V2.3 | Controlled and uncontrolled both work; `defaultValue` defaults to `[]`; `null` is accepted nowhere as a value | R2.3, standards §2.3 |
| V2.4 | `onChange` receives `readonly string[]` of option **values** — never option objects, never an event, never a second argument | R2.3 |
| V2.5 | **Committed order is `options` order**: checking rows bottom-to-top yields the same array as top-to-bottom, and as one select-all | R2.4 |
| V2.6 | A value matching no option survives every subsequent toggle and select-all, is counted in the header, labels itself with its own value string, renders no row, and sorts after matched values in arrival order | R2.5 |
| V2.7 | Duplicate `options` entries by `value`: only the first renders, and checking it checks once | R2.6 |
| V2.8 | Applying `value`, `defaultValue` or a changed `options` fires **no** `onChange` | R2.7 |
| V2.9 | **Regression**: `options` changing so that a checked value no longer matches fires no `onChange` and does not drop the value | R2.5, R2.7 |
| V2.10 | `normalizeSelection` is idempotent, and every array reaching `onChange` has passed through it — verified by a test that checks an unnormalized order can never be observed from `onChange` | plan §1.3 |
| V2.11 | **Regression — a matched value the filter hides keeps its `options` position.** With a filter applied, `toggleValue`, `applySelectAll` and `unionSelection` each leave a hidden matched value ordered among the matched values, not sorted into the unmatched tail | R2.4, R2.5, plan §1.7a |
| V2.12 | `applySelectAll`, `toggleValue` and `unionSelection` each take the **full** `options` list as well as the subset they act on — a signature-level check, since a `visible`-only signature cannot satisfy V2.11 | plan §1.7a |

## 3. The header

| | Criterion | Covers |
| --- | --- | --- |
| V3.1 | Nothing checked → the field's `<input>` value is `''` and `placeholder` is visible | R3.2, standards §9.4 |
| V3.2 | `count <= maxHeaderItems` → labels joined `', '` in committed order | R3.3 |
| V3.3 | `count > maxHeaderItems` → `headerFormat` with `{count}` substituted; default is `'{count} items selected'`; `maxHeaderItems` defaults to `2` | R3.4 |
| V3.4 | Every occurrence of `{count}` is substituted, not only the first | R3.4 |
| V3.5 | **`{count:n0}` is left verbatim** and no culture formatting exists anywhere in the source — a consumer's copied reference format string is visibly wrong rather than silently countless | R3.5 |
| V3.6 | `maxHeaderItems={0}` uses the count form from the first checked option | R3.6 |
| V3.7 | `headerFormatter` replaces all of V3.1–V3.6 including the empty case, receives matched options in committed order, and receives unmatched values as `{ value, label: value }` | R3.7, R2.5 |
| V3.8 | `headerFormatter` returning `''` shows the placeholder | R3.7, R3.2 |
| V3.9 | The header is derived: an external `value` change updates it with no interaction, and no state holds it | R3.1 |
| V3.10 | **No `text` or `onTextChange` prop exists** on `MultiSelectProps` | R3.8, standards §2.6 |

## 4. Drop-down and selection

| | Criterion | Covers |
| --- | --- | --- |
| V4.1 | **No `isOpen`, `onOpenChange`, `isDroppedDown` or equivalent on the public interface**; `aria-expanded` is the only outward trace | R4.1, standards §2.9 |
| V4.2 | Opens on field click, button click, `ArrowDown`, `ArrowUp`, `Alt`+`ArrowDown`, `Enter` and `Space` | R4.2 |
| V4.3 | Closes on a second field/button click, `Escape`, `Alt`+`ArrowUp`, and pointer-down outside | R4.3 |
| V4.4 | **Does not close on selection**: toggling a row leaves it open, and a second row can be toggled without reopening | R4.3 |
| V4.5 | `onChange` fires **once per toggle**, with the committed array, and does not wait for blur | R4.4 |
| V4.6 | `Escape` after three toggles keeps all three — no undo | R4.5, R7.6 |
| V4.7 | Two option values differing only by accent are distinct and toggle independently — no `localeCompare` match anywhere in the selection path | R4.6 |
| V4.8 | `isReadOnly` and `isDisabled` each block every toggle and keep the popup shut, including via the keyboard | R4.7, R7.4 |

## 5. Filtering

| | Criterion | Covers |
| --- | --- | --- |
| V5.1 | `showFilterInput` defaults `false`; when set, a text input renders **above the rows** and inside the popup, with `filterInputPlaceholder` defaulting to `'Filter'` | R5.1 |
| V5.2 | Matching is substring on `label`, case-insensitive by default, case-sensitive under `caseSensitiveSearch` | R5.2 |
| V5.3 | A checked option the filter hides stays checked and stays in the committed array | R5.2 |
| V5.4 | `customFilter` replaces the default test and receives `(option, filterText)` — two arguments, no display-text third | R5.3 |
| V5.4a | It is consulted for an **empty** filter too: a predicate returning `false` for everything leaves no rows before the user types, rather than being short-circuited into "every option" | R5.3a |
| V5.4b | `caseSensitiveSearch` has no effect while a `customFilter` is supplied — the predicate receives the text as typed | R5.3b |
| V5.5 | A printable key on the closed field opens the popup, focuses the filter input and enters that character; without `showFilterInput` it does nothing | R5.4, R9.6 |
| V5.6 | The filter text is cleared on close by **every** closing route of V4.3, so reopening shows the whole list | R5.5 |
| V5.7 | **No filter-text prop or callback exists** on `MultiSelectProps` | R5.6, standards §2.9 |

### `checkOnFilter`

| | Criterion | Covers |
| --- | --- | --- |
| V5.8 | Defaults to **`false`**: typing a filter fires no `onChange` | R5.7 |
| V5.9 | With `checkOnFilter`, a filter change passing both gates commits the **union** of the current value and the match set — a previously checked option outside the match set stays checked | R5.7 |
| V5.10 | **Regression — `Escape` must not select everything**: `checkOnFilter`, a non-empty filter, then `Escape` closes, clears the filter and fires **no** `onChange` | R5.7a |
| V5.11 | **Regression — deleting the last filter character commits nothing**, and neither does any other clear to empty (select-all-text then `Delete`) | R5.7a, R5.7b |
| V5.11a | **Regression — no deletion commits, not only the last.** A filter narrowed to `"united"` (3 of 200 matching) then backspaced to `"u"` (~90 matching) fires **no** `onChange`: the match set grew | R5.7a, R5.7b |
| V5.11b | Only a **narrowing** change commits: typing `"u"` → `"un"` → `"uni"` commits at each step, and each committed set is a subset of the one before | R5.7a, R5.7b |
| V5.11c | A paste that broadens the match set commits nothing, although it is an insertion rather than a deletion | R5.7a, R5.7b |
| V5.11d | **Gate 2 by set relation, one case each**: `N ⊂ P` commits; `N = P` commits nothing (the union is empty, per V5.13); **overlapping** `N` commits nothing; **disjoint** `N` commits nothing | R5.7a |
| V5.11e | **Regression — a deletion that does not widen is still judged by membership.** Deleting the middle character of `"abc"` to give `"ac"`, where `"ac"`'s matches are **not** a subset of `"abc"`'s, commits nothing; where they are a subset, it commits | R5.7a, R5.7b |
| V5.11f | Replacing a selected range in the filter is judged by the same relation, not by being an insertion or a deletion | R5.7a, R5.7b |
| V5.11g | **`customFilter` is not assumed monotonic**: a predicate that matches *more* options for a longer filter string commits nothing on that change, because `N ⊄ P` | R5.7a, R5.7b, R5.3 |
| V5.11h | `P` is the **previous** filter's match set, not the new one: a filter narrowed to `"united"` (committing 3) then replaced by `"japan"` commits nothing, because `{jp}` is disjoint from `{us, gb, ae}`. An implementation comparing `N` against itself would always commit | R5.7d, plan §2.2 |

*V5.11h was originally worded as "changing `customFilter` and the filter text in
the same render". That is not observable: the retained set is refreshed on every
committed render, so "the last rendered set" and "recomputed from the current
text and props" are the same value by construction. The checkable content is
that the comparison reaches back one filter edit, which is what the criterion
now states.*
| V5.11i | `isSubset` lives in `optionList.ts` and is unit-tested there, not in the component | plan §4.6a |
| V5.12 | Every remaining row of R5.7a's table asserted: a change to `options`, `value`, `customFilter`, `caseSensitiveSearch` or `checkOnFilter` itself fires no `onChange`, and neither does mount with a `defaultValue` | R5.7a, R2.7 |
| V5.13 | A filter change whose match set adds nothing new fires no `onChange` | R5.7c |
| V5.14 | The filter text is not watched by a `useEffect` — verified by reading `MultiSelect.tsx`, since an effect cannot distinguish R5.7a's rows | plan §4.6 |
| V5.15 | **No `delay` prop**, and no timer in the filter path | R5.8 |

## 6. Select all

| | Criterion | Covers |
| --- | --- | --- |
| V6.1 | `showSelectAllCheckbox` defaults `false`; when set, a native `<input type="checkbox">` renders above the rows, below the filter input when both exist, and **outside** the `role="listbox"` element | R6.1 |
| V6.2 | It is not a `role="option"` and carries no `aria-selected` | R6.1 |
| V6.3 | Acts on the **visible** set: under a filter, activating it checks only matching options | R6.2 |
| V6.4 | Three states against the visible set, with the DOM `indeterminate` **property** set (not an attribute) and `aria-checked="mixed"` | R6.3 |
| V6.5 | Activation by click **and** by `Space`/`Enter` while focused; one `onChange` per activation, never one per row | R6.4, R9.6 |
| V6.6 | **Regression**: unchecking select-all under a filter leaves hidden and unmatched values checked — the field is not emptied | R6.5, R2.5 |
| V6.7 | With `options` empty, or the filter matching nothing, it renders `disabled` rather than disappearing | R6.6 |

## 7. States

| | Criterion | Covers |
| --- | --- | --- |
| V7.1 | `isRequired` defaults to **`false`** | R7.1 |
| V7.2 | `isRequired` sets `aria-required` and **not** the native `required` attribute — asserted by the attribute's absence | R7.2 |
| V7.2a | The field carries `readOnly`, which is what bars it from constraint validation and is why a native `required` would be inert rather than merely wrong — asserted as the attribute's presence on the `<input>` | R7.2, R9.1 |
| V7.3 | `isRequired` changes no behaviour: an empty field blurs without a snap-back, fires no `onChange`, and fabricates no value | R7.3 |
| V7.4 | `isReadOnly` keeps the field focusable and its hidden inputs submittable, blocks every change, and keeps the popup shut | R7.4 |
| V7.5 | `isDisabled` removes the field from the tab order and its hidden inputs from submission | R7.4, R10.1 |
| V7.6 | `aria-readonly` and `aria-disabled` are on the field in addition to their effects | R7.5 |
| V7.7 | `Escape` closes, clears the filter, returns focus to the field, and does not revert the value | R7.6, R9.5c |
| V7.8 | **No `isEditable` prop** | R7.7 |

## 8. Validation and error state

| | Criterion | Covers |
| --- | --- | --- |
| V8.1 | No `error`, `isInvalid`, `errorMessage`, `helperText` or `label` prop, and no error styling in the generated stylesheet | R8.1, standards §5.1 |
| V8.2 | `aria-invalid`, `aria-describedby`, `aria-errormessage` and `aria-labelledby` are **declared** on `MultiSelectProps` and reach the field element | R8.2, standards §5.2 |
| V8.3 | No invalid-input notification prop exists | R8.3 |

## 9. Accessibility — roles and focus

| | Criterion | Covers |
| --- | --- | --- |
| V9.1 | The field is `<input type="text">` with `role="combobox"`, `readOnly`, holding the header text | R9.1 |
| V9.2 | `MultiSelectProps` omits `'value' \| 'defaultValue' \| 'onChange' \| 'type' \| 'required' \| 'readOnly' \| 'disabled' \| 'role'` from `InputHTMLAttributes` — a type-level check, not a runtime one | R9.2 |
| V9.3 | `aria-haspopup="dialog"` **always**, whatever `showFilterInput`/`showSelectAllCheckbox` are; `aria-controls` names the popup's `useId` id; `aria-expanded` tracks the popup | R9.3 |
| V9.4 | The popup is `role="dialog"` containing `role="listbox"` + `aria-multiselectable="true"`, one `role="option"` with `aria-selected` per visible row | R9.3 |
| V9.5 | `aria-autocomplete="none"` on the field | R9.4 |
| V9.6 | Ids are `useId`-generated, never hand-built | standards §6.3 |

### The focus model — asserted on `document.activeElement`, not on ARIA alone

| | Criterion | Covers |
| --- | --- | --- |
| V9.7 | **Opening moves DOM focus into the popup**, by every opening route of V4.2: to the filter input when it exists, else the select-all checkbox, else the listbox | R9.5 |
| V9.7a | **Regression — an unavailable stop does not swallow focus.** `options={[]}`, `showSelectAllCheckbox`, `showFilterInput` unset: opening puts focus on the **select-all checkbox**, which `R6.6` makes `aria-disabled` and therefore still focusable, and **not** on the field | R9.5e, R6.6 |
| V9.7b | **The same via `Tab`.** `showFilterInput` and `showSelectAllCheckbox` both set, a filter matching nothing, focus in the filter input: `Tab` lands on the `aria-disabled` checkbox rather than skipping it | R9.5e, R6.6, R9.7 |
| V9.7c | The unavailable select-all carries `aria-disabled="true"` and **not** the native `disabled` attribute, so it stays focusable and in the accessibility tree; activating it does nothing | R6.6, R9.5e |
| V9.8 | With both optional features off — the default — focus lands on the **listbox**, which is therefore focusable | R9.5b |
| V9.9 | `aria-activedescendant` is on the filter input or the listbox, whichever holds focus, and is **never** on the field | R9.5, R9.5a |
| V9.10 | The filter input carries `aria-controls` naming the listbox id, so its `aria-activedescendant` reference resolves | R9.5a |
| V9.11 | Closing returns focus to the field for `Escape`, `Alt`+`ArrowUp`, a second field/button click, and `Shift`+`Tab` off the first stop | R9.5c |
| V9.12 | A pointer-down outside hands focus to the field **before** unmounting the popup, so the exit is reported: the popup closes, the field's focus ring clears, and consumer `onBlur` fires **once** | R9.5c, R9.5d, R9.7c |
| V9.12a | It does not fight the pointer's destination — a focusable outside target holds focus afterwards | R9.5c |
| V9.12b | An outside target that takes no focus leaves the field focused, rather than focus falling to the document | R9.5c |
| V9.13 | Consumer `onBlur` fires only when focus leaves the whole control; moving between the field and the popup's stops reports nothing — including **out of the portalled popup**, whose events reach the same wrapper handler | R9.5d |
| V9.13a | `onBlur` and `onFocus` are **omitted** from the inherited `InputHTMLAttributes` and declared as `FocusEventHandler<HTMLElement>`, so a blur originating at the listbox type-checks — a type-level check | R9.5d, R9.2 |
| V9.13b | **The boundary test precedes the composition**: internal focus bookkeeping runs on every transition while the consumer callback runs only on a real exit, and for the exits that are reported a toggle's `onChange` still precedes `onBlur` | R9.5d, standards §4.6, plan §4.5a |
| V9.13c | `onFocus` is boundary-filtered exactly as `onBlur` is: fired on entering the control, **not** when focus moves from the field to a popup stop or between stops | R9.5d |

### Keyboard, per focused element

| | Criterion | Covers |
| --- | --- | --- |
| V9.14 | Field, closed: R9.6's first table, row by row | R9.6, R4.2 |
| V9.14a | **`Ctrl`+`A` and `Cmd`+`A` on the closed field do nothing** — they neither open the popup nor enter `a` in the filter; an unmodified `a` still does both | R9.6b, R5.4 |
| V9.14b | The same chords in the listbox leave the filter untouched and focus where it was | R9.6b |
| V9.15 | **Filter input keeps its text keys**: `Space` inserts a space (typing `New York` produces `New York` and toggles nothing), `Home`/`End` and `ArrowLeft`/`ArrowRight` move the caret, `Ctrl`/`Cmd`+`A` selects the filter text | R9.6 |
| V9.16 | Filter input: `ArrowDown`/`ArrowUp` move the active row, and **`Enter` is the only selection gesture there** | R9.6 |
| V9.17 | Select-all focused: `Space`/`Enter` toggle it; `ArrowDown`/`ArrowUp` move focus to the listbox with the active row first/last | R9.6, R9.7a |
| V9.18 | Listbox focused: R9.6's fourth table, including `Home`/`End`, `Space`/`Enter` toggling without closing, and a printable key moving focus to the filter input with that character entered | R9.6 |
| V9.19 | Active-row movement **clamps** at both ends and does not wrap — `ArrowDown` on the last row stays, and `ArrowUp` on the first row stays **when no select-all checkbox exists** | R9.6 |
| V9.19a | **The one exception, tested explicitly**: with `showSelectAllCheckbox` set, `ArrowUp` on the first row moves DOM focus to the checkbox, leaves the active row on row 0, and `ArrowDown` from the checkbox returns focus to the listbox with row 0 still active | R9.6, R9.7a |
| V9.20 | Moving the active row commits nothing | R9.6 |
| V9.21 | `Tab` advances through the existing focusable stops; from the **last** it closes the popup and returns focus to the **field**, and `Shift`+`Tab` from the **first** does the same | R9.7, R9.5c, R9.5e |
| V9.22 | **`Tab` is not trapped**: from a fully-featured open popup, repeated `Tab` closes the popup, lands on the field, and the next `Tab` reaches the following form control — asserted under `portal={true}`, where a popup in `document.body` makes any "advance straight past the field" implementation wrong | R9.7 |
| V9.23 | **One tab stop when closed**: a `Tab` sweep of a form containing the control stops on the field exactly once; the drop-down button and every row are `tabIndex={-1}` | R9.7b, standards §6.4 |
| V9.24 | The field reads as focused for as long as the popup is open, including while focus is on a popup stop — asserted **with `portal={true}`**, which is where a `:focus-within` implementation fails, and again inline so the two modes agree | R9.7c |
| V9.24a | The ring is driven by component state, not by `:focus-within` on the wrapper — verified by reading the source, since a `:focus-within` implementation passes the inline case and fails only the portalled one | R9.7c |
| V9.25 | `dropdownAriaLabel`, `dropdownIcon`, `checkedIcon` are overridable with English defaults; select-all and the filter input are named by `selectAllLabel` / `filterInputPlaceholder` | R9.8, standards §2.8, §6.5 |
| V9.25a | The `role="dialog"` popup has a non-empty accessible name, which ARIA requires: `popupAriaLabel` when given, else the field's own `aria-label`, else `'Options'` — all three cases asserted | R9.8a, R9.8b |
| V9.25b | The `role="listbox"` is named by `optionsAriaLabel`, default `'Options'` | R9.8a |
| V9.25c | **A field labelled by a native `<label for>` still leaves the popup named** (`'Options'`), rather than unnamed — the case the component cannot read, and the reason `popupAriaLabel` exists | R9.8b |
| V9.26 | No `inputMode` on either input | R9.9, standards §6.6 |
| V9.27 | **No visible rows, both routes** (`options={[]}` and a filter matching nothing): `aria-activedescendant` is **absent**, not empty; `ArrowDown`/`ArrowUp`/`Home`/`End`/`Space`/`Enter` are no-ops on the listbox and `Enter` is a no-op in the filter input; nothing commits | R9.6a, R13.1, R6.6 |
| V9.28 | In that state the popup still opens with focus inside it, `Escape` still closes, `Tab` still walks the stops, and the filter input still accepts text | R9.6a, R9.5 |

## 10. Form integration

| | Criterion | Covers |
| --- | --- | --- |
| V10.1 | `name` renders one `<input type="hidden">` per committed value, in committed order, `disabled` with the field | R10.1, R2.4 |
| V10.2 | The header text is never submitted | R10.1 |
| V10.3 | `README.md` states that the payload is built from the committed value | R10.3 |

## 11. Localization

| | Criterion | Covers |
| --- | --- | --- |
| V11.1 | **No `locale` prop** | R11.1 |
| V11.2 | `headerFormat`, `selectAllLabel`, `filterInputPlaceholder` and `dropdownAriaLabel` all default to English and are all overridable | R11.2 |
| V11.3 | Case-insensitive filtering matches a non-ASCII label, and a Thai label is unaffected by case folding | R11.3 |

## 12. Styling and layering

| | Criterion | Covers |
| --- | --- | --- |
| V12.1 | The root carries `rc-scalar` plus the consumer's `className`, concatenated last; **no new BEM stylesheet exists** | R12.1, standards §7.2 |
| V12.2 | `h-11`, `rounded-lg`, `text-sm`, `shadow-theme-xs`, the brand focus ring and a `dark:` variant on every colour-bearing class; distinct disabled and read-only treatments; no size variant prop | R12.2, standards §7.5–§7.7 |
| V12.3 | `portal` defaults `false`; portalled, the popup resolves its layer `portalZIndex` → `--rc-z-popup` → `DEFAULT_POPUP_Z_INDEX`, and carries the field's `.dark` class and `--rc-color-primary` across the boundary | R12.3, standards §7.8 |
| V12.4 | `maxDropdownHeight` defaults `240` and caps the **listbox**; the filter input and select-all stay visible and reachable with a list long enough to scroll | R12.4 |
| V12.5 | **No `maxDropdownWidth` prop** | R12.5 |
| V12.6 | `showDropdownButton` defaults **`true`** and is not gated on any other prop | R12.6 |
| V12.7 | Every class-bearing file under `src/components/MultiSelect/` is in `generate-scalar-styles.mjs`'s `sources`, and `node scripts/generate-scalar-styles.mjs --check` reports no staleness | plan §7.1, standards §7.3 |
| V12.8 | No `@property`, no `@layer base`, no `:root` and no unscoped selector enters `style.css` | standards §7.4 |
| V12.9 | The control renders styled in `demo/` and in the docs dev server | standards §7.3 |

## 13. Edge cases

| | Criterion | Covers |
| --- | --- | --- |
| V13.1 | `options={[]}`: the field renders, the popup opens, the list is empty, select-all is disabled | R13.1, R6.6 |
| V13.2 | `options` changing while open re-derives the active row by clamping into the new visible range, and leaves the value untouched | R13.2, R2.7 |
| V13.2a | Editing the filter moves the active row to the **first** visible row rather than clamping the old index, and commits nothing | R13.2a |
| V13.3 | A checked option removed from `options` becomes an unmatched value — still committed, still counted, no row | R13.3, R2.5 |
| V13.4 | A `value` changed while the field is focused reaches the field and updates the header | R13.4 |
| V13.5 | Duplicate entries in the committed array are counted once and checked once; toggling that value removes every copy; no `onChange` is fired to rewrite them | R13.5, R2.7 |
| V13.6 | A long label truncates with an ellipsis in the header and wraps in its row, by explicit `text-overflow`/`overflow`/`white-space` declarations present in the generated stylesheet — **not** left to the `<input>`, which clips without an ellipsis | R13.6, R9.1 |
| V13.7 | **StrictMode** mount/unmount leaves no listener, observer or portal node behind | R13.7, standards §9.4 |

## 14. Naming and module layout

| | Criterion | Covers |
| --- | --- | --- |
| V14.1 | `src/components/MultiSelect/`, `src/multi-select.ts`, `./multi-select`, `docs/app/components/multi-select/` | R14.1 |
| V14.2 | The exported component is `MultiSelect`, not `InputMultiSelect` | R14.2 |
| V14.3 | The pure module is `src/lib/optionList.ts` with `src/lib/optionList.test.ts` beside it, and is **not** named after the component | R14.3, plan §0.6 |
| V14.4 | `index.ts` re-exports only the component and its props type | standards §1.1 |
| V14.5 | No algorithm lives in the TSX: ordering, filtering, header formatting and select-all state are all in `optionList.ts` and unit-tested without rendering | standards §1.2, §9.2 |
| V14.6 | The component is split by role per plan §0.5, not held in one file | standards §1.3 |
| V14.7 | `useSyncedState`, `domSelection`, `useTimeDropdown` and `TimePopup` are **not** imported, and plan §0.2's reasons are the ones in the source comments | plan §0.2 |

## 15. Packaging

| | Criterion | Covers |
| --- | --- | --- |
| V15.1 | All five places of standards §1.4 updated: `src/multi-select.ts`, `src/index.ts`, `package.json` `exports`, `vite.config.ts` `build.lib.entry`, and **both** lists in `verify-package.mjs` | standards §1.4 |
| V15.2 | The two verifier lists stay index-aligned — checked by reading them, since a misalignment verifies the wrong component silently rather than failing | standards §1.4 |
| V15.3 | `verify-package.mjs` has a `MultiSelect` render-probe branch supplying `options`, and the `rc-scalar` and `<input>` assertions pass without a branch | plan §6.3, R9.1, R12.1 |
| V15.4 | `npm run build` emits `dist/multi-select.js` and a non-empty `dist/multi-select.d.ts` declaring `MultiSelect` and `MultiSelectProps` | standards §1.4, CLAUDE.md dts gotcha |
| V15.5 | `npm run verify:package` passes | standards §11.1 |
| V15.6 | `package.json` `description` lists the new component | plan §8.2 |
| V15.7 | `src/multi-select.ts` and `src/index.ts` export `MultiSelect`, `MultiSelectProps` and `MultiSelectOption` and **nothing from `optionList.ts`** — the helpers stay internal until a requirement asks for them | plan §8.1 |

## 16. Cross-component contracts

| | Criterion | Covers |
| --- | --- | --- |
| V16.1 | `scalarEvents.test.tsx` **extended, not bypassed**: a second `describe` block covers controls whose value is not typed, and `MultiSelect` passes it — consumer `onFocus`/`onBlur` run once with a toggle's `onChange` before `onBlur`, and consumer `onKeyDown`/`onClick` cancellation prevents the popup opening | plan §6.1, standards §9.5, §4.6 |
| V16.2 | The five existing cases in that file are unchanged and still pass | standards §8.4 |
| V16.3 | The file records **why** `InputTag` is not in the new block, so the omission reads as a decision | plan §6.1 |
| V16.4 | `scalar-styles.test.tsx`'s map carries per-component props; the five existing controls render with `{}` and pass unchanged; `MultiSelect` is added and passes | plan §6.2, standards §9.5 |
| V16.5 | That suite opens the popup and asserts the portalled `role="dialog"` carries `rc-scalar` | plan §6.2, R12.3 |

## 17. Documentation and demo

| | Criterion | Covers |
| --- | --- | --- |
| V17.1 | `demo/App.tsx` section shows the default control, one with filter + select-all, a portal/overflow case, and the committed array beside the header | plan §9.1, standards §10.4 |
| V17.2 | `docs/app/components/multi-select/` has `page.mdx`, `demo.tsx`, `property-index.tsx`, registered in `_meta.js`, following standards §10.2's structure with Thai prose and one demo per documented property | standards §10.1, §10.2 |
| V17.3 | **No mention of Wijmo, Linear, issue numbers or the review process** anywhere under `docs/app/components/` | standards §10.3 |
| V17.4 | `README.md` lists the new entry point and carries a section for the three non-obvious contracts: per-toggle `onChange`, `aria-required`-only, hidden-input submission | plan §9.3, standards §10.5 |
| V17.5 | `CHANGELOG.md` entry present | standards §10.6 |

## 18. Gate

| | Criterion |
| --- | --- |
| V18.1 | `npm run validate` passes end to end (`lint` → `typecheck` → `test` → `build` → `build:docs`) |
| V18.2 | The regenerated `src/scalar-utilities.css` is committed |
| V18.3 | Component behaviour is tested through the rendered component by role and visible value — no snapshots, no internal-state assertions (standards §9.1) |
| V18.4 | No criterion above is marked done by inspection where a test was possible |

---

## Requirement coverage

Every numbered requirement maps to at least one criterion:

| Requirement group | Criteria |
| --- | --- |
| R1 purpose and scope | V1.1–V1.4 |
| R2 options and value | V2.1–V2.10, V13.3, V13.5 |
| R3 header | V3.1–V3.10 |
| R4 drop-down and selection | V4.1–V4.8 |
| R5 filtering | V5.1–V5.15 |
| R6 select all | V6.1–V6.7 |
| R7 states | V7.1–V7.8 |
| R8 validation and error state | V8.1–V8.3 |
| R9 accessibility | V9.1–V9.26 |
| R10 form integration | V10.1–V10.3 |
| R11 localization | V11.1–V11.3 |
| R12 styling and layering | V12.1–V12.9 |
| R13 edge cases | V13.1–V13.7 |
| R14 naming | V14.1–V14.3 |

**Deliberately not asserted individually.** Six requirements state scope,
definitions or reasoning rather than behaviour, and there is nothing a test
could observe that would distinguish them being honoured from being ignored:

| | Why no criterion | Asserted in part by |
| --- | --- | --- |
| `R1.1` | What the control is | — |
| `R1.2` | Which kind of input it is, in `standards.md`'s sense | — |
| `R1.5` | The comparison with `InputTag` that justifies the control existing | — |
| `R2.2` | Why the option shape is fixed rather than generic | V2.1 asserts the shape, not the reasoning |
| `R10.2` | Why this is not the scalar submission gap `InputMask` declines to close | V10.2 asserts the behaviour, not the reasoning |

`R1.3` and `R1.4` are **not** in this list although they are worded as scope
("not in scope: free text", "not in scope: option groups, …"). A scope
exclusion is checkable by the absence it requires, and V1.1 and V1.2 check it.

Nor is `R9.5b`, which pairs a behaviour with its reasoning: V9.8 asserts the
behaviour, the reasoning is untestable like every entry above, and the
requirement is covered. Rationale carried *inside* an otherwise behavioural
requirement is not tracked here — only requirements that are rationale
throughout.

This list exists so that "no criterion cites this" reads as a decision rather
than an oversight. The check to run: the set of requirement ids cited by no
criterion must equal the first column above, exactly — a requirement that has
drifted out of coverage shows up as a mismatch rather than as silence.
