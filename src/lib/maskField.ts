// How a masked field is edited: a **full-width template**, one slot per
// position, each holding its place from the start and showing the prompt
// character until something is typed into it.
//
// The architecture is maskTemplate.ts's, for the reason that module gives: a
// draft holds only what was typed, in order, so "the third position is
// filled and the first is empty" is not a state it can represent — and an
// optional mask position left blank is exactly that state. What is *not*
// borrowed is its data model. A slot there is a multi-character group with a
// numeric range; a position here is one grapheme cluster with a character
// class, and the letter classes have no range at all.
//
// Nothing here is React. Everything is a pure function of (pattern, entry).
//
// Two things to hold on to while reading:
//
//   * Positions, not offsets. Every index in this module is a *position*
//     index. The `<input>`'s selection API works in UTF-16 code units, and
//     the two diverge the moment a position holds a cluster like "กิ๊".
//     positionToOffset/offsetToPosition are the only bridge, and they are
//     computed against the text actually rendered, never from the mask alone.
//   * Every mutation takes a range. A caret is the empty range, so typing
//     over a selection and typing at a caret are one code path instead of two
//     that drift apart.

import type { MaskPattern, MaskPosition } from './maskPattern'
import { acceptsCluster, applyCase, isCombiningMark, joinsIntoOneCluster, splitClusters } from './maskPattern'

// A caret or selection, in position indices, half-open: start === end is a
// collapsed caret sitting before that position.
export interface PositionRange {
  start: number
  end: number
}

export interface MaskEntry {
  // One entry per position. A fillable position holds its cluster or null;
  // a literal position is always null, because its text belongs to the
  // pattern and is never the user's.
  slots: readonly (string | null)[]
  caret: PositionRange
  // The literals the caret was just auto-advanced past, in order, still owed
  // to the user if they go on to type them (R4.5). A queue rather than a
  // flag: "00--00" skips two dashes at once and must swallow both.
  //
  // Every operation that is not a fill empties it. It is part of the entry
  // rather than a separate argument so that "what happened last" travels with
  // the state it describes, and `settled` below is the single constructor
  // those operations go through, so the rule is enforced in one place rather
  // than restated at a dozen call sites that could each miss it.
  owedLiterals: readonly string[]
}

export type InvalidReason = 'character' | 'full' | 'paste' | 'incomplete'

export interface InvalidInputInfo {
  reason: InvalidReason
  /** What was refused: the cluster, or the whole pasted string. Absent for 'incomplete'. */
  input?: string
  /** The position that refused it. Absent for 'paste' and 'incomplete'. */
  position?: number
}

export interface EditResult {
  entry: MaskEntry
  invalid?: InvalidInputInfo
}

export type CommitState = 'empty' | 'complete' | 'incomplete'

// The character an unfilled position contributes to the raw value. Always a
// space, never the prompt character: raw is data, and the prompt is a display
// choice the consumer can change without changing what the field holds.
const RAW_BLANK = ' '

type FillablePosition = Extract<MaskPosition, { type: 'fillable' }>

function isFillable(position: MaskPosition): position is FillablePosition {
  return position.type === 'fillable'
}

// The fillable position at an index, already narrowed, or undefined when that
// index holds a literal or nothing. Every walk over `fillableIndices` needs
// this narrowing, and doing it here keeps the impossible branch — an index in
// `fillableIndices` that is not fillable — stated once instead of six times.
function fillableAt(pattern: MaskPattern, index: number): FillablePosition | undefined {
  const position = pattern.positions[index]
  return position !== undefined && isFillable(position) ? position : undefined
}

// Every entry produced by something that is not a fill. Taking the caret and
// the slots explicitly, and emptying the owed-literal queue itself, is what
// makes "every other operation empties it" a property of the module rather
// than a habit of its call sites.
function settled(caret: PositionRange, slots: readonly (string | null)[]): MaskEntry {
  return { slots, caret, owedLiterals: [] }
}

