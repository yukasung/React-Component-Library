# InputMask — Implementation plan

**Status:** draft, awaiting approval. Not implemented.

Implements [`requirements.md`](requirements.md) (approved). Rules inherited
from [`../standards.md`](../standards.md) and `CLAUDE.md` are not restated.

---

## 0. Existing-code analysis

### 0.1 Reused as-is, by import

| Module | What for |
| --- | --- |
| `src/hooks/useSyncedState.ts` | The draft that resyncs to a controlled `value` without a resync effect. Unchanged. |
| `src/lib/inputEvents.ts` | `composeInputEvent` for `onKeyDown`/`onMouseDown`/`onClick`, `afterInputEvent` for `onFocus`/`onBlur`. Required by `standards.md` §4.6 and by the cross-component contract test. |
| `src/lib/domSelection.ts` | `applySelection` for caret placement after a state-driven re-render; `selectRangeAtCaret` for click-to-position. **Not** `selectAllOnFocus` — R4/R9.4 place the caret at the first unfilled position on focus, not select-all (that is `InputNumber`'s numeric behavior). |
| — | **Nothing from `src/lib/inputMask.ts`.** `diffStrings` looked like the way to read a paste out of a `change` event, as `maskTemplate.ts` uses it, but R6.5 rules it out: a minimal diff cannot recover a paste that shares a prefix or suffix with what it replaced, and this control reads the clipboard text and the real selection off the paste event instead. Importing it would be importing a bug. |

### 0.2 Reused as a model, not as code

`src/lib/maskTemplate.ts` is the right **architecture** and the wrong **data
model**, so it is copied in shape rather than imported:

- Right: a full-width template that holds every position from the start; text
  derived from the template rather than the template from the text; editing
  driven from `keydown`; a one-shot auto-advance flag passed explicitly.
- Wrong: its `TemplateSlot` is a multi-character group with a numeric
  `{ width, min, max, fill }`, and its acceptance rules (`acceptDigit`,
  `canFinalizeDigits`) are range arithmetic. An `InputMask` position is a
  single grapheme with a character class; `L`/`A`/`a` have no numeric range at
  all (requirements R4.2).

Likewise `MaskSegment` and `maskPlaceholderRanges` in `inputMask.ts` are
width/range-derived and cannot describe `0 9 # L l A a`. **Nothing in
`src/lib/inputMask.ts` or `src/lib/maskTemplate.ts` is modified** — the three
shipped controls that depend on them are out of scope (Critical Rules: "do not
refactor unrelated existing components").

### 0.3 React wiring: copied, not shared

Per `standards.md` §8.2 and `CLAUDE.md` ("the React half is duplicated, not
shared"), `InputMask.tsx` holds its own entry state, selection application,
key handling and commit branch. It does not import wiring from
`InputDate`/`InputTime`/`InputDateTime`, and they are not changed to import
from it. `InputDate.tsx` is the closest read for how the wiring is arranged.

### 0.4 Dependencies

No new runtime dependency (`standards.md` §1.5). Grapheme segmentation uses
**`Intl.Segmenter`**, a platform built-in — verified available in Node 22 and
under this repo's jsdom test environment. Node ≥ 20 is already required by
`package.json` `engines`.

### 0.5 New code, and why each piece has to be new

| New | Why nothing existing covers it |
| --- | --- |
| `src/lib/maskPattern.ts` — Wijmo mask tokenizer + per-position character classes + grapheme rules | No existing tokenizer emits character classes; all three emit `MaskSegment` |
| `src/lib/maskField.ts` — the position template, caret model, insert/overwrite, paste, raw ↔ template | `maskTemplate.ts` is group-based (0.2) |
| `src/components/InputMask/` | The component |

Two modules rather than one, matching how `inputMask.ts` (vocabulary + rules)
and `maskTemplate.ts` (applying them to a field) are already split — the split
that lets the rules be unit-tested without a field.

---

## Task groups

Each group ends green: `npm run lint && npm run typecheck && npm run test`
pass before the next begins. Groups 1–3 are pure modules with no React, so
they are testable in isolation and land first.

### 1. Mask vocabulary — `src/lib/maskPattern.ts`

1.1 `MaskClass` type and the class table for `0 9 # L l A a`, each with
`{ required: boolean, accepts(cluster): boolean }` (R2.1).

1.2 `tokenizeMask(mask): MaskPattern | undefined` — walks the mask, handling
`\` escapes (R2.1), `> < |` case-conversion state (R2.2), and literals.
Returns `undefined` for an untokenizable mask so the caller can fall back to
unmasked mode (R2.4), never throwing.

1.3 `MaskPattern` carries the ordered positions (fillable with a class and a
case mode, or literal), plus derived `fillableCount`, `renderedWidth` and the
literal/fillable index tables. Deriving them once here is what keeps the field
module from recomputing positions per keystroke.

1.4 Grapheme handling: `splitClusters(text)` over `Intl.Segmenter`, plus the
base-character classification of R12.2, the `Mn`-unlimited / `Mc`+ZWJ-refused
rule of R12.3, and the 8-code-point abuse guard.

1.5 `applyCase(cluster, mode)` — skips conversion when it would change the
cluster count (`ß` → `SS`, R12.5).

1.6 `deriveInputMode(pattern)` — `'numeric'` only when every fillable position
is `0` or `9`; `#` yields `'text'` (R9.3).

**Tests** (`maskPattern.test.ts`): every class accepts/refuses the right
characters; escapes; case-conversion state including `|`; untokenizable masks
return `undefined`; Thai clusters (`กิ๊`, `ที่`, `เกี๊ยว` splitting to four
clusters per R12.4); `Mc`/ZWJ refusal; the `ß` case; `inputMode` derivation
including the `#` case.

### 2. The field model — `src/lib/maskField.ts`

2.1 `MaskEntry` — one slot per position, each holding a filled cluster or
nothing, plus the caret range and the **ordered queue of just-skipped
literals** (R4.6 — a queue, not a flag: `00--00` skips two dashes at once and
must swallow both). The queue is a **required** constructor/updater argument,
not defaulted, for the reason `maskTemplate.ts` gives for the same choice.

2.2 `entryText(pattern, entry, promptChar)` — the rendered string. Always
`renderedWidth` characters, which is what keeps the position table valid
(R3.3's precondition).

2.3 `entryToRaw` / `rawToEntry` — the positional raw form of R3.3 and the
four-case reapplication of R3.5 (equal length positional, shorter left to
right, longer truncated, rejected characters leaving a hole).

2.4 `typeInto(pattern, entry, cluster)` — R4.3 rejection, R4.4 fill and
auto-advance, R4.5's literal swallow, and R12.6–R12.9's insert shifting
(all-or-nothing, class-checked, `'full'` when there is no hole at or after the
caret) and overwrite.

Two rules that are easy to read past, because both make a keystroke do
something other than fill the position at the caret:

- **A combining mark joins the position before the caret** (R12.3b), and
  leaves the caret alone. A Thai keyboard sends `กิ๊` as three keystrokes, so
  without this path the marks are offered to the *next* position, which
  refuses them, and the field cannot hold Thai at all. The mark is refused
  when there is nothing to attach to, when the result stops being one storable
  cluster, and when the base is not a letter (R12.3a — classification goes by
  the base, so a digit position would otherwise accept a decorated digit and
  break R2.1a's ASCII promise). The owed-literal queue survives the append,
  since no new position was started.
- **An accepted space blanks its position rather than storing a character**
  (R3.3a). R3.3 already spends a space on an unfilled optional position, so
  storing one would give two states that render differently and raw
  identically, and the positional round trip would stop reproducing what the
  field was showing. A required position refuses a space as it refuses
  anything else outside its class.



2.5 `clearAt` / `clearBefore` / `clearRange` — Backspace/Delete of R4.8–R4.9,
never deleting a literal, plus the selection clearing R4.10 requires. Every
mutating operation takes a **range**, not a caret: a caret is the empty range,
so typing over a selection and typing at a caret are one code path rather than
two that can drift apart.

2.6 `applyText(pattern, entry, text, range)` — the **three-step** algorithm of
R6.1: formatted when the cluster count equals the rendered width and the shape
matches, **raw when it equals the fillable count**, sequential otherwise, with
R6.2's literal-vs-data resolution. The raw step is not optional — without it
the `"1203"` case loses a digit. Reports what was dropped so the component can
fire one `onInvalidInput`.

In the sequential step a cluster a position refuses is dropped **without
advancing the target**, so the next cluster is offered the same position.
That is what separates it from the raw step, deliberately: sequential means
*fill the acceptable clusters consecutively*, raw means *match by position*,
and `0000` therefore takes `"1a2"` as `12__` and `"1a23"` as `1_23`.

The same function serves paste (R6.1), the `text` prop (R12.12) and
autofill/IME (R6.7); all three are whole-string applications, differing only
in the range they replace.

2.7 `commitState(pattern, entry)` → `'empty' | 'complete' | 'incomplete'`,
tested in the order R3.7 fixes (empty first).

2.8 Caret movement: next/previous fillable position, Home to the first, and
the literal-skipping of R9.4 — all in **position indices**, never offsets.

`End` is the one that does not name a position: it rests **past** the last
one (R4.14), which is the ordinary caret at the end of the text and where the
caret already sits once the field is full. Resting *on* the last position —
the group editor's rule, where a completed last group stays highlighted —
does not transfer, because a caret sits before the position it names, so
overwrite typing there would replace the character just entered and Backspace
would take the second-to-last.

2.9 **The offset bridge** (R4.11). `slotToOffset(pattern, entry, index)` and
`offsetToSlot(pattern, entry, offset)`, both computed from the **currently
rendered text** by walking its clusters and accumulating UTF-16 lengths.

This is the one place `maskTemplate.ts`'s approach cannot be copied even in
shape: it reuses `maskPlaceholderRanges`, a table derived from the mask alone,
which is correct there only because every position it can hold is a
single-unit digit. Here `mask="LL"` puts position 1 at offset 1 while the
field reads `__` and at offset 3 once it reads `กิ๊_`, with the position count
unchanged. A precomputed table would put the caret inside a cluster.

Consequences to hold to:

- `applySelection` and `selectRangeAtCaret` take **offsets**; everything above
  them in this module speaks **positions**. The conversion happens once, at
  the boundary in the component (4.5), not scattered through the model.
- Highlighting a position is `slotToOffset(i)` to `slotToOffset(i) + the
  rendered cluster's UTF-16 length`, never `+ 1`.
- Step 1 of R6.1 compares **cluster counts** to the rendered width, never
  `String.length`.

**Tests**: `slotToOffset`/`offsetToSlot` round-trip for every position over an
ASCII mask, a Thai-filled mask, and a mask mixing the two; a click at every
offset inside a multi-unit cluster resolving to that cluster's position, never
splitting it.

**Tests** (`maskField.test.ts`): the R3.3 table verbatim (`1_-23` → `"1 23"`,
`_1-23` → `" 123"`); round-trip `rawToEntry(entryToRaw(e)) === e` for the
canonical form; all four R3.5 cases; the swallow rule and that every other
operation clears the flag; insert shifting refused on class mismatch and on a
full tail; both R6.2 paste walks producing `"1234"`; `commitState` on an
all-optional empty mask returning `'empty'`, not `'complete'`; R6.2's four-row
table including the `"1203"` row that step 3 alone gets wrong and the `120__`
rendering of the `"12"` row; a `promptChar` colliding with a class falling
back to `_`; the literal queue swallowing both dashes of `00--00`; every
mutating operation over a non-empty range.

### 3. Unmasked mode

3.1 A null pattern (no mask, or R2.4's fallback) is represented explicitly
rather than as an empty pattern, so §2's separate contract is a branch the
type system forces the caller to take rather than a coincidence of zero
positions.

3.2 `entryToRaw`/`entryText` become identity; `typeInto` accepts everything;
`commitState` returns `'empty'` or `'complete'` only (R2.8).

3.3 The mask-boundary conversions of R2.9.

**Tests**: the R2.7 table, row by row; both boundary directions.

### 4. Component — `src/components/InputMask/InputMask.tsx`

4.1 `InputMaskProps` exactly as requirements' "Proposed prop surface", with a
doc comment per prop and, specifically, the two divergences written where they
will be read: `onInvalidInput` is not cancelable (R8.3) and `text` is applied
through the mask (R12.12).

4.2 Controlled/uncontrolled per `standards.md` §2.3, `forwardRef` to the
`<input>` per §2.10.

4.3 The commit model: draft state, commit on blur and Enter only, Escape
reverts to the committed value (R4.17). The commit branch implements R3.7 in
its fixed order.

The **session** is the part to get right, and it is where three defects have
already come from. It opens on focus and closes on blur only, so Enter and
Escape re-seed rather than clear it (R4.15) — clearing it hands the next
commit to the unmasked branch, where the mask's literals are part of the
value. And anything that changes what the field should show has to reach it
(R4.16): a controlled `value`, a `text` override, a changed `mask`, and a
mask *arriving* where there was none, which is a creation rather than a
refresh and needs to know the field is focused.
Typing, Backspace and Delete read the live selection and clear it first
(R4.10), so `Ctrl+A` then a digit replaces the field instead of being refused
as full.

4.4 `handleKeyDown` — text entry, Backspace/Delete, arrows, Home/End, each
`preventDefault`ed **only when the handler acts on it** (R4.12, R4.13). The
guards come first, before any key is classified as printable:

- `event.ctrlKey || event.metaKey || event.altKey` → return untouched, so
  `Ctrl/Cmd+C`, `+V`, `+X`, `+A`, `+Z` keep working. Shift alone is not a
  modifier for this purpose (`Shift+ArrowLeft`, capital letters).
- `event.isComposing || event.keyCode === 229` → return untouched; the
  composed result arrives through `handleChange`.
- `event.key` longer than one cluster and not a key the handler implements →
  return untouched.

4.4a `onPaste` is its own handler: `preventDefault`, read
`event.clipboardData.getData('text')` and the live `selectionStart`/`End`, and
hand both to `applyText` (R6.5). `handleChange` is left with autofill and IME
commits, which it treats as **whole-field replacements** (R6.7) — it does not
diff.

**This is a reason the component test must use real key events**: calling the
handler directly cannot distinguish a `preventDefault` that happened from one
that did not, which is the whole content of this rule.

4.5 Selection application after each state-driven re-render, via
`applySelection` and the `pendingSelectionRef` pattern `InputDate.tsx` uses.
**This is the position → offset boundary** (2.9): the component stores a
pending *position* and converts it once, here, against the text it just
rendered.

4.6 `isRequired` / `isReadOnly` / `isDisabled` per §7, including R7.2's
three limits (reverts, never fabricates, never holds focus, wipe-only snap).

4.7 `onInvalidInput` firing points and payload exactly per R8.4–R8.5.

4.8 Styling: `.rc-scalar` wrapper, the shared visual language of
`standards.md` §7.5–§7.6. No spin buttons, no dropdown, so the markup is the
plain-field subset of `InputDate.tsx` — no wrapper button row.

4.9 ARIA per §9: a plain textbox, no `role`, derived `inputMode` applied
**underneath** the `...rest` spread so a consumer's own value wins (R9.3).

### 5. Packaging

Exactly the five places of `standards.md` §1.4, in order: `src/input-mask.ts`,
`src/index.ts`, `package.json` `exports`, `vite.config.ts` `build.lib.entry`,
and **both** index-coupled lists in `scripts/verify-package.mjs`.

5.1 Add `InputMask/InputMask.tsx` to the `sources` array in
`scripts/generate-scalar-styles.mjs` and run `npm run generate:styles`,
committing the regenerated stylesheet (§7.3). Any new required declaration
goes into `verify-package.mjs`'s `requiredStyles` (§7.4).

5.2 Confirm `InputMask` renders from the verifier's
`{ 'aria-label': name, defaultValue: null }` probe and carries `rc-scalar`, so
no per-component branch is needed there.

### 6. Cross-component contracts

6.1 Add `InputMask` to the `cases` array in
`src/components/scalarEvents.test.tsx` (§9.5). Its case needs no `format`; a
`mask` goes in instead.

**The pointer suite needs one change to accept a caret editor.** Its last
assertion is currently

```
await waitFor(() => expect(input.selectionEnd! - input.selectionStart!).toBeGreaterThan(0))
```

— a non-cancelled click must produce a **non-empty** selection. That is the
group editor's behavior (a click highlights the whole group), and the three
controls in that suite today are all group editors. `InputMask` places a
**collapsed** caret at a position (R4.11, R9.4), so it would fail an assertion
about a behavior it is right not to have.

The fix is to make the expected shape part of the case, not to drop
`InputMask` from the suite: add `selectionOnClick: 'range' | 'caret'` to each
case and assert the width is greater than zero or exactly zero accordingly.
Everything else in that test — that the consumer's `onMouseDown`/`onClick` run
once, and that a cancelled click preserves the caret — is identical for both
and must keep being asserted for `InputMask`, since that is the contract §9.5
exists to protect.

This edits a shared test's expectations. It changes no component behavior and
the three existing controls keep asserting exactly what they assert today
(`selectionOnClick: 'range'`), which is what keeps it inside "do not refactor
unrelated existing components".

6.2 Add `InputMask` to `src/scalar-styles.test.tsx`'s component map. It has no
popup, so the calendar/list branches simply do not fire.

### 7. Component tests — `InputMask.test.tsx`

Organized into `describe` blocks named after the prop or behavior, per §9.3.
Minimum coverage is `standards.md` §9.4 plus the mask-specific blocks:
`mask`, `promptChar`, `overwriteMode`, `paste`, `onInvalidInput`,
`unmasked mode`, `Thai input`, `text the field is given rather than typed`.
Typing is driven from `keydown` (§9.6).

### 8. Demo and docs

8.1 A `<Section>` in `demo/App.tsx` showing a masked field, an unmasked one,
insert vs. overwrite, and the committed raw value beside the displayed text —
the gap between them is the thing a developer most needs to see.

8.2 `docs/app/components/input-mask/{page.mdx,demo.tsx,property-index.tsx}`
and the `_meta.js` entry, per §10.1–§10.2. Thai prose, no Wijmo, no Linear.

8.3 `README.md`: the entry point in the published list, and a `###` section
for the two things a consumer cannot guess — that `value` is raw and
positional while `name` submits the formatted text (R10.3), and that
`InputMask.value` is the opposite of the reference API's (R3.2).

8.4 `CHANGELOG.md` entry.

**Docs gating:** §10.3 — a property is documented only once its Linear
sub-issue reaches **Reviewed**. Group 8.2 may therefore land behind the rest.

### 9. Validation

`npm run validate` end to end, then [`validation.md`](validation.md) as the
Definition of Done.

---

## Sequencing and risk

Groups 1–3 carry the design risk and have no React in them, so they are
written and green first; if the position model is wrong, it is wrong cheaply.
Group 4 is wiring over a proven model. Groups 5–6 are mechanical but are the
ones that silently pass when skipped (§1.4, §9.5), which is why they are
their own groups rather than a step inside group 4.
