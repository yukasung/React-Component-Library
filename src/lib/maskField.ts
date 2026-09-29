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
import { acceptsCluster, applyCase, splitClusters } from './maskPattern'

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
  // the state it describes, and cannot be forgotten at one call site.
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

function isFillable(position: MaskPosition): position is Extract<MaskPosition, { type: 'fillable' }> {
  return position.type === 'fillable'
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
  return {
    slots: pattern.positions.map(() => null),
    caret: { start: firstFillable(pattern), end: firstFillable(pattern) },
    owedLiterals: [],
  }
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
  for (let i = 0; i < pattern.positions.length; i++) {
    const position = pattern.positions[i]
    if (position.type === 'literal') {
      text += position.text
      continue
    }
    text += entry.slots[i] ?? promptChar
  }
  return text
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
    const position = pattern.positions[index]
    if (!isFillable(position)) continue
    const stored = storeCluster(position, clusters[i])
    if (stored !== undefined) slots[index] = stored
  }
  return { slots, caret: collapsed(firstFillable(pattern)), owedLiterals: [] }
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
    const position = pattern.positions[index]
    if (!isFillable(position)) continue
    const filled = entry.slots[index] !== null
    if (filled) anyFilled = true
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

function renderedAt(pattern: MaskPattern, entry: MaskEntry, promptChar: string, index: number): string {
  const position = pattern.positions[index]
  if (position === undefined) return ''
  if (position.type === 'literal') return position.text
  return entry.slots[index] ?? promptChar
}

// ------------------------------------------------------------------- caret

function collapsed(index: number): PositionRange {
  return { start: index, end: index }
}

export function caretTo(pattern: MaskPattern, entry: MaskEntry, index: number): MaskEntry {
  return { ...entry, caret: collapsed(fillableAtOrAfter(pattern, index)), owedLiterals: [] }
}

export function caretLeft(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  const previous = fillableBefore(pattern, entry.caret.start)
  return { ...entry, caret: collapsed(previous ?? entry.caret.start), owedLiterals: [] }
}

export function caretRight(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  const next = fillableAtOrAfter(pattern, entry.caret.end + 1)
  return { ...entry, caret: collapsed(next), owedLiterals: [] }
}

export function caretHome(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return { ...entry, caret: collapsed(firstFillable(pattern)), owedLiterals: [] }
}

export function caretEnd(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  return { ...entry, caret: collapsed(lastFillable(pattern)), owedLiterals: [] }
}

export function selectRange(entry: MaskEntry, range: PositionRange): MaskEntry {
  return { ...entry, caret: { ...range }, owedLiterals: [] }
}

// ------------------------------------------------------------------ editing

// Empties every fillable position the range covers. Literals inside it are
// left alone — they are the control's, not the user's.
export function clearRange(pattern: MaskPattern, entry: MaskEntry, range: PositionRange): MaskEntry {
  const slots = [...entry.slots]
  for (let i = Math.max(0, range.start); i < Math.min(range.end, pattern.positions.length); i++) {
    if (isFillable(pattern.positions[i])) slots[i] = null
  }
  return { slots, caret: collapsed(fillableAtOrAfter(pattern, range.start)), owedLiterals: [] }
}

export function backspace(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  if (entry.caret.start !== entry.caret.end) return clearRange(pattern, entry, entry.caret)
  const target = fillableBefore(pattern, entry.caret.start)
  if (target === null) return { ...entry, owedLiterals: [] }
  const slots = [...entry.slots]
  slots[target] = null
  return { slots, caret: collapsed(target), owedLiterals: [] }
}