// What a position should store for a cluster it accepts: the cluster itself,
// or **null for a space**. Returns undefined when the class refuses it.
//
// The space case is the subtle one. R3.3 defines an unfilled optional
// position as contributing a space to the raw value, so "the user typed a
// space" and "this position is blank" are the same state — there is no third
// thing for them to be. Storing a literal space instead would render the
// position as " " while an untouched one renders as the prompt, and
// entryToRaw followed by rawToEntry would then stop reproducing what the
// field was showing, which is the round trip the raw form exists to support.
function storeCluster(
  position: Extract<MaskPosition, { type: 'fillable' }>,
  cluster: string,
): string | null | undefined {
  const cased = applyCase(cluster, position.caseMode)
  if (!acceptsCluster(position, cased)) return undefined
  return cased === ' ' ? null : cased
}

export function emptyEntry(pattern: MaskPattern): MaskEntry {
  return settled(collapsed(firstFillable(pattern)), pattern.positions.map(() => null))
}

function firstFillable(pattern: MaskPattern): number {
  return pattern.fillableIndices[0] ?? pattern.positions.length
}

function lastFillable(pattern: MaskPattern): number {
  return pattern.fillableIndices[pattern.fillableIndices.length - 1] ?? pattern.positions.length
}

// The next fillable position at or after `index`, or positions.length when
// there is none — which is what "the caret has run off the end" looks like.
function fillableAtOrAfter(pattern: MaskPattern, index: number): number {
  for (let i = Math.max(0, index); i < pattern.positions.length; i++) {
    if (isFillable(pattern.positions[i])) return i
  }
  return pattern.positions.length
}

function fillableBefore(pattern: MaskPattern, index: number): number | null {
  for (let i = Math.min(index, pattern.positions.length) - 1; i >= 0; i--) {
    if (isFillable(pattern.positions[i])) return i
  }
  return null
}

// ---------------------------------------------------------------- rendering

// The text the field shows: every position at its full width, literals
// included, unfilled positions holding the prompt. Always exactly
// pattern.renderedWidth clusters, which is the precondition every position
// lookup below depends on.
export function entryText(pattern: MaskPattern, entry: MaskEntry, promptChar: string): string {
  let text = ''
  for (let index = 0; index < pattern.positions.length; index++) {
    text += renderedAt(pattern, entry, promptChar, index)
  }
  return text
}

// What one position contributes to the rendered text. The single answer to
// that question: the text the field shows and the offsets the caret is placed
// at are both built from it, and two statements of it could disagree.
function renderedAt(pattern: MaskPattern, entry: MaskEntry, promptChar: string, index: number): string {
  const position = pattern.positions[index]
  if (position === undefined) return ''
  return isFillable(position) ? (entry.slots[index] ?? promptChar) : position.text
}

// The raw value: literals dropped, one cluster per fillable position, in
// order, unfilled positions contributing a space. Its cluster count always
// equals pattern.fillableCount — never its String.length, which a Thai
// cluster makes larger.
export function entryToRaw(pattern: MaskPattern, entry: MaskEntry): string {
  let raw = ''
  for (const index of pattern.fillableIndices) {
    raw += entry.slots[index] ?? RAW_BLANK
  }
  return raw
}

// Applies a raw value to a fresh entry. One loop covers all of R3.5's cases,
// because they are the same rule seen at three lengths: zip the clusters
// against the fillable positions in order, leave a position unfilled when its
// class refuses what lands on it, and stop when either side runs out. Equal
// lengths give the exact inverse of entryToRaw; fewer clusters fill from the
// left and leave the rest empty; more are dropped off the end.
export function rawToEntry(pattern: MaskPattern, raw: string): MaskEntry {
  const clusters = splitClusters(raw)
  const slots: (string | null)[] = pattern.positions.map(() => null)
  const count = Math.min(clusters.length, pattern.fillableCount)
  for (let i = 0; i < count; i++) {
    const index = pattern.fillableIndices[i]
    const position = fillableAt(pattern, index)
    if (position === undefined) continue
    const stored = storeCluster(position, clusters[i])
    if (stored !== undefined) slots[index] = stored
  }
  return settled(collapsed(firstFillable(pattern)), slots)
}

// ------------------------------------------------------------------- commit

// Which of R3.7's three branches the field is in. Emptiness is tested first,
// and that order is load-bearing: a mask whose positions are all optional has
// no required position to be missing, so an empty "99" would otherwise report
// itself complete and commit two blanks instead of null.
export function commitState(pattern: MaskPattern, entry: MaskEntry): CommitState {
  let anyFilled = false
  let allRequiredFilled = true
  for (const index of pattern.fillableIndices) {
    const position = fillableAt(pattern, index)
    if (position === undefined) continue
    if (entry.slots[index] !== null) anyFilled = true
    else if (position.required) allRequiredFilled = false
  }
  if (!anyFilled) return 'empty'
  return allRequiredFilled ? 'complete' : 'incomplete'
}

