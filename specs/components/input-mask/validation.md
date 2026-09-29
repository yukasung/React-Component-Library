# InputMask — Validation

**Status:** draft, awaiting approval.

Definition of Done for [`requirements.md`](requirements.md), implemented per
[`plan.md`](plan.md). Every criterion is checkable: a test, a command, or a
named file inspection. Each **V** cites the requirement it discharges, so an
amended requirement has a visible criterion to amend with it
(`specs/README.md`, "When approved behavior has to change").

---

## 1. Mask syntax

| | Criterion | Covers |
| --- | --- | --- |
| V1.1 | `0 L A` refuse a character of the wrong class; `9 # l a` additionally accept a space; `#` accepts `+` and `-` | R2.1 |
| V1.2 | `\` turns the next character into a literal, including when that character is a mask character (`\0` renders and behaves as a literal `0`) | R2.1 |
| V1.3 | `>` upper-cases following letters, `<` lower-cases, `|` ends conversion; none of the three occupies a rendered position | R2.2 |
| V1.4 | `.` `,` `:` `/` `$` behave as plain literals, with no culture lookup anywhere in the source | R2.3 |
| V1.5 | An untokenizable mask (trailing `\`) returns `undefined` from the tokenizer, does not throw, and the field falls back to unmasked mode | R2.4 |
| V1.6 | The rendered width never varies with what is typed | R2.6 |

## 2. Unmasked mode

| | Criterion | Covers |
| --- | --- | --- |
| V2.1 | With no `mask`, every row of R2.7's table holds — in particular `value` equals the typed text, no character is refused, no prompt characters appear, and `placeholder` defaults to nothing | R2.5, R2.7 |
| V2.2 | `onInvalidInput` never fires in unmasked mode, for any input | R2.7 |
| V2.3 | Typed text commits as-is | R2.8 |
| V2.3a | Empty and `isRequired={false}` commits `null` | R2.8, R3.7 |
| V2.3b | **Empty and `isRequired` reverts, not commits `null`**: an unmasked required field holding `"abc"`, cleared and blurred, still holds `"abc"` | R2.8, R7.2 |
| V2.3c | The same field whose committed value was `null` stays empty rather than being given a value | R2.8, R7.2 |
| V2.4 | masked → unmasked keeps the raw form as text with trailing blanks trimmed; unmasked → masked applies R3.5 | R2.9 |
| V2.5 | The tokenizer-fallback mask reaches the same mode as an absent one, verified through the component, not only the module | R2.4, R2.5 |

## 3. Value contract

| | Criterion | Covers |
| --- | --- | --- |
| V3.1 | `onChange` receives the raw form; `onTextChange` receives the formatted text; neither is ever the other | R3.2 |
| V3.1a | **`onTextChange` reports a revert.** A field showing `"32"` that Escape returns to `"12"` reports `"12"`, so a consumer mirroring the text is not left holding what the field has stopped showing | R3.2, standards §2.6 |
| V3.1b | An invalid blur that reverts reports the restored text the same way | R3.2, R3.7 |
| V3.1c | Setting the `text` prop does not echo back through `onTextChange` | standards §2.6 |
| V3.2 | R3.3's table reproduced exactly as test cases: `1_-23` → `"1 23"`, `_1-23` → `" 123"`, `(___) 555-1234` → `"   5551234"`, `(02_) 555-1234` → `"02 5551234"` | R3.3 |
| V3.3 | Unfilled optional positions raw as U+0020, **not** `promptChar` — asserted with a non-default `promptChar` so the two cannot be confused | R3.3 |
| V3.4 | Raw **cluster count** always equals the mask's fillable count, for every state including fully empty | R3.3 |
| V3.3a | A space accepted by an optional class blanks the position rather than storing a character: the field renders the prompt there, and the raw value is unchanged by which of the two routes produced it | R3.3a |
| V3.3b | A required position refuses a space | R3.3a |
| V3.4a | A mask filled with Thai clusters has a raw whose `String.length` exceeds its fillable count, and every rule still holds — proving nothing is implemented against `.length` | R3.3 |
| V3.5 | **Controlled round trip**: for each case in V3.2, feeding the raw value back as `value` reproduces the identical rendered text | R3.3, R3.5 |
| V3.5a | **A `value` changed while the field is focused reaches it**: `value="12"`, focus, `value="34"` shows `34`, and the following blur neither restores `12` nor commits it | R3.5, R3.6 |
| V3.6 | R3.5's four cases: equal-length positional; shorter filled left to right; longer truncated; a character its position rejects leaving that position unfilled and the rest continuing | R3.5 |
| V3.7 | Applying `value`, `defaultValue`, `text` or a changed `mask` fires no `onChange` | R3.6 |
| V3.8 | No production code reduces raw to digits; the docs say the consumer does it | R3.4 |

### Commit, in order

| | Criterion | Covers |
| --- | --- | --- |
| V3.9 | Empty + `isRequired={false}` commits `null` | R3.7 test 1 |
| V3.10 | Empty + `isRequired` reverts and fires no `onChange` | R3.7 test 1, R7.2 |
| V3.11 | Every required position filled commits the raw form, with optional positions blank | R3.7 test 2 |
| V3.12 | A required position unfilled reverts and fires no `onChange` — specifically, a field holding a committed `"0812345678"` whose user deletes one digit and blurs still holds `"0812345678"` | R3.7 test 3 |
| V3.13 | **Ordering regression**: `mask="99"`, field empty, `isRequired={false}` commits `null` and **not** `"  "` | R3.7 |
| V3.14 | No `maskFull`-equivalent prop exists on the public interface | R3.8 |

## 4. Editing

| | Criterion | Covers |
| --- | --- | --- |
| V4.1 | `onChange` fires only on blur and Enter; typing alone never commits | R4.1 |
| V4.1a | **One editing session survives its commits**: Enter then blur with nothing changed in between fires `onChange` once, not twice | R4.1, R3.7 |
| V4.1b | The mask still applies after Enter and after Escape — the field does not fall back to the unmasked branch, where the formatted text would itself be a value | R4.1, R2.7 |
| V4.1c | Every commit in a session reports the raw form, never the formatted text | R3.2, R4.1 |
| V4.2 | A refused character neither appears nor moves the caret | R4.3 |
| V4.3 | An accepted character fills and advances past literals | R4.4 |
| V4.4 | **Typing `081-234-5678` into `000-000-0000` one key at a time produces exactly that**, with no rejection and no `onInvalidInput` | R4.5 |
| V4.5 | The swallow is consumed once per skipped literal: typing `-` twice after `081` in `000-000-0000` swallows the first and refuses the second | R4.5, R4.6 |
| V4.5a | **A literal run is a queue**: `mask="00--00"` typed `12--34` produces `12--34`, both dashes swallowed, with no rejection and no `onInvalidInput` | R4.6 |
| V4.5b | A literal in the queue but not at its head is rejected | R4.6 |
| V4.5c | The caret never rests on a literal position: a click on one lands on the fillable position after it | R4.5, R9.4 |
| V4.6 | Each of the operations R4.6 names — rejected key, arrow, click, Backspace, Delete, paste, commit, prop re-render — clears the flag, asserted individually | R4.6 |
| V4.7 | Insert mode shifts within fillable positions across literals; overwrite mode replaces and shifts nothing | R4.7, R12.6, R12.9 |
| V4.8 | Insert refused all-or-nothing on a class mismatch (`000-LL` cannot shift a digit into a letter position): nothing moves, the key is refused, `onInvalidInput` fires `'character'` | R12.7 |
| V4.9 | Insert with no empty fillable position at or after the caret fires `'full'` and truncates nothing | R12.8 |
| V4.9a | **Mid-field hole regression**: `mask="000"` holding `1_3`, caret at the first position, insert `9` yields `913` — not refused as `'full'` | R12.8 |
| V4.9b | The shift stops at that hole: positions beyond it are untouched | R12.8 |
| V4.10 | Backspace/Delete never remove a literal; a cleared position shows `promptChar` again | R4.8, R4.9 |
| V4.11 | Editing is `keydown`-driven: text-entry keys and Backspace/Delete are `preventDefault`ed, and the `change` path handles only autofill/IME | R4.12 |
| V4.11a | **Typing over a selection clears it first**: a full field, `Ctrl+A`, then a digit leaves the field holding just that digit — not refused as `'full'` | R4.10 |
| V4.11b | Backspace and Delete over a non-empty selection clear exactly the spanned fillable positions and collapse the caret to the start, deleting no neighbour | R4.10 |
| V4.11c | A selection partly covering literals clears only the fillable positions inside it | R4.10, R4.8 |
| V4.11d | Partial-selection and select-all cases both asserted, not only select-all | R4.10 |
| V4.12 | **`Ctrl/Cmd+C`, `+V`, `+X`, `+A`, `+Z` are not `preventDefault`ed** and reach the browser; asserted with real key events, one per shortcut | R4.13 |
| V4.13 | `Shift` is not treated as a blocking modifier: `Shift+ArrowLeft` and capital letters still work | R4.13 |
| V4.14 | A keydown with `isComposing` (and one with `keyCode === 229`) is not `preventDefault`ed and changes nothing; the composed text arrives through the `change` path | R4.13 |
| V4.15 | The handler never `preventDefault`s a key it did not act on | R4.13 |

## 5. Prompt and placeholder

| | Criterion | Covers |
| --- | --- | --- |
| V5.1 | `promptChar` defaults to `_` and is used for every unfilled position | R5.1 |
| V5.2 | A `promptChar` that is not exactly one cluster falls back to `_` | R5.2 |
| V5.2a | **`promptChar="0"` with `mask="00"` falls back to `_`**, and a field holding `10` survives copy-then-paste intact | R5.3, R6.1 |
| V5.2b | `promptChar=" "` falls back to `_` (collides with `9 # l a`); `promptChar="0"` with `mask="LL"` is kept (no collision) | R5.4 |
| V5.4 | With no `placeholder`, an empty masked field shows the mask's shape built from `promptChar`; a supplied `placeholder` wins | R5.4 |