export function deleteForward(pattern: MaskPattern, entry: MaskEntry): MaskEntry {
  if (entry.caret.start !== entry.caret.end) return clearRange(pattern, entry, entry.caret)
  const target = fillableAtOrAfter(pattern, entry.caret.start)
  if (target >= pattern.positions.length) return { ...entry, owedLiterals: [] }
  const slots = [...entry.slots]
  slots[target] = null
  return { slots, caret: collapsed(target), owedLiterals: [] }
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
  const from = pattern.fillableIndices.indexOf(index)
  if (from === -1) return { ok: false, reason: 'full' }

  let hole = -1
  for (let i = from; i < pattern.fillableIndices.length; i++) {
    if (slots[pattern.fillableIndices[i]] === null) {
      hole = i
      break
    }
  }
  if (hole === -1) return { ok: false, reason: 'full' }

  for (let i = hole; i > from; i--) {
    const target = pattern.positions[pattern.fillableIndices[i]]
    const value = slots[pattern.fillableIndices[i - 1]]
    if (value === null || !isFillable(target)) continue
    if (!acceptsCluster(target, applyCase(value, target.caseMode))) {
      return { ok: false, reason: 'character', position: pattern.fillableIndices[i] }
    }
  }
  for (let i = hole; i > from; i--) {
    const target = pattern.positions[pattern.fillableIndices[i]]
    const value = slots[pattern.fillableIndices[i - 1]]
    slots[pattern.fillableIndices[i]] = value === null || !isFillable(target)
      ? value
      : applyCase(value, target.caseMode)
  }
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

  if (clusters.length === pattern.renderedWidth && matchesShape(pattern, clusters, promptChar)) {
    return { entry: applyFormatted(pattern, clusters) }
  }
  if (clusters.length === pattern.fillableCount) {
    const applied = rawToEntry(pattern, text)
    const dropped = countPlaceable(pattern, clusters) !== clusters.length
    return {
      entry: { ...applied, caret: collapsed(lastFillable(pattern)) },
      ...(dropped ? { invalid: { reason: 'paste' as const, input: text } } : {}),
    }
  }
  return applySequential(pattern, clearRange(pattern, entry, range), clusters, text, range.start)
}

// Whether a string is this mask rendered: literals in their places, and every
// fillable position holding something it accepts, a space, or the prompt.
function matchesShape(pattern: MaskPattern, clusters: string[], promptChar: string): boolean {
  for (let i = 0; i < pattern.positions.length; i++) {
    const position = pattern.positions[i]
    const cluster = clusters[i]
    if (position.type === 'literal') {
      if (cluster !== position.text) return false
      continue
    }
    if (cluster === promptChar) continue
    if (!acceptsCluster(position, applyCase(cluster, position.caseMode))) return false
  }
  return true
}

function applyFormatted(pattern: MaskPattern, clusters: string[]): MaskEntry {
  const slots: (string | null)[] = pattern.positions.map(() => null)
  for (let i = 0; i < pattern.positions.length; i++) {
    const position = pattern.positions[i]
    if (!isFillable(position)) continue
    const stored = storeCluster(position, clusters[i])
    if (stored !== undefined) slots[i] = stored
  }
  return { slots, caret: collapsed(lastFillable(pattern)), owedLiterals: [] }
}

function countPlaceable(pattern: MaskPattern, clusters: string[]): number {
  let placed = 0
  for (let i = 0; i < Math.min(clusters.length, pattern.fillableCount); i++) {
    const position = pattern.positions[pattern.fillableIndices[i]]
    if (!isFillable(position)) continue
    if (storeCluster(position, clusters[i]) !== undefined) placed++
  }
  return placed
}

// The fallback, for a string whose length identifies nothing — a partial
// paste. Walks the clusters against the positions from the caret, letting a
// literal be consumed by a matching cluster or skipped without one.
function applySequential(
  pattern: MaskPattern,
  entry: MaskEntry,
  clusters: string[],
  text: string,
  from: number,
): EditResult {
  const slots = [...entry.slots]
  let index = Math.max(0, from)
  let dropped = false
  let last = index
  for (const cluster of clusters) {
    let placed = false
    while (index < pattern.positions.length && !placed) {
      const position = pattern.positions[index]
      if (position.type === 'literal') {
        // A matching cluster is this literal being retyped; anything else
        // means the literal is simply not the user's to supply.
        if (position.text === cluster) {
          index++
          placed = true
          break
        }
        index++
        continue
      }
      const stored = storeCluster(position, cluster)
      if (stored !== undefined) {
        slots[index] = stored
        last = index
        index++
        placed = true
        break
      }
      dropped = true
      break
    }
    if (!placed) {
      dropped = true
      if (index >= pattern.positions.length) break
    }
  }
  const { caret } = advanceFrom(pattern, last)
  return {
    entry: { slots, caret: collapsed(caret), owedLiterals: [] },
    ...(dropped ? { invalid: { reason: 'paste' as const, input: text } } : {}),
  }
}