// ------------------------------------------------------------ offset bridge

// The UTF-16 offset at which a position begins, in the text this entry
// renders. The bridge exists because a position index and a text offset stop
// agreeing the moment a position holds more than one code unit: in mask "LL"
// the second position starts at offset 1 while the field reads "__", and at
// offset 3 once it reads "กิ๊_".
//
// Always computed from the rendered text. A table derived from the mask alone
// — which is what maskTemplate.ts can safely use, all of its positions being
// single-unit digits — would put the caret inside a cluster here.
export function positionToOffset(
  pattern: MaskPattern,
  entry: MaskEntry,
  promptChar: string,
  index: number,
): number {
  const limit = Math.min(Math.max(index, 0), pattern.positions.length)
  let offset = 0
  for (let i = 0; i < limit; i++) {
    offset += renderedAt(pattern, entry, promptChar, i).length
  }
  return offset
}

// The position an offset falls in. An offset inside a cluster resolves to
// that cluster's position rather than splitting it, and anything past the end
// clamps — a click never lands nowhere.
export function offsetToPosition(
  pattern: MaskPattern,
  entry: MaskEntry,
  promptChar: string,
  offset: number,
): number {
  let seen = 0
  for (let i = 0; i < pattern.positions.length; i++) {
    const width = renderedAt(pattern, entry, promptChar, i).length
    if (offset < seen + width) return i
    seen += width
  }
  return pattern.positions.length
}

// The offsets a single position spans, for highlighting it. The end is the
// start plus the rendered cluster's own UTF-16 length, never start + 1.
export function positionSpan(
  pattern: MaskPattern,
  entry: MaskEntry,
  promptChar: string,
  index: number,
): { start: number; end: number } {
  const start = positionToOffset(pattern, entry, promptChar, index)
  return { start, end: start + renderedAt(pattern, entry, promptChar, index).length }
}

// ------------------------------------------------------------------- caret

function collapsed(index: number): PositionRange {
  return { start: index, end: index }
}

export function caretTo(pattern: MaskPattern, entry: MaskEntry, index: number): MaskEntry {
  return settled(collapsed(fillableAtOrAfter(pattern, index)), entry.slots)
}

export function caretLeft(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  const previous = fillableBefore(pattern, entry.caret.start)
  return settled(collapsed(previous ?? entry.caret.start), entry.slots)
}

export function caretRight(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return settled(collapsed(fillableAtOrAfter(pattern, entry.caret.end + 1)), entry.slots)
}

export function caretHome(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return settled(collapsed(firstFillable(pattern)), entry.slots)
}

export function caretEnd(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return settled(collapsed(lastFillable(pattern)), entry.slots)
}

export function selectRange(entry: MaskEntry, range: PositionRange): MaskEntry {
  return settled({ ...range }, entry.slots)
}

// ------------------------------------------------------------------ editing

// Empties every fillable position the range covers. Literals inside it are
// left alone — they are the control's, not the user's.
export function clearRange(pattern: MaskPattern, entry: MaskEntry, range: PositionRange): MaskEntry {
  const slots = [...entry.slots]
  for (let i = Math.max(0, range.start); i < Math.min(range.end, pattern.positions.length); i++) {
    if (isFillable(pattern.positions[i])) slots[i] = null
  }
  return settled(collapsed(fillableAtOrAfter(pattern, range.start)), slots)
}

// Backspace and Delete differ only in which position they aim at, so they
// share everything else: a selection is cleared instead, and a miss at the
// edge of the field is a no-op that still empties the queue.
function clearOne(pattern: MaskPattern, entry: MaskEntry, target: number | null): MaskEntry {
  if (entry.caret.start !== entry.caret.end) return clearRange(pattern, entry, entry.caret)
  if (target === null || target >= pattern.positions.length) return settled(entry.caret, entry.slots)
  const slots = [...entry.slots]
  slots[target] = null
  return settled(collapsed(target), slots)
}

export function backspace(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return clearOne(pattern, entry, fillableBefore(pattern, entry.caret.start))
}