## 6. Copy and paste

| | Criterion | Covers |
| --- | --- | --- |
| V6.1 | **Copy-paste identity**: copying the formatted text out of a `99-00` field showing `1_-23` and pasting it back reproduces `1_-23`, not `12-3_` | R6.1 step 1, R6.6 |
| V6.2 | Pasting with `promptChar` and with spaces in the unfilled positions both take the positional path | R6.1 step 1 |
| V6.3 | `081-234-5678` and `0812345678` pasted into `000-000-0000` produce the same result | R6.1 step 2 |
| V6.4 | **R6.2's table, all four rows, rendered text and raw both**: `mask="00\\000"` pasted `"12034"` (step 1) and `"1234"` (step 2) render `12034` and raw to `"1234"`; `"1203"` (step 2) renders `12003`; `"12"` (step 3) renders **`120__`** — the literal is always present — and raws to `"12  "` | R6.2 |
| V6.4a | **Ambiguity regression**: the same mask pasted `"1203"` raws to `"1203"`, **not** `"123 "` — the raw interpretation is tried before the sequential one, so a data `0` is never eaten as the literal | R6.1 step 2, R6.2 |
| V6.4b | No literal position ever contributes a cluster to the raw form, under any of the three steps | R6.2 |
| V6.4c | A mask with no literals resolves identically under steps 1 and 2 | R6.1 |
| V6.4d | **Sequential keeps the acceptable clusters together**: `0000` pasted `"1a2"` gives `12__` | R6.1 step 3 |
| V6.4e | **Raw matches by position**: the same mask pasted `"1a23"` gives `1_23`, so the two interpretations differ deliberately rather than by accident | R6.1 step 2 |
| V6.5 | A paste with dropped characters applies the rest and fires `onInvalidInput` exactly once with `reason: 'paste'` | R6.3, R8.4 |
| V6.6 | A paste in which everything was placed fires nothing | R8.4 |
| V6.7 | Pasting over a selection clears the selected positions first | R6.4 |
| V6.8 | **Diff regression**: a `99-00` field showing `1_-23`, select-all–pasted with `_1-23`, ends up showing `_1-23`. Reconstructing the paste from a text diff yields `1_` → `_1` and leaves the field unchanged, so this fails unless the clipboard text and real selection are used | R6.5 |
| V6.9 | The paste path reads `clipboardData` and the live selection; no diff of old-vs-new input value appears in the paste path, and `diffStrings` is not imported | R6.5, plan §0.1 |
| V6.10 | Autofill and an IME commit are applied as whole-field replacements through the same three-step algorithm, not diffed | R6.7 |

