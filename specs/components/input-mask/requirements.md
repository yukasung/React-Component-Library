# InputMask — Requirements

**Status:** complete, awaiting approval. Not implemented.

Defines **what** `InputMask` must do. How it is built is `plan.md`'s job.

Reference API: Wijmo `InputMask`
(`developer.mescius.com/wijmo/docs/Topics/Input/InputMask/InputMask`,
API class `wijmo.input.InputMask`). Per `CLAUDE.md`, Wijmo is an API/UX
reference, never a runtime dependency, and is never mentioned in `docs/`.

Rules inherited rather than restated: [`../standards.md`](../standards.md) for
everything that applies to every input, `CLAUDE.md` for the commit model and
the prop-surface scope rule. This document states only what is specific to
`InputMask`.

Decisions settled in review are recorded in **Decisions** near the end.
Nothing is left open.

---

## 1. Purpose

R1.1 `InputMask` is a **general-purpose masked text field**: the consumer
supplies a mask pattern, and the control restricts typing to characters that
pattern allows, renders the pattern's literal characters itself, and reports
the characters the user actually entered.

R1.2 It is **not** a set of preset named formats. The library ships the
syntax; which pattern to use (phone number, tax ID, citizen ID, postal code,
passport number, …) is the consuming application's decision, expressed as a
`mask` string. No `type="phone"`-style prop, no built-in format catalogue.

R1.3 It is a **scalar** input as defined in `standards.md` §2: one value, one
`<input>`, the commit model of `CLAUDE.md`.

R1.4 **Not in scope**: validating that a well-formed value is a *real*
identifier (checksum digits on a national ID, a dialable phone number, an
existing postal code). The mask constrains shape only. Semantic validation
belongs to the consuming form.

## 2. Mask syntax

R2.1 The `mask` prop is a string of mask characters and literals, using the
Wijmo vocabulary. The control must support these:

| Char | Accepts | Required? |
| --- | --- | --- |
| `0` | digit | required |
| `9` | digit or space | optional |
| `#` | digit, `+`, `-`, or space | optional |
| `L` | letter | required |
| `l` | letter or space | optional |
| `A` | letter or digit | required |
| `a` | letter or digit, or space | optional |
| `\` | escapes the next character into a literal | — |
| anything else | literal, rendered by the control | — |

R2.1a **"Digit" means ASCII `0`-`9`; "letter" means any Unicode letter.**
The asymmetry is deliberate. `L`/`l`/`A`/`a` exist to hold names and words,
which must work in any script, and R11.2 says so. `0`/`9`/`#` exist to hold
the numbers inside a formatted identifier — a phone number, a tax ID, a
postal code — which are ASCII wherever they are stored, and which
`inputMode="numeric"` offers an ASCII keypad for. Accepting `๐` there would
put a digit in the committed raw value that the keyboard the control asked
for cannot produce and the backend behind it does not expect.

Widening this later is backward-compatible; narrowing it would not be.

R2.2 Case conversion tokens are supported: `>` forces every following letter
to upper case, `<` to lower case, `|` ends conversion. They occupy no
position in the rendered text.

R2.3 **Scoped out, with reasons:**

- `J G K N Z H` (Hiragana/Katakana, DBCS/SBCS) — Japanese input, no use case
  here, and they need IME machinery the library has none of.
- `. , : / $` as *localized* separators (decimal point, thousands separator,
  time separator, date separator, currency symbol). Wijmo resolves these
  against a global culture; this library deliberately has no global culture
  (`CLAUDE.md`: `locale` is per-control, and Wijmo's global culture switch is
  why). **These characters are accepted as plain literals instead** — `/` in
  `00/00/0000` renders as `/`. If localized separators are ever wanted they
  need a deliberate decision about where the culture comes from.

R2.4 A mask the control cannot tokenize (a trailing `\` with nothing to
escape) must fall back to behaving as an unmasked text field rather than
rendering something subtly wrong — same principle as `format` in §2.7 of
`standards.md`. It must not throw.

R2.5 An empty or absent `mask` means no masking: an ordinary text input. This
is Wijmo's default (`mask: ''`) and keeps the control usable as a plain field
while a mask is being chosen at runtime. R2.4's fallback lands in the same
mode.

R2.6 **Fixed width, optional content.** Every mask position occupies exactly
one character of the rendered text; the mask's total width never changes.
Variable-length inputs are expressed through the *optional* classes (`9`, `#`,
`l`, `a`), which accept a space — `(999) 000-0000` is how a phone number with
an optional area code is written. There is no variable-width mask.

### Unmasked mode is a separate contract