export function deleteForward(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return clearOne(pattern, entry, fillableAtOrAfter(pattern, entry.caret.start))
}

// Advances past `index`, collecting the literals stepped over so a user who
// goes on to type them has them swallowed rather than rejected.
function advanceFrom(pattern: MaskPattern, index: number): { caret: number; owed: string[] } {
  const owed: string[] = []
  let i = index + 1
  for (; i < pattern.positions.length; i++) {
    const position = pattern.positions[i]
    if (position.type === 'literal') {
      owed.push(position.text)
      continue
    }
    break
  }
  return { caret: i, owed }
}

// Types one cluster at the caret.
export function typeInto(
  pattern: MaskPattern,
  entry: MaskEntry,
  cluster: string,
  overwriteMode: boolean,
): EditResult {
  // A selection is replaced, not typed around. Without this, select-all then
  // a digit is refused as 'full' on a field that is full — when the user has
  // just asked for the whole thing to be replaced.
  const base = entry.caret.start !== entry.caret.end ? clearRange(pattern, entry, entry.caret) : entry

  const markResult = typeCombiningMark(pattern, base, cluster)
  if (markResult) return markResult

  const literalResult = typeLiteral(pattern, base, cluster)
  if (literalResult) return literalResult

  const index = fillableAtOrAfter(pattern, base.caret.start)
  const position = pattern.positions[index]
  if (position === undefined || !isFillable(position)) {
    return { entry: { ...base, owedLiterals: [] }, invalid: { reason: 'full', input: cluster } }
  }

  const stored = storeCluster(position, cluster)
  if (stored === undefined) {
    return {
      entry: { ...base, owedLiterals: [] },
      invalid: { reason: 'character', input: cluster, position: index },
    }
  }

  const slots = [...base.slots]
  // A space blanks its position rather than pushing anything along: there is
  // no character arriving for the rest of the field to make room for.
  if (stored !== null && !overwriteMode && slots[index] !== null) {
    const shifted = shiftRight(pattern, slots, index)
    if (!shifted.ok) {
      return {
        entry: { ...base, owedLiterals: [] },
        invalid: { reason: shifted.reason, input: cluster, position: shifted.position },
      }
    }
  }
  slots[index] = stored
  const { caret, owed } = advanceFrom(pattern, index)
  return { entry: { slots, caret: collapsed(caret), owedLiterals: owed } }
}

// A combining mark is not a character of its own: it belongs to the cluster
// before it. A Thai keyboard sends "กิ๊" as three keystrokes — the consonant,
// the vowel, the tone mark — so without this the two marks are offered to the
// *next* position, which refuses them, and Thai cannot be typed at all.
//
// Appending leaves the caret where it is, because nothing new was started.
// The owed-literal queue survives for the same reason: the position the mark
// joined is the one that advanced past those literals, and the user may still
// be about to type them.
function typeCombiningMark(pattern: MaskPattern, entry: MaskEntry, cluster: string): EditResult | undefined {
  if (!isCombiningMark(cluster)) return undefined

  const target = fillableBefore(pattern, entry.caret.start)
  const existing = target === null ? null : entry.slots[target]
  const position = target === null ? undefined : fillableAt(pattern, target)
  if (target === null || existing === null || position === undefined) {
    // Nothing to attach to — a mark opening a field has no base.
    return { entry: settled(entry.caret, entry.slots), invalid: { reason: 'character', input: cluster } }
  }

  const joined = existing + cluster
  // The mark must actually combine rather than start a cluster of its own,
  // and the result must be something this position may hold. The second check
  // is doing more work than it looks: acceptsCluster is where the stacked-mark
  // guard and the letter-base rule both live, so a mark offered to a digit is
  // refused here by the same code that refuses it in a pasted value.
  if (!joinsIntoOneCluster(existing, cluster) || !acceptsCluster(position, joined)) {
    return {
      entry: settled(entry.caret, entry.slots),
      invalid: { reason: 'character', input: cluster, position: target },
    }
  }

  const slots = [...entry.slots]
  slots[target] = joined
  return { entry: { slots, caret: entry.caret, owedLiterals: entry.owedLiterals } }
}