## 7. States

| | Criterion | Covers |
| --- | --- | --- |
| V7.1 | `isRequired` defaults to `true` and sets the native `required` attribute, which is what carries `aria-required` | R7.1, R9.2, standards §5.4 |
| V7.2 | Required + wiped reverts to the committed value | R7.2 |
| V7.3 | Required + wiped with a committed value of `null` leaves the field **empty** — no fabricated value | R7.2 |
| V7.4 | Blur always completes; focus is never retained | R7.2, R8.3 |
| V7.5 | Clearing positions **one at a time** does not trigger the snap; only a whole-field wipe does | R7.2 |
| V7.6 | `isReadOnly` keeps the field focusable and submittable and blocks every change; `isDisabled` blocks interaction and excludes it from submission | R7.3 |
| V7.7 | No `isEditable`-style third axis on the interface | R7.4 |

## 8. Validation and `onInvalidInput`

| | Criterion | Covers |
| --- | --- | --- |
| V8.1 | No `error`, `isInvalid`, `errorMessage` or `helperText` prop exists; `aria-invalid`/`aria-describedby`/`aria-errormessage` pass through to the `<input>` | R8.1 |
| V8.2 | `onInvalidInput` exists and is **not** cancelable: calling `preventDefault()` on anything available to the handler changes nothing, and the prop is not routed through `composeInputEvent` | R8.2, R8.3 |
| V8.3 | Every row of R8.4's table asserted, including the three that must **not** fire: a fitting paste, a prop that does not fit, and Backspace/Delete on a literal | R8.4 |
| V8.4 | The payload is a plain object with `reason` and the documented optional `input`/`position`, not a React `SyntheticEvent` | R8.5 |
| V8.5 | The divergence from the reference is stated in `onInvalidInput`'s own doc comment | R8.3 |
| V8.6 | An incomplete commit fires `'incomplete'` | R8.4 |