R2.7 With no mask there are no positions, so the positional rules of §3 have
nothing to apply to (a fillable count of zero would make R3.3 read as "raw is
always the empty string"). Unmasked mode is stated on its own terms:

| | Masked | Unmasked |
| --- | --- | --- |
| `value` (raw) | Literals stripped, optional blanks kept (R3.3) | **The text verbatim.** Raw and formatted are the same string. |
| `text` | The rendered text with literals and prompts | The same string as `value` |
| Rejection | Per-position character classes | **None.** Every character is accepted. |
| Prompt characters | Fill unfilled positions | None. An empty field is empty. |
| `placeholder` default | The mask's shape (R5.3) | **None** — there is no shape to show. |
| Caret | Skips literals, insert/overwrite (§4) | Ordinary text-input caret. `overwriteMode` is inert. |
| `onInvalidInput` | Per R8.4 | **Never fires**, except `'incomplete'` never applies either. |
| `inputMode` | Derived (R9.3) | `"text"` |

R2.8 **Commit in unmasked mode is R3.7 with its middle branch removed.**
"Incomplete" has no meaning where there are no required positions, so of
R3.7's three tests only the first two can apply, and `isRequired` decides
between them exactly as it does with a mask:

| Field state | Result |
| --- | --- |
| Empty, `isRequired === false` | Commit `null`. |
| Empty, `isRequired === true` | **Revert** to the committed value (R7.2), including staying empty when that value was `null`. |
| Anything typed | Commit the text as-is. |

Saying only "or `null` if it is empty" left two answers for the same field: an
unmasked, required field holding a committed `"abc"`, cleared and blurred,
would commit `null` by that sentence and revert by R3.7. It reverts.

R2.9 **Switching into or out of a mask.** Per R12.10 a changed `mask`
re-applies the current raw form. Crossing this boundary:

- **masked → unmasked**: the raw form (R3.3) becomes the field's text,
  trailing blanks trimmed. The data survives; the literals do not.
- **unmasked → masked**: the text is applied by the rules of R3.5, left to
  right, dropping what no position accepts.

## 3. Value contract

R3.1 Two representations exist, as in Wijmo:

- **raw** — only the characters the user entered: `"0812345678"`.
- **formatted** — the full rendered text including the mask's literals:
  `"081-234-5678"`.

R3.2 **`value` carries the raw form.** Wijmo names the *formatted* one
`value` and the raw one `rawValue`; this library's cross-component contract
(`CLAUDE.md`) is the opposite — "the committed `value` … is already parsed into
the real type and stripped of the display `format`; the draft/typed text is
display-only and is never a valid submission value." The library wins:

- `value?: string | null` / `onChange?: (value: string | null) => void` carry
  the **raw** value (Wijmo's `rawValue`).
- `text?: string` / `onTextChange?: (text: string) => void` carry the
  **formatted** text (Wijmo's `value`), per `standards.md` §2.6.

One rule holds across all six components — `onChange` is what a form submits —
and the existing `text` pair is reused rather than adding a sixth name for the
same idea. The cost: `InputMask.value` means the opposite of Wijmo's
`InputMask.value`, which `README.md` must call out.

### The raw form is positional

R3.3 **Raw = the rendered text with literals removed, one grapheme cluster per
fillable position, in order — including the spaces that unfilled optional
positions hold.** Its **cluster count** always equals the mask's
fillable-position count.

Cluster count, not `String.length`: a position holding `กิ๊` contributes three
UTF-16 code units and one position (R12.1). Every length in this document is a
cluster count unless it says otherwise, and no rule may be implemented against
`.length`.

Stripping those spaces would destroy position. For mask `99-00`, both `1_-23`
and `_1-23` would strip to `"123"`, and a parent handing `"123"` back could not
know which position the `1` belongs in — the controlled round trip would not
round-trip. So:

| Mask | On screen | `value` |
| --- | --- | --- |
| `99-00` | `1_-23` | `"1 23"` |
| `99-00` | `_1-23` | `" 123"` |
| `(999) 000-0000` | `(___) 555-1234` | `"   5551234"` |
| `(999) 000-0000` | `(02_) 555-1234` | `"02 5551234"` |

The unfilled-optional character in the raw form is a **space** (U+0020),
never `promptChar`: the raw form is data, and `promptChar` is a display
choice the consumer can change without changing what the field holds.

R3.3a **A typed space and an unfilled optional position are the same state.**
R3.3 makes the raw blank a space, so there is no third thing an optional
position can hold: a space accepted by `9`, `#`, `l` or `a` blanks that
position rather than storing a character in it.

Without this the two states render differently — `" "` against the prompt
character — while producing identical raw values, and `entryToRaw` followed
by feeding the result back through R3.5 would stop reproducing what the field
was showing. That round trip is the whole reason the raw form is positional.

A required position refuses a space as it refuses anything else its class
does not accept.

R3.4 **Reducing raw to a domain value is the consumer's job.** A consumer that
wants digits only calls `.replace(/ /g, '')` — it knows, as the component
cannot, whether the blanks are meaningful (an optional area code) or noise.
The component never does this reduction itself.

R3.5 **Feeding a raw value back in.** Given `value` (or `defaultValue`):

- **Cluster count equal to the fillable count** — applied positionally,
  cluster to position. This is the canonical form and the exact inverse of
  R3.3.
- **Fewer clusters** — applied left to right into the fillable positions,
  remaining positions unfilled. This is the convenience case: a stored `"0812345678"`
  drops into `(999) 000-0000` without the consumer padding it.
- **More clusters** — the excess is dropped.
- **A character its position's class rejects** — that position is left
  unfilled and the rest continue. `onInvalidInput` does **not** fire: this is
  not user input (R8.4).

R3.6 **Receiving a prop never commits.** Applying `value`, `defaultValue`,
`text` or a changed `mask` re-renders the field and fires no `onChange`,
exactly as an external `value` change does in every other control.

### What commits, and when

R3.7 At a commit point (blur or Enter), the field is tested **in this order**.
The order is load-bearing, not presentational:

| # | Test | Result |
| --- | --- | --- |
| 1 | **Is every position empty?** | `isRequired === false` → commit `null`. `isRequired === true` → **revert** (R7.2). |
| 2 | Otherwise: is every **required** position filled? | Commit the raw form (R3.3). Optional positions may be blank. |
| 3 | Otherwise (some required position unfilled) | **Revert** to the committed value. No `onChange`. |

Emptiness is tested first because a mask whose positions are *all* optional
has no required position to be missing. An empty `mask="99"` would otherwise
pass test 2 and commit `"  "` — two blanks — instead of `null`, while test 3
claims it should revert. Asking "is it empty" first removes the overlap: an
all-optional mask commits `null` when empty and its raw form the moment
anything is typed.

Test 3 is why an incomplete field does not commit `null`: a field
already holding a valid `"0812345678"` whose user deletes one digit must not
have that value wiped. `standards.md` §5.3 — "a draft that cannot be parsed at
commit time restores the previous committed value" — is the rule, and an
incomplete mask is exactly an unparseable draft. `InputTime` already behaves
this way with an unfinished entry.

R3.8 **Completeness is not a prop.** Wijmo exposes `maskFull`; this library
does not expose control state (`standards.md` §2.9). The rule above
makes it unnecessary: a consumer that receives a value knows the mask was
complete, because nothing else commits one. A consumer that wants to watch
progress mid-edit reads `onTextChange`.

## 4. Editing behavior

R4.1 The commit model of `CLAUDE.md` applies unchanged: `onChange` fires at
blur, Enter, and no other time. Typing never commits.

R4.2 **Editing model: caret, on a full-width template.** Wijmo's `InputMask` is a **caret** field: the
caret moves through positions one character at a time, skips over literals,
and has an `overwriteMode` (default `false`) choosing insert vs. overwrite.
`InputDate`/`InputTime`/`InputDateTime` in this library instead use
**fixed-width groups**, and `CLAUDE.md` explicitly warns against
reintroducing a draft-mutating masker ("Don't reintroduce a draft-mutating
masker without reading that section").

These are not the same control, and the tension was resolved in favour of
Wijmo's caret — but built on a template rather than a draft. Reasons:

- A mask position is a *single character with a character class*; a group is a
  *multi-character number with a min/max range*. The group editor's acceptance
  rules (`acceptDigit`, `canFinalizeDigits`) are range arithmetic and do not
  apply to `L`/`A`/`a`.
- Grouping `000-00-0000` into three groups would make Left/Right jump three
  characters at a time in a field where every character is independent —
  wrong for this control, right for a date.
- The `CLAUDE.md` warning is against a **draft-mutating** masker — a design
  where the stored string holds only what was typed, in order, so "position 5
  filled, position 1 empty" is unrepresentable. That objection applies here
  too: `(   ) 555-1234` is exactly that state. So `InputMask` must hold a
  full-width template like `maskTemplate.ts` does, and drive editing from
  `keydown`. It is the *template* that is shared in spirit; the *groups* are
  not.

R4.3 Typing a character not accepted at the caret's position is rejected: the
character does not appear, and the caret does not move.

R4.4 An accepted character fills its position and the caret advances past any
literals to the next fillable position.

R4.5 **Typing a literal.** Typing `081-234-5678` straight through must work,
exactly as typing `2026-07-15` does in `InputDate` today — and R4.4 is what
makes that non-trivial, because by the time the user types `-`, the caret has
already been moved past it. One case:

- **The caret was just auto-advanced past one or more literals, and the typed
  character is the next one still owed** — the keystroke is **swallowed**:
  nothing changes and the caret stays. This is not a rejection and
  `onInvalidInput` does not fire; the control already did what the key was
  asking for.

Anything else is a rejection (R4.3).

An earlier draft listed a second case — the caret sitting *on* a literal
position holding that character — and it is unreachable. The caret is always
normalized onto a fillable position (R9.4 moves it one fillable position at a
time, and a click on a literal lands on the position after it), so it never
comes to rest on a literal in any mode. Keeping the rule would have meant
keeping a branch no input can reach.

R4.6 **The "just auto-advanced" state is an ordered queue, not a flag.** A
single boolean cannot answer a mask whose literals come in runs: `00--00`
typed as `12--34` auto-advances past *both* dashes at once, so the user then
types two dashes and both must be swallowed. A flag swallows the first and
rejects the second.

So the state is the list of literals just skipped, **in order**, and each
matching keystroke consumes the head of it. Typing a literal that is in the
queue but not at its head is a rejection — the user is not typing the mask
they are looking at.

The list is set only by an accepted character that skipped literals, it
shrinks as literals are swallowed, and **every other operation empties it** —
a rejected key, an arrow key, a click, Backspace/Delete, a paste, a commit, a
prop-driven re-render. Stating it at each of those sites is deliberate:
`maskTemplate.ts` makes the equivalent flag a required argument for exactly
this reason ("`autoAdvanced` is transient state whose correctness depends on
every operation that isn't a fill clearing it"), and a default would make
"cleared" the answer nobody had to think about.

Without this rule a user typing `081-` into `000-000-0000` has the `-`
rejected, which both contradicts the promise above and fires a spurious
`onInvalidInput`.

R4.7 `overwriteMode?: boolean` (default `false`), per Wijmo: whether typing
replaces the character at the caret or inserts and shifts the rest of the
field along within the mask.

R4.8 Backspace clears the position before the caret and moves back;
Delete clears the position at the caret and stays. Neither deletes a literal.

R4.9 Clearing a position restores the prompt character there, so an unfilled
position always looks unfilled.

R4.10 **Every edit is selection-aware, not just paste.** The key handler owns
typing, Backspace and Delete (R4.12), so it — not only the paste path — has to
answer what happens when the selection spans more than a caret:

- **Typing with a non-empty selection**: the spanned positions are cleared
  first (R4.9), the caret collapses to the start of what was selected, and the
  character is then typed there by the ordinary rules.
- **Backspace or Delete with a non-empty selection**: the spanned positions
  are cleared and the caret collapses to the start. Neither key then also
  deletes a neighbouring position.
- A selection that partly covers literal positions clears only the fillable
  ones inside it; literals are never removed (R4.8).

Without this, `Ctrl+A` followed by a digit is refused on a full field: insert
mode would find the tail occupied and fire `'full'` (R12.8), when the user has
just asked for the field to be replaced. Clearing first is what makes
select-all-and-retype work, and it is the same clearing that R6.4 applies
before a paste and that R7.2's wipe rule already assumes exists.

R4.14 **The caret may rest after the last position, and stops there.** That
is the ordinary caret at the end of the text, and it is where the caret
already ends up once the field is full — so `End` goes there too, and a
further Right stays put rather than walking off.

It is deliberately *not* the group editor's rule, where a completed last group
stays highlighted so one more keystroke retypes it. A caret sits **before**
the position it names, so resting on the last position instead would make
overwrite typing replace the character just entered, and Backspace take the
second-to-last. From the end position:

| Key | Result |
| --- | --- |
| A character, either mode | `'full'` — there is no position to take it |
| A combining mark | Joins the cluster before the caret, per R12.3b |
| Left | The last position |
| Backspace | Clears the last position |
| Right, End | Stays |

R4.11 **A position index is not a text offset.** The `<input>`'s selection API
works in UTF-16 code units, and a position holding a multi-unit cluster makes
the two diverge: in `mask="LL"` the second position sits at offset 1 while the
field shows `__`, and at offset 3 once it shows `กิ๊_`. Every caret operation
therefore maps between the two **against the currently rendered text**, and no
fixed offset table may be precomputed from the mask alone — which is what
`maskPlaceholderRanges` does for the existing controls, and why it cannot be
reused here (all their positions are single-unit digits).

R4.12 Editing is driven from `keydown`, not from the resulting text — the same
reason `maskTemplate.ts` gives: prompt characters make the text ambiguous
about what changed. So printable keys and Backspace/Delete are handled (and
`preventDefault`ed) in the key handler, and `onChange` on the `<input>` is
left for input the keyboard path cannot see: a paste, an autofill, an IME
commit.

R4.13 **The key handler claims a keystroke only when it is text entry.** A
printable `event.key` is not by itself text entry, and treating it as such
would break the field:

- **A modifier other than Shift is held** (`ctrlKey`, `metaKey`, `altKey`) —
  the handler does nothing and does not `preventDefault`. `Ctrl/Cmd+C`, `+V`,
  `+X`, `+A` and `+Z` all arrive with a printable `event.key`, and swallowing
  them would disable the copy and paste that §6 requires and the select-all
  that R6.4 builds on.
- **A composition is in progress** (`event.isComposing`, or `keyCode === 229`)
  — the handler does nothing. The composed result arrives through the
  `change` path instead, where R4.12 already sends text the keyboard path
  cannot see.
- **`event.key` is longer than one cluster and is not a named key the handler
  implements** — ignored rather than inserted.

Everything the handler declines passes through to the browser untouched; it
never `preventDefault`s a key it did not act on.

## 5. Prompt character and placeholder

R5.1 `promptChar?: string`, default `'_'` (Wijmo's default, and the same
character `MASK_FILLER` already uses). It marks every unfilled position in the
rendered text while the field is being edited.

R5.2 A `promptChar` that is not exactly one grapheme cluster falls back to
`'_'`.

R5.3 **A `promptChar` that any fillable position would accept as data also
falls back to `'_'`.** `promptChar="0"` on `mask="00"` renders an empty field
as `00`, and step 1 of R6.1 then reads every `0` as an unfilled position — so
a field genuinely holding `10`, copied and pasted back, loses its `0`.
Round-tripping is only possible while the prompt character is one no position
can hold.

The check is against **the current mask**, not a fixed blocklist: `0` is a
perfectly good prompt character for `mask="LL"`. A collision is a developer
mistake rather than user input, so it degrades silently to `'_'` and fires no
`onInvalidInput`. The default `'_'` collides with nothing, since no class
accepts it; `' '` does collide, with `9 # l a`.

R5.4 `placeholder` behaves as it does on `InputDate`/`InputTime`: when the
consumer supplies none, the field at rest shows the mask's own shape built
from `promptChar` (`___-__-____`), so an empty field states what it expects.
A consumer-supplied `placeholder` wins.

## 6. Copy and paste

R6.1 **Pasting is resolved by cluster count, most specific first.** One rule
cannot serve every case: a user pasting `081-234-5678` from a spreadsheet, a
user pasting a stored `0812345678`, and a user pasting back what they copied
out of this field (`(02_) 555-1234`, prompts and all) are doing three
different things. The paste is tested against three interpretations in this
order, and the order is load-bearing:

**Step 1 — formatted.** The pasted cluster count equals the mask's **rendered
width**, *and* the string matches the mask's shape: every literal position
holds that literal, every fillable position holds a cluster its class accepts,
a space, or `promptChar`. Applied **positionally across all positions**;
spaces and prompt characters leave their positions unfilled.

This is what makes copy-then-paste an identity. Copying `1_-23` out of a
`99-00` field and pasting it back restores `1_-23`, not `12-3_`: without
step 1 the `_` would be dropped and the digits would slide left, silently
changing which position the `1` occupies — the positional loss R3.3 exists to
prevent.

**Step 2 — raw.** Otherwise, the pasted cluster count equals the mask's
**fillable count**. Applied **positionally across the fillable positions
only**: literals are never consumed and never examined. This is the exact
inverse of R3.3, so a value that came out of `onChange` goes back in
unchanged.

**Step 3 — sequential.** Otherwise the string is walked left to right from the
caret:

- A cluster equal to the literal at the current position consumes that literal
  and advances.
- A cluster not equal to it, where the current position is a literal, skips
  the literal without consuming the cluster — the control fills literals
  itself.
- Otherwise the cluster is offered to the current fillable position and
  accepted or dropped by its class. **A dropped cluster does not advance the
  target**: the next cluster is offered the same position.

That last rule is the difference between this step and step 2, and it is
deliberate. Sequential means *fill the acceptable characters consecutively*;
raw means *match by position*. So the same string lands differently depending
on which interpretation its length selects, and both answers are right for
what they mean:

| Mask | Pasted | Step | Result |
| --- | --- | --- | --- |
| `0000` | `"1a2"` | 3 — matches neither length | `12__`, the digits kept together |
| `0000` | `"1a23"` | 2 — matches the fillable count | `1_23`, each cluster at its own position |

R6.2 **Steps 1 and 2 are what keep a literal that looks like data from eating
it.** Mask `00\000` is two digits, a *literal* `0`, then two digits: rendered
width 5, fillable count 4.

| Pasted | Clusters | Step | Result | Raw |
| --- | --- | --- | --- | --- |
| `"12034"` | 5 = rendered width, shape matches | 1 | `12034` | `"1234"` |
| `"1234"` | 4 = fillable count | 2 | `12034` | `"1234"` |
| `"1203"` | 4 = fillable count | 2 | `12003` | `"1203"` |
| `"12"` | neither | 3 | `120__` | `"12  "` |

The third row is the one step 3 alone gets wrong: walked sequentially, `1` and
`2` fill the first two positions, the literal position expects `0` and the next
pasted cluster *is* `0`, so it would be eaten as the literal and the raw would
come back `"123 "` — the user's third digit silently deleted. Testing the raw
interpretation before the sequential one removes the ambiguity, because a raw
string has exactly one length that can mean "this is the whole value".

A literal position always renders its literal, filled or not — which is why
the fourth row shows `120__` and not `12___`. Literals are the control's, not
the user's, and they never wait to be typed.

Where a mask has no literals, steps 1 and 2 describe the same application and
cannot disagree. Step 3 is reached only by a partial paste, which has no
length that identifies it.

R6.3 Dropped characters do not abort the paste; the rest is applied.
`onInvalidInput` fires **once** for the whole paste if anything was dropped
(R8.4), never once per character.

R6.4 Pasting into a selection replaces the selected positions first (clearing
them, per R4.9 and R4.10), then applies R6.1 from the start of what was
selected.

R6.5 **A paste is read from the paste event, never reconstructed from the
resulting text.** The pasted string and the selection it replaced are both
available on the event; recovering them afterwards by diffing the old and new
input values is not possible in general, because a diff reports only the
*minimal* changed region.

A `99-00` field showing `1_-23`, select-all–pasted with `_1-23`, is the case
that proves it: the two strings share the suffix `-23`, so a minimal diff
reports an edit of `1_` → `_1` and hands the paste algorithm a two-cluster
string. That is neither the rendered width nor the fillable count, so it falls
to step 3 and the leading `_` is dropped — the field ends up unchanged, and
the user's paste silently does nothing.

So the paste path takes the clipboard text and the real selection, and
step 1's width comparison is made against the **whole** pasted string.

R6.6 Copying from the field yields the **formatted** text — what is on screen
is what is copied, prompt characters included. (Wijmo has no separate copy
mode, and a user selecting text expects what they see.) Step 1 of R6.1 is what
makes that choice safe to round-trip.

R6.7 **Text arriving by any other route is parsed as a whole-field
replacement.** Autofill and an IME commit produce no paste event and cannot
be read per character. The incoming value is handed to R6.1 in its entirety —
not diffed against what was there — for the same reason R6.5 gives. This is
the `InputMask` form of `CLAUDE.md`'s "text the field is *given* is taken
as-is".

## 7. States

R7.1 `isRequired` defaults to `true` (Wijmo's default and `standards.md` §2.5)
and sets the native `required` attribute (§5.4).

R7.2 **What `isRequired` does on blur: it reverts, and nothing else.**
`InputNumber` displays `0`; `InputDate`/`InputTime` refuse to leave the field
empty and revert. `InputMask` has no meaningful zero, so it reverts — with
three limits:

- **It reverts to the committed value, it does not invent one.** If the
  committed value is `null`, the field stays empty. A required field that has
  never held a value shows an empty mask, not a fabricated one.
- **It never holds focus.** Blur completes; the user can always leave. Keeping
  focus to force a correction is `onInvalidInput`'s territory, and this
  library does not do it (R8.3).
- **The snap answers a wipe, not a keystroke.** Per `CLAUDE.md`, clearing
  positions one at a time must be left alone — refilling the field the moment
  the last position empties reads as "this position cannot be deleted". Only
  an edit that clears the whole field at once (select-all, then delete) plus
  the blur that follows trigger the revert.

R7.3 `isReadOnly` keeps the field focusable and submittable and blocks every
value change. `isDisabled` blocks interaction and excludes it from submission.
Per `standards.md` §4.4.

R7.4 There is no third editability axis (no `InputTime`-style `isEditable`).

## 8. Validation and error state

R8.1 Per `standards.md` §5.1, `InputMask` ships **no** `error`, `isInvalid`,
`errorMessage` or `helperText` props and no error styling. The consuming form
owns feedback and wires it through `aria-invalid`, `aria-describedby` and
`aria-errormessage`, which pass through natively.

R8.2 **`onInvalidInput` exists, and it is a notification only.** Rejection is
otherwise silent, which is the one place a masked field genuinely surprises
people, and the event is reference API rather than invented surface.

R8.3 **This is a deliberate divergence from the reference, not a mapping of
it.** Wijmo's `invalidInput` is a `CancelEventArgs` event: *"If the event
handler cancels the event, the control will retain the invalid content and the
focus, so users can correct the error. If the event is not canceled, the
control will ignore the invalid input and will retain the original content."*

This library implements **only** the not-cancelled half. The cancelled half is
refused because it contradicts two rules that already hold here:

- R4.3 — a rejected character never appears in the field. "Retain the invalid
  content" requires the field to render text the mask forbids, which would
  make the rendered text no longer a valid mask rendering, and would make the
  raw form of R3.3 underivable from it.
- R7.2 — the field never holds focus against the user.

So `preventDefault()` on `onInvalidInput` does nothing, and the prop is not
routed through `composeInputEvent` (which exists precisely to let a consumer
cancel an internal action — `standards.md` §4.6). That exception must be
stated in the prop's own doc comment, or the next reader will assume the
library's usual cancel idiom applies.

R8.4 **When it fires.** Once per rejected *user* action:

| Action | Fires? | Payload `reason` |
| --- | --- | --- |
| A typed character the position's class rejects | yes | `'character'` |
| A typed character with no position left to take it (field full, insert mode) | yes | `'full'` |
| Paste in which one or more characters were dropped (R6.3) | yes, **once** for the whole paste | `'paste'` |
| Paste in which every character was placed | no | — |
| A commit point reached with required positions unfilled (R3.7 test 3) | yes | `'incomplete'` |
| Applying a `value`/`defaultValue`/`text`/`mask` prop that does not fit (R3.5, R12.13) | **no** — not user input | — |
| A combining mark with nothing before it to attach to (R12.3b) | yes | `'character'` |
| A combining mark offered to a position whose base is not a letter (R12.3a) | yes | `'character'` |
| Backspace/Delete on a literal, or at a boundary | no — a no-op, not invalid input | — |

R8.5 **Payload.** `onInvalidInput?: (info: InvalidInputInfo) => void` where

```ts
interface InvalidInputInfo {
  reason: 'character' | 'full' | 'paste' | 'incomplete'
  /** What was refused: the character, or the whole pasted string. Absent for 'incomplete'. */
  input?: string
  /** Index of the mask position that refused it. Absent for 'paste' and 'incomplete'. */
  position?: number
}
```

A plain object, not a React `SyntheticEvent`: there is nothing to cancel
(R8.3) and `'incomplete'` has no originating DOM event at all.

## 9. Accessibility

R9.1 The control is a plain `<input type="text">` with **no** `role` override.
It has no popup and no stepping, so neither `combobox` nor `spinbutton`
applies (`standards.md` §6.2) — it stays a textbox.

R9.2 `aria-required` follows `isRequired` via the native attribute.

R9.3 **`inputMode` is set deliberately**, closing the gap `standards.md` §6.6
records. It is **derived, and overridable**:

- `"numeric"` when every fillable position is `0` or `9` — digits (or blank)
  and nothing else.
- `"text"` otherwise. **`#` is not digit-only**: it accepts `+` and `-`, which
  a numeric keypad does not offer, so a mask containing `#` derives `"text"`.
- A consumer-supplied `inputMode` always wins. It arrives through
  `InputHTMLAttributes` in `...rest`, so the derived value must be applied as
  a default *underneath* the spread, never on top of it. A mask of `#` that is
  in practice numeric (`+66 #########`) is exactly the case a consumer needs
  to override, and `inputMode="tel"` — which the derivation never produces —
  is a legitimate choice for a phone mask.

R9.4 Keyboard: Left/Right move one position, Home goes to the first fillable
position and End past the last one (R4.14), Enter commits, Escape reverts.
Tab follows the natural form order.

R9.5 Screen-reader behavior is whatever a native text input gives. Prompt
characters are part of the input's value and are therefore announced; this is
accepted, matching how `InputDate` already behaves.

## 10. Form integration

R10.1 `name` passes through to the `<input>`, whose submitted value is
therefore the **formatted** text — the existing behavior of every scalar in
this library (`standards.md` §3 "missing standards").

R10.2 **`InputMask` does not close that gap.** Submitting the raw value
instead (a hidden input, as `InputTag` does for its array) would make
`InputMask` the only scalar whose submitted text differs from its displayed
text. If the library wants raw submission it is a decision for all five
scalars at once, not a precedent set quietly here.

R10.3 **The documented contract is therefore: build the payload from the
committed value, not from the form's serialized text.** This is the same
sentence `CLAUDE.md` already applies to the other five controls, and
`README.md` must repeat it for `InputMask`, where the gap between the two is
widest (`"081-234-5678"` submitted, `"0812345678"` committed).

## 11. Localization

R11.1 No `locale` prop. Nothing in the mask vocabulary is language-dependent
once R2.3 scopes out the localized separators.

R11.2 Letter classes (`L`, `l`, `A`, `a`) accept any character the platform
reports as a letter, Thai included. They are not restricted to ASCII. The
digit classes are — see R2.1a for why the two differ.

R11.3 Case conversion (`>`, `<`) applies to characters that have case. Thai
has none, so those tokens leave Thai characters unchanged rather than
mangling them.

## 12. Edge cases that change the contract

These are stated here rather than left to implementation because each one
changes what a consumer observes.

### 12.1 One position holds one grapheme cluster

R12.1 A fillable position holds exactly one **grapheme cluster**, not one code
point. The distinction matters for Thai: `ก` followed by the vowel `ิ` is two
code points and one cluster, and a per-code-point rule would consume two
positions for one visible character — or reject the vowel outright, since a
combining mark is not in a Unicode letter category and `L` would refuse it.

R12.2 Therefore: `L`/`l` accept a cluster whose **base** character is a
Unicode letter; `A`/`a` a cluster whose base is a letter or digit. A combining
mark typed after a filled position attaches to that position's cluster and
does **not** advance the caret.

R12.3 **Nonspacing marks are accepted without a count limit; spacing ones are
refused.** The limit is set by category, not by counting:

- **`Mn` (nonspacing)** — accepted, any number. They carry zero advance width
  and stack vertically, so they cannot break the fixed-width alignment the
  template depends on. Ordinary Thai *requires* more than one:
  `กิ๊` is ก + ◌ิ (`Mn`) + ◌๊ (`Mn`), and `ที่` is ท + ◌ี + ◌่. A cap of one
  mark per position would make the field unable to type Thai.
- **`Mc` (spacing combining marks), and ZWJ (U+200D) sequences** — refused
  with `onInvalidInput` (`reason: 'character'`). These *do* add advance width,
  so one position would render wider than one character and the template's
  positions would stop lining up.
- A hard cap of **8 code points per cluster** applies as an abuse guard only
  (arbitrarily stacked marks), not as a linguistic rule. Nothing in Thai comes
  near it.

R12.3a **A combining mark may only join a cluster whose base is a letter.**
Classification goes by the base character (R12.2), so `"1"` followed by a
Thai vowel is one cluster whose base is `"1"` — which a digit position would
accept, putting a non-ASCII cluster into the raw value that R2.1a restricted
the digit classes to ASCII precisely to keep clean. Marks decorate script;
the digit classes hold the numbers inside an identifier. A mark offered to a
position holding a digit is refused with `onInvalidInput`
(`reason: 'character'`).

R12.3b **A combining mark is typed separately and does not advance the
caret.** A Thai keyboard sends `กิ๊` as three keystrokes — consonant, vowel,
tone mark — so the field joins them itself: the mark attaches to the cluster
in the position before the caret, and the caret stays where it is, ready for
the next base character. A mark with nothing before it to attach to is
refused. The owed-literal queue survives the append, since no new position
was started and the user may still be about to type the separator.

R12.4 **A Thai syllable is not one position, and that is expected.** Thai
leading vowels are base characters in their own right — `เ` (U+0E40) is
category `Lo`, not a mark — so `เกี๊ยว` is four clusters (`เ`, `กี๊`, `ย`,
`ว`) and occupies four positions in an `LLLL` mask, although a Thai reader
sees one syllable. The mask counts clusters, not syllables. This is a
consequence to document, not a defect: no fixed-width mask can count Thai
syllables, and masks are for formatted identifiers rather than prose.

R12.5 Case conversion (`>`, `<`) applies only when it yields a cluster of the
same count. `ß` upper-cases to `SS`, two characters for one position, so the
conversion is **skipped** and `ß` is stored as typed rather than overflowing
the position or being refused. Thai has no case and is unaffected (R11.3).

### 12.2 Insert mode

R12.6 In insert mode (`overwriteMode === false`, the default), a character
typed at an occupied position pushes the occupants of the following fillable
positions one position along. Literals do not move and are not counted — the
shift walks fillable positions only, across literal runs.

R12.7 The shift is **all-or-nothing and class-checked**: every shifted
character must be accepted by the class of the position it lands in. If any
would be rejected, nothing moves, the typed character is refused, and
`onInvalidInput` fires with `reason: 'character'`. A `000-LL` mask cannot
shift a digit into a letter position, and silently dropping it would lose data
the user can see.

R12.8 **The shift stops at the first empty fillable position at or after the
caret.** That hole is where the displaced characters come to rest; everything
beyond it is untouched. If there is no such hole, there is nowhere to shift
to: the insertion is refused and `onInvalidInput` fires with
`reason: 'full'`. Insert mode never truncates the tail.

Stated as "the last fillable position is occupied" this rule was wrong, and
in a way a mask with optional positions reaches easily. `mask="000"` holding
`1_3` — a hole in the middle, left by an optional position or by clearing one
position — would refuse an insert at the first position, although shifting
the `1` into the hole loses nothing and yields `913`. Holes *before* the
caret are irrelevant, since the shift only ever moves rightward.

R12.9 Overwrite mode (`overwriteMode === true`) replaces the character at the
caret and shifts nothing, so neither R12.7 nor R12.8 applies to it.

### 12.3 `mask` changing while the field holds a value

R12.10 A changed `mask` re-tokenizes the field and re-applies the **current raw
form** (R3.3) to the new mask using the rules of R3.5 — positional if the
lengths match, left-to-right otherwise, dropping what the new positions
reject.

R12.11 This fires no `onChange` (R3.6). The consequence is deliberate and must
be documented: a mask change can make the committed `value` no longer
derivable from what the field now shows, until the next commit. A consumer
that changes `mask` and `value` together should change both in the same
render.

### 12.4 `value` and `text` supplied together

R12.12 **`text` is applied through the mask, not around it.** On
`InputNumber` and `InputDate`, `text` sets the draft verbatim "exactly as if
the user had typed it themselves" (`standards.md` §2.6). Taken literally here
it would break the control's central invariant — that the rendered text is
always a valid rendering of the mask — and with it R3.3, since a raw form
cannot be derived from text the mask cannot describe. `mask="00"` with
`text="AB"` has no correct answer.

So `text` is parsed by the **same three-step algorithm a paste uses** (R6.1),
applied to the whole field: formatted if its cluster count matches the
rendered width and its shape matches, raw if its cluster count matches the
fillable count, sequential otherwise — dropping clusters no position accepts.

The middle step matters here too, and for the same reason it does in R6.2:
`mask="00\000"` given `text="1203"` must show `12003`, not eat the user's
`0` as the literal and show `1230_`. "As if the user had typed it" is kept
faithfully — that is exactly what typing does — and the invariant holds. The
divergence from §2.6 is narrow and deliberate: **verbatim within what the mask
can represent**, and it belongs in the prop's doc comment.

R12.13 Applying `text` therefore never fires `onInvalidInput`, dropped
characters included. It is a prop, not user input — the same rule as R3.5 and
R8.4's last row.

R12.14 **Commit after a `text` override follows R3.7 unchanged.** The override
decides what the field *shows*; it gets no exemption from what the field may
*commit*:

| `mask="00"`, then | Field shows | Next commit |
| --- | --- | --- |
| `text="12"` | `12` | Commits raw `"12"` |
| `text="AB"` | `__` — neither character is a digit | Empty: `null`, or revert if `isRequired` (test 1) |
| `text="1"` | `1_` | Incomplete → **revert** (test 3) |

R12.15 **What `text` does to `value` follows from R12.14, and is not always
to override it.** The override decides what the field shows, the commit reads
the field, and R3.7 decides what that reading is worth:

| `mask="00"`, `value="12"`, then | Commit |
| --- | --- |
| `text="34"` | Commits `"34"`. The `value` is replaced. |
| `text="1"` | Incomplete, so it **reverts to `"12"`** — the `value` stands. |
| `text="AB"` | Nothing the mask can take, so the field is empty: reverts to `"12"` while `isRequired`, commits `null` otherwise. |

Only the first row discards the `value`. Saying flatly that a contradicted
`value` is discarded was wrong for the other two, where reverting is
precisely what preserves it.

Supplying both on purpose is still a mistake, and the prop's doc comment says
so; `text` remains documented as an escape hatch.

## 13. Naming

R13.1 **`src/lib/inputMask.ts` already exists** and is the segment
vocabulary used by `InputDate`/`InputTime`/`InputDateTime`. A component named
`InputMask` with a *different* pure module beside it will be confused with it
routinely.

**Decision:** keep the component name `InputMask` — it is the reference API's
name and what consumers will look for — and give its own pure logic a
distinctly named module so the two are never confused by filename alone.

Renaming `src/lib/inputMask.ts` to something that says what it is
(`maskSegments.ts`) is worth doing, but it touches three shipped components,
so it is a **separate change with its own approval**. It does not gate this
one: `InputMask` ships beside the existing filename if the rename has not
happened yet.

---

## Decisions

Settled in review:

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | Does `value` carry raw or formatted? | **Raw**, and **positional** — literals stripped, unfilled optional positions kept as spaces (R3.3). Reducing that to a domain value is the consumer's job. |
| 2 | What commits when the mask is incomplete? | **Nothing — revert.** `null` only for a deliberate, permitted clear (R3.7). |
| 3 | Caret editing or fixed-width groups? | **Caret, on a full-width template.** The group editor is not imposed (R4.2). |
| 4 | What `isRequired` does on blur | **Revert**, never fabricate a value, never hold focus (R7.2). |
| 5 | Include `onInvalidInput`? | **Yes**, notification-only — a recorded divergence from Wijmo, with payload and firing points specified (R8.2–R8.5). |
| 6 | Submit raw value via `name`? | **No.** `name` submits the formatted text as every scalar does; the committed value is what builds a payload (§10). |
| 7 | Name collision with `src/lib/inputMask.ts` | Keep `InputMask`; rename the utility as a separate, non-blocking change (§13). |
| 8 | Cap on combining marks per position | **No count cap.** `Mn` (nonspacing) accepted freely — Thai needs two per base; `Mc` and ZWJ refused, since those add width; an 8-code-point abuse guard only (R12.3). |

No open decisions remain. This document is complete and awaiting approval.

## Proposed prop surface

Everything below is derived from Wijmo's `InputMask` plus the React-structural
exceptions `CLAUDE.md` allows (`defaultValue`, `on*`, `ref`, inherited
`InputHTMLAttributes`). Nothing here is invented beyond those.

```ts
export interface InputMaskProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'required' | 'readOnly' | 'disabled'
  > {
  /** Raw and positional: literals stripped, unfilled optional positions kept as spaces. R3.3 */
  value?: string | null
  defaultValue?: string | null
  onChange?: (value: string | null) => void
  mask?: string                    // default ''
  promptChar?: string              // default '_'
  overwriteMode?: boolean          // default false
  isRequired?: boolean             // default true
  isReadOnly?: boolean             // default false
  isDisabled?: boolean             // default false
  /** The formatted text on screen. R3.2 */
  text?: string
  onTextChange?: (text: string) => void
  /** Notification only — not cancelable, unlike the reference API. R8.3 */
  onInvalidInput?: (info: InvalidInputInfo) => void
}
```

Wijmo members deliberately **not** mapped: `maskFull` (control state is not
exposed as a prop — see R3.8), `inputElement`/`hostElement` (the forwarded
`ref` covers it), `selectAll`/`focus`/`beginUpdate`/`endUpdate` and the rest of
the imperative `Control` base (not a React API), `tabOrder` (native
`tabIndex`), `rightToLeft` (no RTL support anywhere in this library yet),
`inputType` (the control is always `type="text"`; `inputMode` covers the
mobile-keyboard need — R9.3).
