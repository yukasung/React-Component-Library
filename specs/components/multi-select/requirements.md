# MultiSelect — Requirements

**Status:** approved. Not implemented. `plan.md` and `validation.md` are
written and awaiting approval alongside this document's second amendment.

Amended twice, both times after review:

1. Before approval — four findings on the focus and keyboard model and on
   `checkOnFilter`'s trigger (**Decisions** #20–#23). The prop surface did not
   change.
2. After approval, with `plan.md` and `validation.md` written — nine findings,
   of which five changed behaviour (**Decisions** #24–#28) and one changed the
   prop surface: `onBlur` is now declared rather than inherited (R9.5d).

Defines **what** `MultiSelect` must do. How it is built is
[`plan.md`](plan.md)'s job and how it is checked is
[`validation.md`](validation.md)'s.

Reference API: Wijmo `MultiSelect`
(`developer.mescius.com/wijmo/api/classes/Wijmo_Input.Multiselect.html`, demo
`developer.mescius.com/wijmo/demos/Input/MultiSelect/Overview/react`). Per
`CLAUDE.md`, Wijmo is an API/UX reference, never a runtime dependency, and is
never mentioned in `docs/`.

Rules inherited rather than restated: [`../standards.md`](../standards.md) for
everything that applies to every input, `CLAUDE.md` for the commit model, the
prop-surface scope rule and the dropdown-open-state rule. This document states
only what is specific to `MultiSelect`.

Decisions settled while drafting are recorded in **Decisions** near the end.
Nothing is left open.

---

## 1. Purpose

R1.1 `MultiSelect` is a **closed-set multiple-choice field**: the consumer
supplies a list of options, the user checks any number of them from a
drop-down, and the field's header summarises what is checked.

R1.2 It is a **collection** input as defined in `standards.md` §2 — its value
is an array, its empty state is the empty array, and the rules that document
tags as **(scalar)** do not apply to it.

R1.3 **Not in scope**: free text. The user cannot introduce a value that is not
in `options`. That is `InputTag`'s job (see R1.5) and Wijmo's separate
`MultiAutoComplete` control.

R1.4 **Not in scope**: hierarchical options, option groups, per-option
disabling, a cap on how many options may be checked, virtualization of long
lists, and remote/async option loading. Each is a deliberate omission with its
reason in **Decisions**.

### 1.5 Why this is not `InputTag`, given §8.3

R1.5 `standards.md` §8.3 forbids adding a second way to do something that
already has one, and `InputTag` is already a multiple-choice combobox over a
fixed `options` list with a portalled menu. The overlap is real and is named
here rather than discovered in review.

They are different controls, and the difference is the shape of the value the
user is choosing, not decoration:

| | `InputTag` | `MultiSelect` |
| --- | --- | --- |
| Value | `readonly string[]` — the strings themselves | `readonly string[]` — **keys** into `options`, whose labels differ |
| Open set? | Yes — `addCustomTag` admits values not in `options` | No, closed set (R1.3) |
| Selected state shown as | Chips inside the field, each individually removable | A **summary header** — `"3 items selected"` — that does not grow with the selection |
| Rows | Plain labels, selection implied by `aria-selected` | **Checkboxes**, plus optional select-all |
| Finding an option | Scroll | Optional filter input (§5) |
| Field element | `<div role="combobox">` | `<input role="combobox">` (R9.1) |

The header is the load-bearing one. `InputTag` grows vertically with the
selection, which is right for three tags and unusable for forty; `MultiSelect`
occupies one fixed-height row whatever is checked, which is what makes it
usable for a long list — and is exactly why the reference API ships both.

R1.6 Neither control changes as a result of this one. `standards.md` §8.4
forbids refactoring a shipped component to enable a new one without separate
approval, and nothing here needs it: the pure rules `MultiSelect` shares with
existing components are imported, and its React wiring is its own copy
(`standards.md` §8.2).

## 2. Options and the value contract

R2.1 **Options are objects with a separate label and value.**

```ts
export interface MultiSelectOption {
  /** Committed, submitted, and the row's identity. Unique within `options`. */
  value: string
  /** What the row and the header display. */
  label: string
}
```

`options: readonly MultiSelectOption[]` is required and has no default; an
empty array is legal and renders an empty list (R13.1).

R2.2 **This collapses three Wijmo properties into one fixed shape.** Wijmo
binds an arbitrary dataset through `itemsSource` plus `displayMemberPath`
(which property to show), `selectedValuePath` (which to report) and
`checkedMemberPath` (which property on the item holds the checkbox state).

A fixed two-field option is taken instead of a generic `<T>` with member paths
because:

- Member paths are stringly-typed indirection that TypeScript cannot check;
  `standards.md` §3.2 requires real domain types, not
  strings-that-mean-something-else, and a mistyped `displayMemberPath` is a
  runtime blank rather than a compile error.
- A generic component cannot use `forwardRef` without the usual generics
  friction, and `standards.md` §2.10 requires `forwardRef` for new components.
- `checkedMemberPath` writes the checked state back **into the consumer's data
  objects**. That is a second source of truth for the value, which
  `standards.md` §2.3's controlled/uncontrolled contract already owns.
- Mapping a dataset to `{ value, label }` is one `.map()` in the consumer, and
  it is where the consumer's field names belong.

The cost, recorded: a consumer whose rows need more than a label — an icon, a
secondary line — cannot express it. That is `itemFormatter`/`isContentHtml`
territory and is deferred, not refused (**Decisions** #4).

R2.3 **Value.** Per `standards.md` §2.3 (collection):

- `value?: readonly string[]` / `defaultValue?: readonly string[]`, default
  `[]`. The empty array is the empty field; `null` is not used.
- `onChange?: (value: readonly string[]) => void` receives the option
  **values**, never the option objects and never an event.

A consumer that needs the objects maps them back through its own `options`
array, which it already holds. Handing both to `onChange` would make the
callback the only place in the library with a two-argument value signature.

R2.4 **The committed array is in `options` order.** Not selection order.

`InputTag` appends in the order the user picked, which suits chips rendered in
that order. `MultiSelect` renders a count or a label list, so selection order
is invisible — and an order the user cannot see is an order they cannot
control, which makes it noise in a submitted payload. Canonical order also
means checking three boxes one at a time and pressing select-all produce the
identical array, so a consumer comparing arrays for equality gets a stable
answer.

R2.5 **A value with no matching option is preserved, not dropped.**

`options` arriving after `value` is ordinary — a form hydrates from a record
while the option list is still loading. Silently filtering the value down to
what `options` currently knows about would destroy the user's data on first
render and then report the loss through `onChange`, which R2.7 forbids anyway.

So an unmatched value:

- stays in the committed array through every subsequent toggle and select-all;
- is **counted** in the header, and where the header lists labels (R3.3) it
  contributes its own `value` string, since no label exists for it;
- sorts after every matched value, in the order it arrived (R2.4 can only
  order what `options` contains);
- is not rendered as a row, because there is no row to render;
- can therefore only be removed by the consumer, not by the user.

R2.6 **Duplicate option values: the first wins.** Later duplicates are not
rendered and cannot be checked. A duplicate is a consumer bug, and the
alternative — two rows whose checkboxes move together — is a worse way to
report it than one row.

R2.7 **Receiving a prop never commits.** Applying `value`, `defaultValue` or a
changed `options` re-renders and fires no `onChange`, exactly as an external
`value` change does in every other control (`standards.md` §9.4).

In particular, a changed `options` that no longer contains a checked value does
**not** produce an `onChange` removing it — it stays, per R2.5.

## 3. The header

R3.1 The header is the text the field shows while the drop-down is closed. It
is **derived**, never stored: from `value`, `options`, `maxHeaderItems` and
`headerFormat`/`headerFormatter`, recomputed on render.

R3.2 **Nothing checked** → the header is empty and `placeholder` shows
through, natively (R9.1 makes the field a real `<input>`).

R3.3 **At most `maxHeaderItems` checked** (default `2`, Wijmo's) → the labels,
in committed order (R2.4), joined by `", "`.

R3.4 **More than `maxHeaderItems` checked** → `headerFormat`, with every
occurrence of the literal `{count}` replaced by the number checked.
`headerFormat` defaults to `'{count} items selected'`.

R3.5 **No culture formatting.** Wijmo's default is `'{count:n0} items selected'`,
where `:n0` is a Globalize number format. There is no Globalize here and
`standards.md` §1.5 forbids adding one, so `{count}` is the only token and it
substitutes a plain `String(count)`. A `:`-suffixed token is not recognised and
is left in the string verbatim rather than silently dropped, so a consumer who
copies a Wijmo format string sees the mistake instead of losing the count.

R3.6 **`maxHeaderItems={0}`** means "never list labels" — the count form is
used from the first checked option. This is the useful reading of zero and
needs no separate prop.

R3.7 **`headerFormatter?: (checked: readonly MultiSelectOption[]) => string`
replaces R3.2–R3.4 entirely** when supplied, including the empty case, and
receives the matched options in committed order. Unmatched values (R2.5) are
passed as `{ value, label: value }` so the callback never has to handle a
missing label.

It returns a **string**, not a `ReactNode`, because the header is the value of
an `<input>` (R9.1) and an input can hold nothing else. Wijmo's
`IHeaderFormatter` likewise produces text. A consumer who returns `''` gets the
placeholder, per R3.2.

R3.8 **There is no `text` / `onTextChange` pair.** `standards.md` §2.6 scopes
that pair to a scalar's editable draft, and states that a component without one
must not grow it. `MultiSelect` has no draft: the header is derived output the
consumer already controls through `headerFormat`/`headerFormatter`, and the
filter text is drop-down state, which `standards.md` §2.9 keeps out of the prop
surface entirely (R5.6). Wijmo inherits `text` from `DropDown`; it is not
mapped.

## 4. Drop-down and selection behaviour

R4.1 **The drop-down's open state never leaves the component.** No `isOpen`, no
`onOpenChange`, no `isDroppedDown`, no `isDroppedDownChanged` — `CLAUDE.md`
settles this for the whole library and calls out that both halves existed once
and were removed. `aria-expanded` on the field is the only outward trace.

R4.2 **It opens** on a click anywhere on the field (including the drop-down
button), on `ArrowDown`/`ArrowUp`, on `Alt`+`ArrowDown`, on `Enter` or `Space`,
and — when `showFilterInput` is set — on a printable character (R5.4).

R4.3 **It closes** on a second click on the field or button, on `Escape`, on
`Alt`+`ArrowUp`, on a pointer-down outside the field and its popup, and on
`Tab` **off either end of the popup's focus stops** — not on any `Tab`, which
is settled by R9.7. It does **not** close on selection: checking a box in a multiple-choice
list and having the list vanish makes the second choice cost a second opening.
Wijmo has no `closeOnSelection` on this control, and `CLAUDE.md` records that
prop as removed from `InputTime` for the same kind of reason.

R4.4 **Checking a box commits immediately.** `onChange` fires once per toggle,
and once per select-all (§6).

This is the commit model of `CLAUDE.md`, not an exception to it. That model
defers `onChange` because a *typed draft* is not yet a value — it may be
half-finished or unparseable. A checkbox toggle has no draft and no
intermediate state: it is a "deliberate value gesture" in the same sense as a
spin click, an Arrow step or a calendar pick, all of which commit at once.
`InputTag` already behaves this way.

R4.5 **There is no transactional drop-down.** No OK/Cancel, and `Escape` does
not undo checks made while the list was open (R7.6). They were committed when
they were made, and a consumer that wants to stage edits holds the array itself
and passes it back as `value`.

R4.6 **Toggling is by option `value`**, compared with `===`. `InputTag`
compares its tags with `localeCompare(..., { sensitivity: 'accent' })` because
its values are human-typed text that may differ only by accent; option values
here are consumer-controlled keys, where an accent-insensitive match would make
two distinct keys collide.

R4.7 **`isReadOnly` and `isDisabled` block every toggle** and keep the
drop-down shut, per `standards.md` §4.4 and R7.3.

## 5. Filtering

R5.1 `showFilterInput?: boolean`, default `false` (Wijmo's). When set, the
drop-down renders a single-line text input **above the rows**, matching where
the reference puts it, and `filterInputPlaceholder?: string` (default
`'Filter'`) is its placeholder.

R5.2 **Matching** is a substring test of the filter text against the option's
`label`, case-insensitive unless `caseSensitiveSearch` (default `false`) is
set. Filtering hides rows; it never changes `value`, and a checked option that
the filter hides stays checked and stays in the committed array.

R5.3 `customFilter?: (option: MultiSelectOption, filterText: string) => boolean`
replaces R5.2's test. Wijmo's signature also passes the display text, which
here is always `option.label` and so is redundant. `undefined` means the
default test; the prop is not nulled out, because `undefined` already means
"not supplied" (`standards.md` §3.4).

R5.3a **It replaces the whole of R5.2, the empty-filter case included.** A
`customFilter` is consulted even when the filter text is `''`, so an empty filter
is not necessarily "every option": a predicate can define the list the user sees
before typing anything, which is the natural way to express a default view such
as "favourites first". Short-circuiting on empty text before consulting the
predicate would silently ignore it in exactly the state where it is most useful.

R5.3b **`caseSensitiveSearch` does not apply to a `customFilter`.** The predicate
receives the filter text as typed and decides its own case handling; folding it
first would take a decision that belongs to the consumer.

*Filled in during implementation.* The approved text said `customFilter`
"replaces R5.2's test" without settling whether R5.2's empty-filter behaviour was
part of that test, and R5.2 itself never stated the empty case (it lived only in
`plan.md`). These two rules state it (`specs/README.md`, "anything the spec left
genuinely unstated").

R5.4 **Typing into the field types into the filter.** With `showFilterInput`
set, a printable character pressed on the closed field opens the drop-down,
focuses the filter input and enters that character, so finding an option never
costs a deliberate second click. Without `showFilterInput` there is nothing to
type into and printable characters do nothing.

R5.5 **The filter text is cleared whenever the drop-down closes**, so the next
opening shows the whole list. A filter the user cannot see is a list that is
inexplicably missing rows.

R5.6 **The filter text is not in the prop surface** — not as a value, not as a
callback. It is drop-down state (`standards.md` §2.9), it never commits, and it
is discarded on close by R5.5. A consumer that wants to control which options
are offered filters `options`.

R5.7 **`checkOnFilter` is mapped, with its default inverted to `false`.**

Wijmo's documented behaviour is that changing the filter text automatically
checks every item the filter matches, and its default is `true`. That is a
real behaviour and consumers who want it can ask for it — but not by default:

- It makes **typing** change the committed value. R4.4 permits immediate
  commits for deliberate value gestures; entering filter text is a gesture
  about the *view*, and the user checked nothing.
- It fires `onChange` on every keystroke, which is the one thing
  `CLAUDE.md`'s commit model exists to prevent.
- It is lossy in a way the user cannot see: the matches it checks include rows
  scrolled out of sight, and clearing the filter (R5.5) leaves them checked
  with no record of where they came from.

So `checkOnFilter?: boolean` defaults to `false`, and its doc comment states
the divergence. When `true`, it commits the union of the current value and every
matching option's value — a union, not a replacement, so it never silently
unchecks.

R5.7a **It fires only for filter text the user typed, and only while that text
is non-empty.** Saying "each filter change" was wrong, and wrong in a way that
loses data: R5.5 clears the filter on close, an empty filter matches every
option, and the two together would make `Escape` check the entire list on its
way out. So the trigger is enumerated rather than described:

**Two independent gates, in order.** The first asks *who* changed the filter, the
second asks *what happened to the match set*. Both must pass.

**Gate 1 — the change came from the user editing the filter input:**

| Filter text changed by | Passes gate 1? |
| --- | --- |
| The user typing, deleting, pasting, or replacing a selection in the filter input | **yes** |
| R5.5's clear-on-close, by any closing route | **no** |
| A change to `options`, `value`, `customFilter`, `caseSensitiveSearch` or `checkOnFilter` itself | **no** — a prop is not user input (R2.7) |
| Mount, including with a `defaultValue` | **no** |

**Gate 2 — the new match set N is a subset of the previous match set P
(`N ⊆ P`).** Nothing else. In particular **not** which keys were pressed:

| Relation | Passes gate 2? | Why |
| --- | --- | --- |
| `N ⊂ P` — strictly fewer matches | **yes** | the filter narrowed; this is the feature |
| `N = P` | **yes**, vacuously | the union adds nothing, so R5.7c fires nothing |
| `N ⊄ P` and `N ∩ P ≠ ∅` — overlapping | **no** | N contains options P did not; committing them is the surprise |
| `N ∩ P = ∅` — disjoint | **no** | same, in its strongest form |
| P empty (no options matched) | **yes** only if N is also empty | `N ⊆ ∅` holds only for `N = ∅` |

R5.7b **Set membership decides, not the edit.** Gate 2 is stated as a relation
between two sets because **no property of the keystroke predicts the relation**,
and two earlier attempts to write this rule in terms of the edit were both
wrong:

- "Only while the filter is non-empty" exempted exactly one keystroke. With 200
  country options and a filter reading `"united"` — three matches, committed —
  backspacing to `"u"` leaves a non-empty filter matching some ninety options,
  and every one would have been committed.
- "Every deletion widens the match set" is **false**. Deleting the middle
  character of `"abc"` gives `"ac"`, whose matches need not include `"abc"`'s at
  all — the two sets can be overlapping or wholly disjoint. Replacing a
  selection does the same, and `customFilter` (R5.3) is an arbitrary predicate
  with no monotonic relationship to the text at all: it may match *more* options
  for a longer string.

Under gate 2 every one of those cases is answered without asking what the user
pressed. `"abc"` → `"ac"` commits only if `"ac"`'s matches are a subset of
`"abc"`'s, which is exactly the condition that makes committing them
unsurprising, and it is checkable by the component without any theory about
editing.

Emptying the filter falls out rather than needing a rule: P is some small set, N
is every option, `N ⊆ P` fails, nothing commits. The full list returns and the
value stays as the last narrowing filter left it.

With a `customFilter` (R5.3a) an empty filter is whatever the predicate returns
rather than every option, so that sentence's "N is every option" is the
default-test case. The gate itself needs no adjustment — which is the payoff for
making membership authoritative instead of reasoning about what the text means.

R5.7d **Both gates are evaluated against the match set the field last
rendered**, not against a recomputed guess. P is the set that was visible before
this edit; the component retains it (`plan.md` §2.2) precisely so gate 2 is a
comparison rather than an inference.

R5.7c A commit under `checkOnFilter` is one `onChange` per filter change that
actually adds a value. A filter change whose match set adds nothing new fires
nothing, so holding a key down does not emit a run of identical arrays.

R5.8 **No `delay`.** Wijmo debounces filtering by 500 ms because its filter can
reach a remote `ICollectionView`. Filtering here is a synchronous pass over an
in-memory array with no I/O, so a debounce would only delay the response to a
keystroke. A consumer with a list long enough to feel it has a virtualization
problem (R1.4), which a timer does not solve.

## 6. Select all

R6.1 `showSelectAllCheckbox?: boolean`, default `false` (Wijmo's). When set,
the drop-down renders a native `<input type="checkbox">` above the rows — below
the filter input, if both are present, and **outside** the listbox — labelled
`selectAllLabel?: string`, default `'Select All'`.

Outside the listbox because `role="checkbox"` is not a permitted child of
`role="listbox"`. That is also why it is a focus stop of its own rather than a
row reached by `aria-activedescendant` (R9.5, R9.7a), and why it is not a
`role="option"` carrying `aria-checked="mixed"`: the rows in a multi-selectable
listbox express their state through `aria-selected`, which has no mixed value,
and a first row that spoke a different attribute from every other row would be
announced as one of them.

R6.2 **It acts on the currently visible rows**, that is on the filtered set,
not on every option. Acting on hidden options would let one click commit
values the user has filtered out of sight, which is R5.7's objection in
another form. With no filter applied the two sets are identical, which is the
common case.

R6.3 **Its state is three-valued** against that visible set: checked when
every visible row is checked, unchecked when none is, and `indeterminate`
otherwise. `indeterminate` is set on the DOM node — it is not an attribute —
and `aria-checked="mixed"` carries it to assistive technology.

R6.4 **Activating it** — by click, or by `Space`/`Enter` while it has focus
(R9.6) — checks every visible row when its state is unchecked or indeterminate,
and unchecks every visible row when its state is checked. One `onChange` per
activation, never one per row.

R6.5 **Values outside the visible set are untouched** by R6.4 — both options
the filter hides and unmatched values (R2.5). Unchecking select-all under a
filter therefore does not empty the field, and that is the point.

R6.6 With `options` empty, or with the filter matching nothing, the select-all
checkbox is rendered **unavailable** rather than hidden, so the drop-down does
not change shape as the user types.

Unavailable means `aria-disabled="true"` plus refusing activation — **not** the
native `disabled` attribute, which would remove it from the accessibility tree
and from the focus order, breaking R9.5's focus invariant (R9.5e) and hiding
the control's existence from a keyboard user. It is styled as disabled either
way, per `standards.md` §7.6.

## 7. States

R7.1 `isRequired?: boolean` defaults to **`false`**.

`standards.md` §2.5 defaults it to `true` for a new **scalar** input and
records that `InputTag` — the existing collection — defaults it to `false`.
`MultiSelect` follows the collection, and R7.2 is why that is not merely
consistency.

R7.2 **`isRequired` sets `aria-required` only; the consumer validates.**
`standards.md` §5.4 offers exactly these two behaviours and requires a new
component to state which it takes.

The native `required` attribute is refused, not overlooked, and the reason is
stronger than it first looks: **it would do nothing at all.** R9.1 makes the
field `readOnly`, and a `readonly` input is *barred from constraint validation*
by the HTML Standard — the constraint is never evaluated, so `required` on it
can neither block a submission nor report a violation.

Even if it were evaluated it would be wrong, because the `<input>` holds the
**header text** (R3.1): `"3 items selected"` is a non-empty value and satisfies
`required`, as does a `headerFormatter` that returns text for an empty
selection. A constraint evaluated against derived display text cannot mean "at
least one option is checked".

So a consumer who reached past this and set `required` would get silent
non-validation, which is worse than none. There is no native validity for an
array: it is `aria-required` plus the consuming form, as on `InputTag`.

R7.3 **`isRequired` has no effect on behaviour.** Nothing snaps back, nothing
is fabricated and blur is never refused. The scalar controls revert on blur
because they have a draft that can be half-finished; an empty `MultiSelect` is
a complete, unambiguous state, and there is no previous value to revert a
non-edit to.

R7.4 `isReadOnly` keeps the field focusable and submittable and blocks every
value change; the drop-down does not open. `isDisabled` blocks interaction,
removes the field from the tab order and excludes it from submission
(`standards.md` §4.4).

R7.5 Both carry `aria-readonly` / `aria-disabled` on the field in addition to
their effect, since the field is a `combobox` whose native `readOnly` means
something else (R9.1).

R7.6 **`Escape`** closes the drop-down, clears the filter (R5.5) and returns
focus to the field. It does not revert the value.

This is a stated divergence from `standards.md` §4.5 ("Escape reverts the draft
to the committed value without committing"), and it is a divergence only in
appearance: that rule reverts a *draft*, and R4.4 establishes there is none.
Reverting the value instead would make `Escape` an undo of arbitrarily many
committed changes, which no other control here does and which the second half
of §4.5 — "without committing" — cannot describe.

R7.7 There is no third editability axis. Wijmo inherits `isEditable` from
`ComboBox`, where it permits typing a value into the field; that is R1.3's
open set and R5.4 covers the legitimate reason to type.

## 8. Validation and error state

R8.1 Per `standards.md` §5.1, no `error`, `isInvalid`, `errorMessage`,
`helperText` or `label` prop, and no error styling. The consuming form owns
feedback.

R8.2 Because the field is a `combobox` built from an `<input>` with a
non-native role, `aria-invalid`, `aria-describedby`, `aria-errormessage` and
`aria-labelledby` are **declared explicitly** on the props interface rather
than left to `InputHTMLAttributes` passthrough — `standards.md` §5.2 requires
this of a component that does not extend an input's attributes, and R9.2 makes
this one only partly extend them.

R8.3 There is no invalid-input notification. Nothing the user can do is
refused: the option set is closed (R1.3), so there is no such thing as an
invalid entry. Wijmo's inherited `invalidInput` is not mapped.

## 9. Accessibility

R9.1 **The field is a real `<input type="text">` carrying
`role="combobox"`**, `readOnly` to the browser, holding the derived header
text (§3).

An `<input>` rather than `InputTag`'s `<div role="combobox">` because it gives
the header native placeholder behaviour (R3.2) and a `ref` target that is what
a form library expects to focus (`standards.md` §2.10). Truncation is **not** a
reason: `text-overflow` initially computes to `clip`, so an `<input>` clips a
long header without an ellipsis, and a `<div>` given the same
`text-overflow: ellipsis` does the job identically (R13.6). It is
`readOnly` so no text caret or mobile keyboard appears and the header cannot be
edited; when `showFilterInput` is set, typing is still accepted and routed into
the filter (R5.4).

R9.2 The props interface extends
`Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'required' | 'readOnly' | 'disabled' | 'role' | 'onBlur' | 'onFocus'>`.
`role` is omitted along with the rest because a consumer overriding it breaks
every rule below; `onBlur` and `onFocus` because they are redefined over the
whole control rather than the `<input>` (R9.5d).

R9.3 **The popup is a `dialog`**: the field carries
`aria-haspopup="dialog"`, `aria-controls` naming the popup's `useId`-generated
id, and `aria-expanded`. Inside it, a `role="listbox"` with
`aria-multiselectable="true"` holds one `role="option"` per visible row, each
with `aria-selected` and a rendered checkbox.

`dialog` rather than `listbox` because the popup may also hold a filter input
(§5) and a select-all checkbox (§6), neither of which is a permitted child of a
listbox. `standards.md` §6.2 allows either value, "whichever the open popup
is", and `InputDate`'s popup is already a dialog.

The value is **fixed**, not derived from which features are enabled: there is
one popup whose contents vary with props, and announcing it as a listbox when
`showFilterInput` is unset would make the same popup change kind under a prop
the user cannot perceive. `InputDateTime` does vary its `aria-haspopup`, and
that is not a counter-example — it has *two* separate popups, a calendar and a
time list, and the attribute names whichever one is open.

R9.4 `aria-autocomplete="none"` on the field, per `standards.md` §6.2. The
filter narrows the list; it never completes the field's text, which is the
derived header.

### Focus, while the popup is open (R9.5)

R9.5 **Opening moves DOM focus into the popup. Always.** A `dialog` popup
(R9.3) requires it: the combobox pattern's dialog variant moves focus inside,
and `aria-activedescendant` is only valid on the element that *has* focus and
that owns or controls the container holding the referenced descendant. Leaving
focus on the field while pointing it at rows inside a dialog satisfies neither
half.

The popup has **up to three focus stops**, in DOM order. Which exist depends on
props; which receives focus on open is the first that exists **and can accept
focus** (R9.5e):

| # | Stop | Exists when | On focus it carries |
| --- | --- | --- | --- |
| 1 | Filter input — a native `<input type="text">` | `showFilterInput` | `aria-controls` naming the listbox, and `aria-activedescendant` naming the active row |
| 2 | Select-all — a native `<input type="checkbox">` | `showSelectAllCheckbox` | nothing; it is its own control (R6.3) |
| 3 | The listbox — `role="listbox"`, `tabIndex={-1}` | always | `aria-activedescendant` naming the active row |

R9.5e **A stop that cannot accept focus is skipped, by both opening and `Tab`.**
Stop 2 is the case that makes this necessary rather than defensive: R6.6 renders
select-all unavailable whenever the visible set is empty, so with
`options={[]}`, `showSelectAllCheckbox` set and `showFilterInput` unset, "the
first stop that exists" is a control the browser cannot focus — and focus would
stay on the field, which is the arrangement this section exists to forbid. The
same gap is reachable by `Tab` from a filter input whose text matches nothing.

Two changes close it, and both are wanted:

- **R6.6's unavailable select-all is `aria-disabled`, not the native
  `disabled` attribute.** A native `disabled` control is removed from the
  accessibility tree and cannot be focused or announced, so a keyboard user
  cannot discover that select-all exists; `aria-disabled` keeps it focusable
  and announced while it refuses activation. Under this it is never skipped,
  which is the better outcome.
- **The skip rule stands anyway**, as R9.5's wording, so a stop that becomes
  genuinely unfocusable for any later reason cannot silently break the
  invariant. Where every stop is unfocusable, the listbox is stop 3 and is
  always focusable, so the invariant has a floor.

  It is **purely defensive and currently unreachable**: with the first fix in
  place, nothing in this control is ever natively `disabled`, so no stop is ever
  skipped. No criterion asserts the skip, because no input reaches it — what
  V9.7a and V9.7b assert is the first fix, that an unavailable select-all keeps
  focus rather than losing it. Do not add a criterion for the skip without first
  introducing a stop that can actually be unfocusable.

R9.5a **`aria-activedescendant` therefore lives on stop 1 or stop 3, never on
the field.** The filter input is not a listbox and does not contain the rows,
so its `aria-controls` is what makes the reference resolvable — without it the
attribute names a descendant of an element the focused input has no stated
relationship to. The listbox contains its own rows and needs no `aria-controls`.

R9.5b **When neither optional stop exists, focus moves to the listbox itself.**
This is the ordinary case (both features default to `false`) and it is why the
listbox is focusable at all. It is the one place this control cannot follow
`InputTime`, which keeps focus on its `<input>` and announces
`aria-haspopup="listbox"` — a listbox popup may keep focus outside; a dialog
popup may not (R9.3).

R9.5c **Closing returns focus to the field**, by every route that closes:
`Escape`, `Alt`+`ArrowUp`, a second click on the field or button, and `Tab` or
`Shift`+`Tab` off either end of the stops (R9.7).

A pointer-down outside the control is the exception, and the exception has a
mechanism rather than just an intention. Focus must leave the popup **before**
the popup is unmounted: removing a focused node does not reliably produce a
blur, so a popup that simply vanishes from under the focused element leaves the
field looking focused (R9.7c) and never reports the exit (R9.5d). So focus is
handed to the field first — exactly as `InputTag` does, and for the reason its
own comment gives — and the browser's ordinary focus change to whatever the
pointer targeted then produces the blur.

This does not fight the pointer's destination:

- a focusable target takes focus immediately afterwards and wins;
- a target that takes no focus leaves the field holding it, which is correct —
  nothing else asked for it, and a native `select` behaves the same way.

R9.5d **`onBlur` fires only when focus leaves the whole control**, popup
included. Moving between the field and the popup's stops is internal and reports
nothing, the same contract `InputTag` documents for its portalled menu.

Two consequences for the prop surface, both of which follow from focus moving
into the popup at all and neither of which the inherited attribute can express:

- **`onBlur` is declared, not inherited.** `InputHTMLAttributes<HTMLInputElement>`
  types it `FocusEventHandler<HTMLInputElement>`, and an exit from the listbox
  or the select-all checkbox is a `FocusEvent` on a different element — the
  inherited type promises an `HTMLInputElement` the consumer would not receive.
  So `'onBlur'` joins R9.2's omit list and the prop is declared as
  `FocusEventHandler<HTMLElement>`, exactly as `InputTag` declares its own.
- **The boundary test comes before the composition, not after.**
  `standards.md` §4.6's `afterInputEvent` invokes the consumer
  *unconditionally*, which is right for a scalar where every blur is a real
  exit. Here the internal bookkeeping runs on every focus change, and the
  consumer's callback runs only for those that cross the control's boundary —
  so the filter is applied first and `afterInputEvent` composes what survives
  it. **This applies to `onFocus` exactly as it does to `onBlur`**: entering the
  control is reported, moving from the field to a popup stop is not. §4.6 is
  unchanged for `onKeyDown`, `onClick` and `onMouseDown`, which are single
  events with no boundary to test.

### Keyboard (R9.6)

R9.6 Per `standards.md` §6.4, **split by which element has focus**, because the
filter input is a text field and text editing wins there. The active row is a
highlight, not a selection; moving it commits nothing.

**Focus on the field (popup closed):**

| Key | Effect |
| --- | --- |
| `ArrowDown` / `ArrowUp` | opens; active row first / last |
| `Alt`+`ArrowDown` | opens |
| `Enter` / `Space` | opens |
| printable | with `showFilterInput`, opens and enters that character in the filter (R5.4); otherwise nothing |
| a modifier chord | nothing — see R9.6b |
| `Tab` | natural form order |

**Focus on the filter input:** every key a text field owns keeps its text
meaning. This is the conflict the previous single table created — `Space` in
`New York` must insert a space, not toggle a row.

| Key | Effect |
| --- | --- |
| printable, `Space`, `Backspace`, `Delete` | **text editing**, always |
| `Home` / `End`, `ArrowLeft` / `ArrowRight` | **caret movement**, always |
| `Ctrl`/`Cmd`+`A` | **select the filter text**, always |
| `ArrowDown` / `ArrowUp` | moves the active row, clamped |
| `Enter` | toggles the active row; does not close. **This is the selection gesture here** — the only one, since `Space` is text |
| `Alt`+`ArrowUp`, `Escape` | closes (R7.6) |
| `Tab` / `Shift`+`Tab` | next / previous stop (R9.7) |

**Focus on the select-all checkbox:**

| Key | Effect |
| --- | --- |
| `Space` / `Enter` | toggles it, per R6.4 |
| `ArrowDown` / `ArrowUp` | moves focus to the listbox, active row first / last |
| `Escape`, `Alt`+`ArrowUp` | closes |
| `Tab` / `Shift`+`Tab` | next / previous stop |

**Focus on the listbox:**

| Key | Effect |
| --- | --- |
| `ArrowDown` | moves the active row down, clamped at the last row |
| `ArrowUp` | moves the active row up; **on the first row**, moves focus to the select-all checkbox when one exists (R9.7a), and otherwise clamps |
| `Home` / `End` | first / last visible row |
| `Space` / `Enter` | toggles the active row; does not close |
| printable | with `showFilterInput`, moves focus to the filter input and enters that character; otherwise nothing |
| `Escape`, `Alt`+`ArrowUp` | closes (R7.6) |
| `Tab` / `Shift`+`Tab` | next / previous stop (R9.7) |

Clamping rather than wrapping, matching `useTimeDropdown`: wrapping past the
end of a long list loses the user's place.

**The `ArrowUp` exception is the one break in that clamping**, and it is stated
here and in R9.7a as the same rule rather than as two: at the first row,
`ArrowUp` hands focus **upward out of the listbox** to the select-all checkbox
if there is one. It is a focus transfer, not a move of the active row, so the
active row stays on row 0 and `ArrowDown` from the checkbox returns to it.
Without the exception the checkbox has no keyboard route but `Tab`.

R9.6b **A modifier chord is not a printable character.** "Printable" in R9.6's
field and listbox tables means a single character typed with no `Alt`, `Ctrl` or
`Meta` held. `Ctrl`/`Cmd`+`A` is select-all, not the letter `a`: treating it as
text opens the popup and types a character the user never meant, and on the
field it does so from a state where there was nothing to select. The filter
input is unaffected — it owns those chords as text-editing keys (R9.6), which is
the whole reason they must not be intercepted earlier.

R9.6a **With no visible rows there is no active row.** Reachable two ways —
`options={[]}` (R13.1) and a filter matching nothing (R6.6) — and every rule
in R9.6 that names "the active row" has nothing to name, so:

- `aria-activedescendant` is **omitted**, not set to an empty string, on
  whichever stop holds focus.
- `ArrowDown`, `ArrowUp`, `Home`, `End`, `Space` and `Enter` are no-ops on the
  listbox, and `Enter` is a no-op in the filter input. They commit nothing and
  move nothing.
- Everything that is not about a row is unaffected: the popup opens, focus
  still enters it (R9.5, with the listbox as the floor), `Escape` still closes,
  `Tab` still walks the stops, and the filter input still accepts text — which
  is the only way out of a filter that matches nothing.

### Tab, and the tab-stop count (R9.7)

R9.7 **`Tab` walks the popup's stops, and falls back to the field at the ends.**
From a stop that has a next one it advances, skipping any that cannot take focus
(R9.5e). From the **last** stop it closes the popup and returns focus to the
field; `Shift`+`Tab` mirrors it and does the same from the **first** stop
(R9.5c). A second `Tab` from the field then follows the natural form order.

Returning to the field rather than advancing straight to the next form control
costs one keystroke and buys implementability: under `portal={true}` the last
stop is a child of `document.body`, so "the next control in the form" is not
where the browser's own `Tab` would go from there, and honouring it would mean
computing the next tabbable element relative to the field and focusing it
explicitly — with its own edge cases when the field is last in the form or the
next tabbable is inside another portal. The field is a fixed, known destination
in both portalled and inline modes.

This is a stated divergence from `standards.md` §6.4's "Tab follows the natural
form order and closes any popup", and the reason is that the rule was written
for popups with no focusable content of their own: `InputDate`'s calendar is
flatpickr's, and `InputTime`'s list is driven entirely by
`aria-activedescendant`. A popup that owns a filter input and a checkbox has to
let `Tab` reach them — and the alternative, trapping `Tab` inside a *non-modal*
popup, is worse: `Escape` would become the only exit.

R9.7a **The select-all checkbox is reached by `Tab`, and by `ArrowUp` on the
first row** — the single exception to R9.6's clamping, stated there in the same
terms. It is a real focusable checkbox, not an option: `role="checkbox"` is not
a permitted child of `role="listbox"`, so it cannot be a row and cannot be
addressed by the listbox's `aria-activedescendant`.

Giving it a private shortcut instead was considered and refused. `Ctrl`+`A` is
the conventional one, and although it is free in the default configuration —
`showFilterInput` is `false`, so there is no text field to own it — it is taken
the moment a filter input exists. A gesture that changes meaning with a prop is
worse than one extra `ArrowUp`.

R9.7b **The control contributes exactly one tab stop to the page**: the field.
The stops in R9.5's table are inside the popup, which exists only while open,
and R9.7 makes `Tab` leave the control at either end rather than adding
document-order stops beside the field. The drop-down button and every row stay
`tabIndex={-1}`, per §6.4.

R9.7c **The field keeps its focus ring the whole time the popup is open**,
including while focus is on one of the popup's stops. Anything else makes the
field read as unfocused while the user is typing into its filter.

It cannot be done with `focus-within:` on the wrapper. `:focus-within` matches
an element containing the focused element **in the tree**, and a portalled popup
(R12.3) is a child of `document.body`, not of the wrapper — so under
`portal={true}`, the default arrangement for an overflow-constrained form, the
ring would vanish the instant the popup took focus. A React portal forwards
*events* through the React tree; it does not change the DOM tree, which is what
CSS resolves against.

So the ring is driven by the component's own focus state — it already knows
which stop holds focus (R9.5) — and applied as a class on the wrapper, in both
portalled and inline modes so the two do not diverge. `standards.md` §7.5's
`focus-within:` provision covers a border on a wrapper around a *contained*
input, which is not this case.

R9.8 Every interactive element has an overridable accessible name and every
icon is overridable (`standards.md` §2.8): `dropdownAriaLabel`
(default `'Toggle options'`), `dropdownIcon`, `checkedIcon`. The
select-all checkbox and the filter input are named by `selectAllLabel` and
`filterInputPlaceholder`, which already exist.

R9.8a **The popup and the listbox are named too, and neither inherits the
field's label.** A `role="dialog"` is *required* by WAI-ARIA to have an
accessible name, and the field's label — whether `aria-label`, `aria-labelledby`
or a native `<label for>` — names the `<input>` and nothing else. Two props,
both per §2.8:

| Element | Prop | Default |
| --- | --- | --- |
| `role="dialog"` popup | `popupAriaLabel` | the field's own `aria-label` when one was supplied, else `'Options'` |
| `role="listbox"` | `optionsAriaLabel` | `'Options'` |

`optionsAriaLabel` is the name `InputTime` already uses for exactly this
element; reusing it rather than coining a synonym is `standards.md` §2.11
applied inside the library.

R9.8b **The default chains to the field's `aria-label` because that is the one
label the component can read.** `aria-label` arrives as a prop, so a field
labelled `aria-label="Countries"` gives a popup announced as "Countries" — the
useful outcome, and free.

A native `<label for>` or `aria-labelledby` cannot be resolved this way: the
component never sees the label element, and `aria-labelledby` pointing at an
`<input>` would compute that input's *value* — the header text — not its label.
So a consumer who labels the field either of those ways and wants a matching
popup name sets `popupAriaLabel` explicitly, and the prop's doc comment says so.
Left unset the popup is announced as "Options", which is correct and generic
rather than wrong.

R9.9 **No `inputMode`.** `standards.md` §6.6 requires a new *digit-entry*
component to decide it explicitly; this is not one, and the field is `readOnly`
(R9.1) so no mobile keyboard opens against it. The filter input takes none
either — it matches labels, which are text.

## 10. Form integration

R10.1 `name` renders one `<input type="hidden">` per committed value, as
`InputTag` does, so a native form submission carries the array rather than the
header text. They are `disabled` when the field is (R7.4).

R10.2 This is not the scalar gap `InputMask` R10.2 declines to close. There,
submitting something other than the displayed text would have made one scalar
differ from the other four. Here there is no candidate text to submit at all:
the header is a derived summary, and `"3 items selected"` is not a value in any
reading.

R10.3 The documented contract remains `CLAUDE.md`'s: build the payload from the
committed value.

## 11. Localization

R11.1 No `locale` prop. Nothing in the control is language-dependent —
`options` are consumer-supplied, and R3.5 removes the one culture-formatted
piece the reference has.

R11.2 Every generated string is an overridable English default
(`headerFormat`, `selectAllLabel`, `filterInputPlaceholder`,
`dropdownAriaLabel`), per `standards.md` §2.8. A Thai application overrides
them; the library does not ship translations.

R11.3 Case-insensitive filtering (R5.2) uses a locale-aware lowercase
comparison so it behaves for non-ASCII labels. Thai has no case and is
unaffected.

## 12. Styling and layering

R12.1 `MultiSelect` uses the **`.rc-scalar` Tailwind path**, not `InputTag`'s
hand-written BEM stylesheet. `standards.md` §7.1 names that path for a new
scalar input and leaves a collection unstated; this control resolves the gap
toward `.rc-scalar` because it renders a real `<input>` in the shared field
shape (R9.1), because the generated stylesheet is the maintained half of §7.1's
inconsistency, and because a second BEM stylesheet would deepen the split the
standard already flags.

R12.2 It therefore observes the shared visual language of §7.5 — `h-11`,
`rounded-lg`, `border-gray-300`, `text-sm`, `shadow-theme-xs`, the brand focus
ring, `dark:` on every colour-bearing class — and §7.6's distinct disabled and
read-only treatments. No size variants (§7.7).

R12.3 The popup is portalled on `portal?: boolean` (default `false`) and
resolves its layer through `src/lib/layering.ts`: `portalZIndex` prop →
`--rc-z-popup` → `DEFAULT_POPUP_Z_INDEX`, carrying the field's `.dark` class
and `--rc-color-primary` across the portal boundary (§7.8).

R12.4 `maxDropdownHeight?: number`, default `240`, caps the scrollable row
area — Wijmo's `maxDropDownHeight`, cased per `CLAUDE.md`'s normalization rule.
The filter input and select-all checkbox are **outside** the scroll area, so
they stay reachable in a long list.

R12.5 `maxDropdownWidth` is **not** mapped. The popup is the field's width,
clamped to the viewport, as every popup in this library already is; a consumer
who needs otherwise has `className` and the custom properties.

R12.6 `showDropdownButton?: boolean`, default **`true`** (Wijmo's
`showDropDownButton` default). Unlike `InputTime`, where a numeric `step` also
gates the button, there is nothing here for the button's presence to depend on
— an option list always exists — so the prop stands alone.

## 13. Edge cases that change the contract

R13.1 **`options` empty.** The field renders, the drop-down opens on the usual
gestures and shows an empty list, and select-all is disabled (R6.6). It does
not refuse to open: a list that is empty because data has not arrived is
indistinguishable, to the user, from a control that is broken.

R13.2 **`options` changing while the drop-down is open.** The active row is
re-derived by clamping the stored index into the new visible range, the way
`useTimeDropdown` clamps on read rather than correcting by effect. The value is
untouched (R2.7).

R13.2a **The filter changing moves the active row to the first visible row**,
rather than clamping it where R13.2 would. The two cases differ in who caused
them: `options` changing is something that happened *to* the field, so the
user's place in the list is worth preserving as far as it still exists, while
editing the filter is the user asking for a different list — and a highlight
left on the fourth row of a list they have just replaced is disorienting.
`useTimeDropdown` reseeds on open for the same reason.

*Filled in during implementation.* The approved text specified R13.2 for
`options` and left the filter case unstated; this states it rather than leaving
it to whichever the code happened to do (`specs/README.md`, "anything the spec
left genuinely unstated").

R13.3 **A checked option removed from `options`.** It becomes an unmatched
value (R2.5): still committed, still counted, no longer a row.

R13.4 **`value` changed while the field is focused** reaches the field and
re-renders the header. There is no draft to protect from it (R4.4), so this
needs no special rule beyond stating that it is not suppressed.

R13.5 **Duplicate `value` entries in the committed array** are collapsed on
read — the header counts a value once and its row is checked once — but are not
rewritten, because rewriting would require an `onChange` R2.7 forbids. A toggle
that removes a duplicated value removes every copy.

R13.6 **A long label** truncates with an ellipsis in the header — by an explicit
`text-overflow: ellipsis`, `overflow: hidden` and `white-space: nowrap`, which
is a styling requirement rather than anything the `<input>` does on its own
(R9.1) — and wraps in its row, so the row shows the whole label. The header is a
fixed-height summary; the row is where the user reads the option.

R13.7 **StrictMode** double-mount leaves no listener, observer or portal node
behind, per `standards.md` §9.4.

## 14. Naming

R14.1 The component is **`MultiSelect`**, the directory
`src/components/MultiSelect/`, the kebab name `multi-select`, the subpath
`./multi-select`, the docs page `docs/app/components/multi-select/`.

R14.2 It is **not** named `InputMultiSelect`. The `Input*` prefix on the
existing six is not a library convention — it is the reference API's own naming
for the six controls ported so far (`wijmo.input.InputNumber`,
`wijmo.input.InputDate`, …), and the reference calls this one
`wijmo.input.MultiSelect`. `standards.md` §2.11 chooses names against the
reference; inventing a prefix here would be the invention.

R14.3 Its pure logic goes in a module named for what it holds, beside the
existing `src/lib/inputMask.ts` naming problem rather than adding to it — the
module name is `plan.md`'s to fix, not this document's.

---

## Decisions

Settled while drafting:

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | Is this a duplicate of `InputTag` under §8.3? | **No.** Closed set, summary header, checkbox rows, filter — the header is what makes a long selection usable and is why the reference ships both (R1.5). Neither existing control changes (R1.6). |
| 2 | Option shape: generic `<T>` + member paths, plain strings, or fixed objects? | **Fixed `{ value, label }`.** Member paths are unchecked stringly-typed indirection and `checkedMemberPath` is a second source of truth; plain strings cannot separate label from key (R2.1, R2.2). |
| 3 | Committed order: selection or `options`? | **`options` order.** Selection order is invisible in a summary header, so it is noise in a payload; canonical order makes select-all and per-row checking produce the same array (R2.4). |
| 4 | Per-option rendering (`itemFormatter`, `isContentHtml`) | **Deferred**, not refused. A label is enough for the first version; the fixed option shape is what would have to grow, and that is a separate decision (R2.2). |
| 5 | Per-option `isDisabled` | **Omitted.** Not in the reference's own surface, and an option the user may not choose can be left out of `options` (R1.4). |
| 6 | A cap on how many may be checked (`InputTag`'s `maxSelectedTags`) | **Omitted.** Not in the reference's surface, and `standards.md` §5.1 makes a count constraint the consuming form's job. |
| 7 | Does a value with no matching option survive? | **Yes** — options load after values routinely, and dropping it would destroy data and need a forbidden `onChange` to report it (R2.5). |
| 8 | Does `onChange` defer to blur, per the commit model? | **No — it fires per toggle.** The model defers *drafts*; a checkbox has none, so a toggle is a deliberate value gesture like a calendar pick (R4.4). |
| 9 | `checkOnFilter`'s default | **Inverted to `false`.** The reference's `true` makes typing a filter commit values the user never checked, and fires `onChange` per keystroke (R5.7). Mapped, so it can be opted into; when on, it unions rather than replaces. |
| 10 | `delay` | **Omitted.** Filtering is a synchronous in-memory pass with nothing to debounce; a long list is a virtualization problem (R5.8). |
| 11 | `customFilter` | **Mapped**, minus the redundant display-text argument. A consumer cannot pre-filter `options` for a rule that depends on the filter text (R5.3). |
| 12 | What does select-all act on under a filter? | **The visible set only**, three-valued against it, leaving hidden and unmatched values untouched (R6.2, R6.5). |
| 13 | `isRequired`: native `required` or `aria-required`? | **`aria-required` only.** The `<input>` holds derived header text, which the browser would accept as satisfying `required` (R7.2). Defaults to `false`, following the existing collection (R7.1). |
| 14 | What does `Escape` do without a draft? | **Closes and clears the filter; does not revert the value.** Reverting would make it an undo of many committed changes (R7.6). |
| 15 | Field element: `<input>` or `<div role="combobox">`? | **`<input readOnly>`.** Native placeholder and a `ref` target a form library can focus (R9.1). *Amended:* "native ellipsis" was also given as a reason and is false — `text-overflow` initially computes to `clip` — so truncation is an explicit style either way (R13.6). |
| 16 | Popup role | **`dialog`**, always — it may hold a filter input and a select-all checkbox, which a `listbox` may not, and a role that varies with a prop is a worse contract (R9.3). |
| 17 | Styling: `.rc-scalar` or a second BEM sheet? | **`.rc-scalar`**, resolving §7.1's gap for collections toward the maintained half (R12.1). |
| 18 | Where does the filter input live? | **Inside the drop-down, above the rows**, as the reference documents it; focus moves there on open and carries `aria-activedescendant` (R5.1, R9.5). |
| 19 | Component name | **`MultiSelect`**, not `InputMultiSelect` — the prefix on the other six is the reference's naming, not a convention (R14.2). |
| 20 | Where does DOM focus go when the popup opens? | **Into the popup, always** — to the filter input, else the select-all checkbox, else the listbox, which is focusable for exactly this reason. A `dialog` popup requires it, and `aria-activedescendant` is only valid on the focused element that controls the rows' container (R9.5, R9.5a). This is the one place the control cannot copy `InputTime`, whose `listbox` popup may keep focus on the field. |
| 21 | How does the keyboard reach the select-all checkbox? | **`Tab`, and `ArrowUp` from the first row.** It is a real focusable checkbox outside the listbox, because `role="checkbox"` is not a permitted listbox child and so cannot be an activedescendant row (R6.1, R9.7a). A private `Ctrl`+`A` shortcut was refused — the filter input already owns that key. |
| 22 | Does `Tab` close the popup, per §6.4? | **Not from the middle.** It walks the popup's stops and closes only off either end, returning to the field on `Shift`+`Tab` off the first. §6.4 assumed a popup with no focusable content; trapping `Tab` in a non-modal popup would leave `Escape` as the only exit (R9.7). One document tab stop is preserved (R9.7b). |
| 23 | What counts as a filter change for `checkOnFilter`? | **User-typed text only, and only while non-empty**, enumerated in a table rather than described. "Each filter change" plus R5.5's clear-on-close made `Escape` check the entire list; an empty filter now commits nothing (R5.7a, R5.7b). |

| 24 | Focus lands on a stop `R6.6` made unavailable | **Two fixes.** Unavailable select-all is `aria-disabled`, not native `disabled`, so it stays focusable and announced; and R9.5 skips any stop that cannot take focus regardless, with the always-focusable listbox as the floor (R9.5e, R6.6). |
| 25 | `ArrowUp` on the first row: clamp, or reach select-all? | **Reach select-all**, as the single stated exception to clamping, written the same way in R9.6 and R9.7a. It is a focus transfer; the active row does not move (R9.6, R9.7a). |
| 26 | How does the field keep its focus ring while the popup has focus? | **Component focus state, not `:focus-within`.** A portalled popup is not in the wrapper's tree, so `:focus-within` would drop the ring under `portal={true}` — a React portal forwards events, not DOM containment (R9.7c). |
| 27 | Can `onBlur` stay inherited from `InputHTMLAttributes`? | **No.** Its type promises an `HTMLInputElement` that an exit from the listbox does not deliver, and `afterInputEvent` invokes the consumer unconditionally while R9.5d fires only across the control's boundary. `onBlur`/`onFocus` are declared, and the boundary test precedes the composition (R9.5d, R9.2). |
| 28 | Which filter changes does `checkOnFilter` act on? | **Two gates: a user edit, and `N ⊆ P` on the match sets.** Set membership is authoritative; no property of the keystroke is. Both earlier attempts — "non-empty", then "every deletion widens" — were wrong, the second factually: `"abc"` → `"ac"` can be disjoint, and `customFilter` is not monotonic at all (R5.7a, R5.7b). |
| 29 | Do the popup and listbox need their own accessible names? | **Yes, and they cannot inherit the field's.** ARIA requires a `dialog` to be named, and the field's label names only the `<input>`. `popupAriaLabel` defaults to the field's `aria-label` — the one label the component can read — and `optionsAriaLabel` reuses `InputTime`'s existing name for the same element (R9.8a, R9.8b). |
| 31 | Does `customFilter` also replace the empty-filter case? | **Yes**, and `caseSensitiveSearch` does not apply to it. An empty filter is the state where a default view is most useful, and short-circuiting before the predicate would ignore it there (R5.3a, R5.3b). Filled in during implementation. |
| 30 | Is `onFocus` boundary-filtered like `onBlur`? | **Yes.** R9.5d claimed it had "no boundary to test" and in the next sentence required it to fire only on entering the control. Both callbacks are filtered; only `onKeyDown`/`onClick`/`onMouseDown` are not (R9.5d). |

No open decisions remain.

**Two recommendations were declined and are recorded so they are not reopened
as oversights:** publishing `optionList.ts`'s helpers as public API (kept
internal — `plan.md` §8.1), and having `Tab` off the last stop advance straight
to the next form control (it returns to the field instead — R9.7).

## Proposed prop surface

Everything below is Wijmo's `MultiSelect` surface — its own properties plus
the inherited ones that survive `CLAUDE.md`'s scope rule — with the
React-structural exceptions `CLAUDE.md` allows (`defaultValue`, `on*`, `ref`,
inherited `InputHTMLAttributes`). Nothing is invented beyond those.

```ts
export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectProps
  extends Omit<
      InputHTMLAttributes<HTMLInputElement>,
      'value' | 'defaultValue' | 'onChange' | 'type' | 'required' | 'readOnly' | 'disabled' | 'role' | 'onBlur' | 'onFocus'
    > {
  /** Focus crossing the whole control's boundary, popup included — not each internal move. R9.5d */
  onFocus?: FocusEventHandler<HTMLElement>
  onBlur?: FocusEventHandler<HTMLElement>

  options: readonly MultiSelectOption[]

  /** Option values, in `options` order. Unmatched values are preserved. R2.3–R2.5 */
  value?: readonly string[]
  defaultValue?: readonly string[]                 // default []
  onChange?: (value: readonly string[]) => void

  // Header (§3)
  headerFormat?: string                            // default '{count} items selected'
  headerFormatter?: (checked: readonly MultiSelectOption[]) => string
  maxHeaderItems?: number                          // default 2

  // Filtering (§5)
  showFilterInput?: boolean                        // default false
  filterInputPlaceholder?: string                  // default 'Filter'
  caseSensitiveSearch?: boolean                    // default false
  /** Reference default is true; inverted here. R5.7 */
  checkOnFilter?: boolean                          // default false
  customFilter?: (option: MultiSelectOption, filterText: string) => boolean

  // Select all (§6)
  showSelectAllCheckbox?: boolean                  // default false
  selectAllLabel?: string                          // default 'Select All'

  // States (§7) — aria-required only, and no behavioural effect. R7.2, R7.3
  isRequired?: boolean                             // default false
  isReadOnly?: boolean                             // default false
  isDisabled?: boolean                             // default false

  // Popup and layering (§12)
  showDropdownButton?: boolean                     // default true
  maxDropdownHeight?: number                       // default 240
  portal?: boolean                                 // default false
  portalZIndex?: number

  // Overridable names and icons (R9.8, R9.8a)
  dropdownAriaLabel?: string                       // default 'Toggle options'
  /** Names the role="dialog" popup, which ARIA requires. Defaults to the field's own aria-label, else 'Options'. R9.8a, R9.8b */
  popupAriaLabel?: string
  optionsAriaLabel?: string                        // default 'Options' — names the listbox
  dropdownIcon?: ReactNode
  checkedIcon?: ReactNode

  // Declared explicitly, per §5.2 and R8.2
  'aria-invalid'?: AriaAttributes['aria-invalid']
  'aria-describedby'?: string
  'aria-errormessage'?: string
  'aria-labelledby'?: string

  name?: string
  className?: string
}
```

Wijmo members deliberately **not** mapped, beyond those in **Decisions**:

`isDroppedDown` / `isDroppedDownChanged` / `isDroppedDownChanging` (R4.1);
`text` / `textChanged` (R3.8); `checkedItems` in its item-carrying form and
`checkedMemberPath` (R2.2, R2.3); `displayMemberPath` / `selectedValuePath` /
`itemsSource` / `collectionView` (R2.1); `selectedIndex` / `selectedItem` /
`selectedValue` (single-selection surface from `ComboBox`, meaningless here);
`isEditable` (R7.7); `invalidInput` (R8.3); `itemFormatter` / `isContentHtml` /
`formatItem` (Decision #4); `delay` (R5.8); `maxDropDownWidth` (R12.5);
`virtualizationThreshold` (R1.4); `trimText`, `headerPath`,
`keyActionPrintCharacters` / `keyActionDownArrow` / `keyActionUpArrow` /
`keyActionTab` / `clickAction` (keyboard and pointer behaviour is fixed by
§9.6, not configurable); `isAnimated`, `dropDownCssClass`, `controlTemplate`
(styling is `className` plus the custom properties, §12); `rightToLeft` (no RTL
support anywhere in this library yet); `tabOrder` (native `tabIndex`);
`hostElement` / `inputElement` / `dropdown` / `listBox` (the forwarded `ref`
covers what a React consumer needs); `inputType`; `handleWheel` (nothing steps
— there is no value axis a wheel notch could move); `ariaLabelledBy`
(`aria-labelledby`, declared above); and the imperative `Control` base
(`focus`, `beginUpdate`, `endUpdate`, `invalidate`, `selectAll`, the `on*`
raisers, the statics) — not a React API.