// The two ways a typed literal is not a rejection (R4.5). Returns undefined
// when the cluster is not a literal case at all, so the caller carries on.
function typeLiteral(pattern: MaskPattern, entry: MaskEntry, cluster: string): EditResult | undefined {
  const atCaret = pattern.positions[entry.caret.start]
  if (atCaret !== undefined && atCaret.type === 'literal' && atCaret.text === cluster) {
    const { caret, owed } = advanceFrom(pattern, entry.caret.start)
    return { entry: { ...entry, caret: collapsed(caret), owedLiterals: owed } }
  }
  // The caret has already been moved past this literal, so there is nothing
  // to do but acknowledge the key. Only the head of the queue counts: a
  // literal further down it means the user is not typing the mask they see.
  if (entry.owedLiterals[0] === cluster) {
    return { entry: { ...entry, owedLiterals: entry.owedLiterals.slice(1) } }
  }
  return undefined
}

// Pushes the occupants of the fillable positions from `index` along by one,
// as far as the first empty fillable position at or after it. All-or-nothing
// and class-checked: a "000-LL" mask cannot shift a digit into a letter
// position, and silently dropping it would lose data the user can see.
function shiftRight(
  pattern: MaskPattern,
  slots: (string | null)[],
  index: number,
): { ok: true } | { ok: false; reason: 'full' | 'character'; position?: number } {
  const indices = pattern.fillableIndices
  const from = indices.indexOf(index)
  if (from === -1) return { ok: false, reason: 'full' }

  // The first empty fillable position at or after the caret is where the
  // displaced characters come to rest. Without one there is nowhere to shift
  // to, which is the only thing that makes an insert impossible — not, as an
  // earlier rule had it, the last position being occupied, which refuses a
  // field like "1_3" although its hole is perfectly usable.
  const hole = indices.findIndex((position, ordinal) => ordinal >= from && slots[position] === null)
  if (hole === -1) return { ok: false, reason: 'full' }

  // Everything between the caret and the hole is occupied, by definition of
  // the hole, so each move below carries a real value. Collected and checked
  // in full before any of it is written: the shift is all-or-nothing, and a
  // "000-LL" mask must not half-move a digit towards a letter position.
  const moves: { to: number; value: string }[] = []
  for (let ordinal = hole; ordinal > from; ordinal--) {
    const to = indices[ordinal]
    const target = fillableAt(pattern, to)
    const value = slots[indices[ordinal - 1]]
    if (target === undefined || value === null) continue
    const cased = applyCase(value, target.caseMode)
    if (!acceptsCluster(target, cased)) return { ok: false, reason: 'character', position: to }
    moves.push({ to, value: cased })
  }

  for (const move of moves) slots[move.to] = move.value
  // The caller fills this position immediately; clearing it keeps the
  // postcondition true for anyone who reads this function on its own.
  slots[index] = null
  return { ok: true }
}

// ----------------------------------------------------------- applying text

// Applies a whole string — a paste, the `text` prop, an autofill, an IME
// commit — by R6.1's three interpretations, most specific first.
//
// The middle one is the reason this is not two steps. Mask "00\000" holds a
// literal "0" between two pairs of digits; pasted "1203" walked sequentially
// would hand that third character to the literal and silently delete the
// user's digit. A raw string has exactly one length that can mean "this is
// the whole value", and testing for it first removes the ambiguity.
export function applyText(
  pattern: MaskPattern,
  entry: MaskEntry,
  text: string,
  promptChar: string,
  range: PositionRange = entry.caret,
): EditResult {
  const clusters = splitClusters(text)
  return (
    asFormatted(pattern, clusters, promptChar) ??
    asRaw(pattern, clusters, text) ??
    asSequence(pattern, clearRange(pattern, entry, range), clusters, text, range.start)
  )
}

// Step 1. The string is this mask already rendered — literals in their places
// and every fillable position holding something it accepts, a space or the
// prompt — so each cluster goes to the position it is sitting on.
//
// This is what makes copy-then-paste an identity. Without it, text copied out
// of the field would have its prompt characters dropped and its remaining
// clusters slid left, silently moving the value into different positions.
function asFormatted(pattern: MaskPattern, clusters: string[], promptChar: string): EditResult | undefined {
  if (clusters.length !== pattern.renderedWidth) return undefined
  const slots: (string | null)[] = pattern.positions.map(() => null)
  for (let index = 0; index < pattern.positions.length; index++) {
    const cluster = clusters[index]
    const position = fillableAt(pattern, index)
    if (position === undefined) {
      // A literal position: the string only matches this mask if it carries
      // that literal here.
      if (cluster !== renderedLiteral(pattern, index)) return undefined
      continue
    }
    // A blank position renders as the prompt, and R6.1 admits a space for it
    // too — text that has been through a system which pads with spaces rather
    // than prompts. Both mean "nothing here", before the class is consulted:
    // a required position refuses a space as *data*, and reading it as data
    // is what made " 1-23" fall through to the sequential walk and land as
    // "12-3_", moving the value into the wrong positions.
    if (cluster === promptChar || cluster === ' ') continue
    const stored = storeCluster(position, cluster)
    if (stored === undefined) return undefined
    slots[index] = stored
  }
  return { entry: settled(collapsed(lastFillable(pattern)), slots) }
}