## 9. Accessibility

| | Criterion | Covers |
| --- | --- | --- |
| V9.1 | The input exposes the `textbox` role — no `combobox`, no `spinbutton`, no explicit `role` attribute | R9.1 |
| V9.2 | `inputMode` is `numeric` for an all-`0`/`9` mask, `text` when the mask contains `#`, `text` when unmasked | R9.3 |
| V9.3 | **A consumer-supplied `inputMode` wins** — `inputMode="tel"` survives, proving the derived value sits underneath the spread | R9.3 |
| V9.4 | Left/Right move one position, Home reaches the first fillable position, Enter commits, Escape reverts, Tab leaves | R9.4 |
| V9.4e | **`End` rests after the last position**, where the caret already sits once the field is full, and a further Right stays there | R4.14, R9.4 |
| V9.4f | From that position: a character gives `'full'` in both modes, Left returns to the last position, Backspace clears it, and a combining mark still joins the cluster before the caret | R4.14 |
| V9.4a | **Caret placement is correct across multi-unit clusters**: in `mask="LL"` showing `กิ๊_`, Home then Right puts the caret at the second position — offset 3, not offset 1 | R4.11 |
| V9.4b | A click at any offset inside a cluster resolves to that cluster's position and never splits it | R4.11 |
| V9.4c | Highlighting a filled position spans the cluster's full UTF-16 length, not one unit | R4.11 |
| V9.4d | No offset table is precomputed from the mask alone; offsets are derived from the rendered text | R4.11 |
| V9.5 | Keyboard operation is verified with real key events, not by calling handlers | standards §9.1, §9.6 |

## 10. Form integration

| | Criterion | Covers |
| --- | --- | --- |
| V10.1 | `name` serializes the **formatted** text through `FormData` | R10.1 |
| V10.2 | No hidden input is rendered | R10.2 |
| V10.3 | `README.md` states that a payload is built from the committed value, with the `"081-234-5678"` / `"0812345678"` contrast spelled out | R10.3 |

## 11. Localization and Thai input