// Step 2. The string is one cluster per fillable position — the exact inverse
// of entryToRaw, so a value that came out of onChange goes back in unchanged.
//
// This step is the reason the walk is not two steps. Mask "00\000" holds a
// literal "0" between two pairs of digits; pasted "1203" walked sequentially
// would hand that third cluster to the literal and silently delete the user's
// digit. A raw string has exactly one length that can mean "this is the whole
// value", so testing for it removes the ambiguity.
function asRaw(pattern: MaskPattern, clusters: string[], text: string): EditResult | undefined {
  if (clusters.length !== pattern.fillableCount) return undefined
  const applied = rawToEntry(pattern, text)
  const placed = pattern.fillableIndices.filter((index, ordinal) => {
    const position = fillableAt(pattern, index)
    return position !== undefined && storeCluster(position, clusters[ordinal]) !== undefined
  }).length
  return {
    entry: settled(collapsed(lastFillable(pattern)), applied.slots),
    ...(placed === clusters.length ? {} : { invalid: { reason: 'paste' as const, input: text } }),
  }
}

// Step 3. The string's length identifies nothing — a partial paste. The
// clusters are walked against the positions from the caret, a literal being
// either consumed by a cluster that matches it or skipped without one.
function asSequence(
  pattern: MaskPattern,
  entry: MaskEntry,
  clusters: string[],
  text: string,
  from: number,
): EditResult {
  const slots = [...entry.slots]
  let index = Math.max(0, from)
  // Null until something is actually written. A paste that places nothing —
  // an empty string, or one the classes refuse outright — must leave the
  // caret where the user put it rather than stepping forward over a position
  // it never filled.
  let lastFilled: number | null = null
  let dropped = false

  for (const cluster of clusters) {
    const landing = seekLanding(pattern, index, cluster)
    if (landing === undefined) {
      // Nothing left of the field to try; the rest of the string goes too.
      dropped = true
      break
    }
    index = landing.next
    // The cluster was a literal being retyped — it belongs to no position.
    if (landing.at === undefined) continue

    const position = fillableAt(pattern, landing.at)
    const stored = position === undefined ? undefined : storeCluster(position, cluster)
    if (stored === undefined) {
      // This position refused it. The cluster is dropped and the position is
      // offered to the next one, rather than both being given up.
      dropped = true
      index = landing.at
      continue
    }
    slots[landing.at] = stored
    lastFilled = landing.at
  }

  const caret = lastFilled === null ? entry.caret : collapsed(advanceFrom(pattern, lastFilled).caret)
  return {
    entry: settled(caret, slots),
    ...(dropped ? { invalid: { reason: 'paste' as const, input: text } } : {}),
  }
}

// Where the next cluster of a sequential paste lands: the first fillable
// position at or after `from` (`at`), or the literal that cluster matches on
// the way there (`at` undefined, the literal consumed). Undefined when the
// field runs out first.
function seekLanding(
  pattern: MaskPattern,
  from: number,
  cluster: string,
): { at?: number; next: number } | undefined {
  for (let index = from; index < pattern.positions.length; index++) {
    const position = pattern.positions[index]
    if (isFillable(position)) return { at: index, next: index + 1 }
    // A matching cluster is this literal being retyped; anything else means
    // the literal is simply not the user's to supply, so it is stepped over.
    if (position.text === cluster) return { next: index + 1 }
  }
  return undefined
}

function renderedLiteral(pattern: MaskPattern, index: number): string | undefined {
  const position = pattern.positions[index]
  return position !== undefined && position.type === 'literal' ? position.text : undefined
}