| | Criterion | Covers |
| --- | --- | --- |
| V11.1 | No `locale` prop | R11.1 |
| V11.2 | `L`/`A` accept Thai letters | R11.2 |
| V11.3 | **`กิ๊` and `ที่` each occupy one position** — two `Mn` marks on one base are accepted, which a one-mark cap would have broken, and the cluster is classified by its base | R12.1, R12.2, R12.3 |
| V11.4 | An `Mc` spacing mark and a ZWJ sequence are refused with `onInvalidInput` `'character'` | R12.3 |
| V11.3a | **Typing `ก`, then the vowel, then the tone mark as three keystrokes fills one position with `กิ๊`** — the marks join the consonant instead of being offered to the next position, which is what makes Thai typable at all | R12.3b |
| V11.3b | The caret does not advance on a mark, so the next base character starts the next position | R12.3b |
| V11.3c | A mark with nothing before it to attach to is refused | R12.3b |
| V11.3d | The owed-literal queue survives an append: a separator typed after a mark is still swallowed | R12.3b, R4.6 |
| V11.3e | A mark offered to a position holding a digit is refused, keeping the raw value ASCII | R12.3a, R2.1a |
| V11.5 | The 8-code-point guard refuses a ninth stacked mark | R12.3 |
| V11.6 | `เกี๊ยว` occupies **four** positions in an `LLLL` mask, and the docs record this | R12.4 |
| V11.7 | `ß` with `>` is stored unconverted rather than overflowing its position; Thai is unaffected by `>`/`<` | R11.3, R12.5 |

## 12. `mask` and `text` changes

| | Criterion | Covers |
| --- | --- | --- |
| V12.1 | A changed `mask` re-applies the current raw form by R3.5 and fires no `onChange` | R12.10, R12.11 |
| V12.2 | `text` is parsed through the mask by the **three-step** algorithm; `mask="00"` with `text="AB"` leaves the field showing `__` rather than `AB` | R12.12 |
| V12.2a | `mask="00\\000"` with `text="1203"` shows `12003`, not `1230_` — the raw step applies to `text` exactly as it does to a paste | R12.12, R6.1 |
| V12.3 | Applying `text` fires no `onInvalidInput`, dropped characters included | R12.13 |
| V12.4 | R12.14's three rows asserted: `text="12"` commits `"12"`; `text="AB"` commits `null` or reverts; `text="1"` reverts | R12.14 |
| V12.4a | **R12.15's rows asserted separately**, with `value="12"`: `text="34"` commits `"34"`; `text="1"` and `text="AB"` both revert to `"12"` and fire no `onChange` — the `value` is discarded only where the text parses to a complete one | R12.15 |
| V12.6 | A `mask` changed **while the field is focused** re-applies the current value and fires no `onChange` | R12.10, R12.11 |
| V12.7 | A `text` changed while the field is focused reaches the field, parsed through the mask | R12.12 |
| V12.5 | The `text` divergence from `standards.md` §2.6 is stated in the prop's doc comment | R12.12 |

## 13. Code standards

| | Criterion | Covers |
| --- | --- | --- |
| V13.1 | `src/components/InputMask/` holds `InputMask.tsx`, `InputMask.test.tsx`, `index.ts`; `index.ts` exports only the component and its props type | standards §1.1 |
| V13.2 | Mask rules and field model live in `src/lib/` with their own unit tests and no React import | standards §1.2, plan §0.5 |
| V13.3 | **`src/lib/inputMask.ts` and `src/lib/maskTemplate.ts` are unmodified**, and no existing component file is touched except the two cross-component test files and the packaging files | Critical Rules, plan §0.2–§0.3 |
| V13.4 | `forwardRef` to the `<input>`; `useSyncedState`, `composeInputEvent`/`afterInputEvent` and `applySelection` used rather than reimplemented | standards §2.10, §4.6, §8.1 |
| V13.5 | No `any`, no non-null assertions in component code; every non-obvious prop carries a doc comment | standards §3.1, §3.5 |
| V13.6 | No new runtime dependency in `package.json` | standards §1.5 |

## 14. Styling

| | Criterion | Covers |
| --- | --- | --- |
| V14.1 | Root carries `rc-scalar` and the consumer's `className` reaches it | standards §7.2 |
| V14.2 | `h-11`, `rounded-lg`, `shadow-theme-xs`, the brand focus ring, and a `dark:` variant on every colour-bearing class | standards §7.5 |
| V14.3 | Distinct disabled and read-only treatments | standards §7.6 |
| V14.4 | `InputMask.tsx` is in `generate-scalar-styles.mjs`'s `sources`, and `node scripts/generate-scalar-styles.mjs --check` reports no staleness | standards §7.3 |
| V14.5 | The component renders styled in `demo/` and in the docs dev server | standards §7.3 |

## 15. Packaging

| | Criterion | Covers |
| --- | --- | --- |
| V15.1 | All five places of standards §1.4 updated: `src/input-mask.ts`, `src/index.ts`, `package.json` `exports`, `vite.config.ts` `build.lib.entry`, and **both** lists in `verify-package.mjs` | standards §1.4 |
| V15.2 | The two verifier lists stay index-aligned — checked by reading them, since a misalignment verifies the wrong component silently rather than failing | standards §1.4 |
| V15.3 | `npm run build` emits `dist/input-mask.js` and a non-empty `dist/input-mask.d.ts` declaring `InputMask` and `InputMaskProps` | standards §1.4, CLAUDE.md dts gotcha |
| V15.4 | `npm run verify:package` passes | standards §11.1 |

## 16. Cross-component contracts

| | Criterion | Covers |
| --- | --- | --- |
| V16.1 | `InputMask` added to `scalarEvents.test.tsx`'s `cases` and passing: consumer `onFocus`/`onBlur` run after internal handling with the commit before `onBlur`, and consumer `onKeyDown` cancellation prevents the commit | standards §9.5, §4.6 |
| V16.1a | `InputMask` is in the **pointer** suite too, not skipped: its `onMouseDown`/`onClick` consumers run once, and a cancelled click preserves the caret | standards §9.5 |
| V16.1b | The pointer suite's selection assertion is parameterized per case; `InputMask` asserts a **collapsed** caret and the three existing controls still assert a non-empty selection — verified by their cases continuing to pass unchanged | plan §6.1 |
| V16.2 | `InputMask` added to `scalar-styles.test.tsx`'s component map and passing | standards §9.5 |

## 17. Documentation and demo

| | Criterion | Covers |
| --- | --- | --- |
| V17.1 | `demo/App.tsx` section shows masked, unmasked, insert vs. overwrite, and the raw value beside the displayed text | plan §8.1 |
| V17.2 | `docs/app/components/input-mask/` has `page.mdx`, `demo.tsx`, `property-index.tsx`, registered in `_meta.js`, following §10.2's structure with Thai prose | standards §10.1, §10.2 |
| V17.3 | **No mention of Wijmo, Linear, or the review process** anywhere under `docs/app/components/` | standards §10.3 |
| V17.4 | Only properties whose Linear sub-issue has reached **Reviewed** are documented | standards §10.3 |
| V17.5 | `README.md` lists the new entry point and carries the raw-vs-submitted section | plan §8.3 |
| V17.6 | `CHANGELOG.md` entry present | standards §10.6 |

## 18. Gate

| | Criterion |
| --- | --- |
| V18.1 | `npm run validate` passes end to end (`lint` → `typecheck` → `test` → `build` → `build:docs`) |
| V18.2 | The regenerated `src/scalar-utilities.css` is committed |
| V18.3 | No criterion above is marked done by inspection where a test was possible |

---

## Requirement coverage

Every numbered requirement maps to at least one criterion:

| Requirement group | Criteria |
| --- | --- |
| R1 purpose/scope | V13.2, V13.6 (no preset catalogue, no new dependency), V8.1 |
| R2 mask syntax + unmasked | V1.1–V1.6, V2.1–V2.5 |
| R3 value contract | V3.1–V3.14 |
| R4 editing | V4.1–V4.15; V9.4a–V9.4d cover R4.11 |
| R5 prompt/placeholder | V5.1–V5.4 |
| R6 copy/paste | V6.1–V6.10, V5.2a, V12.2a |
| R7 states | V7.1–V7.7 |
| R8 validation | V8.1–V8.6 |
| R9 accessibility | V9.1–V9.5 |
| R10 form integration | V10.1–V10.3 |
| R11 localization | V11.1, V11.2, V11.7 |
| R12 edge cases | V11.3–V11.7, V11.3a–V11.3e, V4.7–V4.9b, V12.1–V12.5 |
| R13 naming | V13.1, V13.3 |

**Deliberately not asserted individually.** `R1.1`, `R1.2`, `R1.3`, `R1.4`
(purpose and scope), `R3.1` (the two representations, a definition the rest of §3 rests
on), `R4.2` (the record of why editing is caret-based rather than grouped),
`R9.5` (what a screen reader makes of prompt characters, which is native
`<input>` behaviour this control neither adds to nor can test) and `R13.1`
(the component's name) state scope, definitions and decisions rather than
behaviour. There is nothing a test could observe that would distinguish them
being honoured from being ignored. They are listed here so that "no criterion
cites this" reads as a decision rather than an oversight — the check to run
is that this list and the uncited set are the same.
