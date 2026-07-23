import type { DateMaskSegment } from './date'

// Finds the single contiguous edit region between two strings via a
// common-prefix/common-suffix diff. Works uniformly for a single keystroke,
// a Backspace/Delete, an overtyped selection, or a paste (a browser's
// `input`/`change` event only ever hands over the resulting string, never
// *how* it changed) — everything downstream in this file is driven by this
// one primitive rather than trying to classify the DOM event itself.
export function diffStrings(prev: string, next: string): { start: number; removedCount: number; inserted: string } {
  const maxPrefix = Math.min(prev.length, next.length)
  let start = 0
  while (start < maxPrefix && prev[start] === next[start]) start++
  let prevEnd = prev.length
  let nextEnd = next.length
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--
    nextEnd--
  }
  return { start, removedCount: prevEnd - start, inserted: next.slice(start, nextEnd) }
}

type TokenSegment = Extract<DateMaskSegment, { type: 'token' }>

interface LocatedSegment {
  index: number
  digitsStart: number
  digits: string
  segment: TokenSegment
}

// Re-derives, fresh from the draft string every time (cheap — format
// strings are ~10 chars), which token segment a draft-offset falls in and
// what digits it already holds. No persistent typing-session state is kept
// anywhere in this module — every call starts from the actual current
// draft, so deleting mid-segment and later typing a replacement digit just
// works without any special-casing.
function locateSegment(draft: string, segments: DateMaskSegment[], offset: number): LocatedSegment | undefined {
  let pos = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'literal') {
      if (!draft.startsWith(seg.text, pos)) return undefined
      pos += seg.text.length
      continue
    }
    let digitsEnd = pos
    while (digitsEnd < draft.length && digitsEnd < pos + seg.width && /\d/.test(draft[digitsEnd])) digitsEnd++
    if (offset >= pos && offset <= digitsEnd) {
      return { index: i, digitsStart: pos, digits: draft.slice(pos, digitsEnd), segment: seg }
    }
    pos = digitsEnd
  }
  return undefined
}

// The per-segment digit acceptor — the one genuinely new piece of logic
// here, no precedent elsewhere in this codebase. Separates "does a valid
// 2-digit completion exist for this leading digit" from "is the digit alone
// already a complete, valid value":
//   - day/month leading digit 4-9 (day) / 2-9 (month): no valid 2-digit
//     value starts with it (day 40-99 / month 20-99 don't exist), so it's a
//     complete 1-digit value on its own — accept, done, auto-advance.
//   - day/month leading digit 0-3 (day) / 0-1 (month): a 2-digit
//     continuation might still be coming — accept, stay open.
//   - a 2nd digit that pushes the combined value out of range is rejected
//     outright, not silently corrected.
function acceptDigit(
  segment: TokenSegment,
  digitsBefore: string,
  digitsAfter: string,
  newDigit: string,
): { digits: string; done: boolean } | 'reject' {
  const combined = digitsBefore + newDigit + digitsAfter
  if (combined.length > segment.width) return 'reject'
  if (segment.min === undefined || segment.max === undefined) {
    // Y or y — width cap only, any digit valid at any position.
    return { digits: combined, done: combined.length === segment.width }
  }
  if (combined.length < segment.width) {
    const d = Number(combined)
    const twoDigitContinuationExists = d * 10 <= segment.max && d * 10 + 9 >= segment.min
    if (twoDigitContinuationExists) return { digits: combined, done: false }
    if (d >= segment.min && d <= segment.max) return { digits: combined, done: true }
    return 'reject'
  }
  const v = Number(combined)
  return v >= segment.min && v <= segment.max ? { digits: combined, done: true } : 'reject'
}

// Splices an accepted digit (or an early force-advance) into the draft and,
// when the segment is done, auto-inserts the next literal separator —
// idempotently, since a redundant-separator keystroke can also route here
// with the literal already present.
function applyAcceptedDigit(
  prevDraft: string,
  segments: DateMaskSegment[],
  located: LocatedSegment,
  outcome: { digits: string; done: boolean },
): { draft: string; cursor: number } {
  let draft = prevDraft.slice(0, located.digitsStart) + outcome.digits + prevDraft.slice(located.digitsStart + located.digits.length)
  let cursor = located.digitsStart + outcome.digits.length
  if (outcome.done) {
    const next = segments[located.index + 1]
    if (next?.type === 'literal') {
      if (!draft.startsWith(next.text, cursor)) draft = draft.slice(0, cursor) + next.text + draft.slice(cursor)
      cursor += next.text.length
    }
  }
  return { draft, cursor }
}

// Handles a typed non-digit character, which must be exactly the next
// literal separator to mean anything: either the common "typing through" an
// already-auto-inserted separator (a no-op besides moving the cursor), or an
// explicit early separator that force-advances a not-yet-full segment as-is
// (e.g. day "7" then "/" completes day as "7", matching what
// parseDateDraft already accepts for 1-2 digit numeric tokens).
function applyLiteralKeystroke(
  prevDraft: string,
  segments: DateMaskSegment[],
  edit: { start: number; removedCount: number; inserted: string },
): { draft: string; cursor: number } | 'reject' {
  const char = edit.inserted
  if (edit.removedCount === 0 && prevDraft[edit.start] === char) {
    return { draft: prevDraft, cursor: edit.start + 1 }
  }
  const located = locateSegment(prevDraft, segments, edit.start)
  if (!located || located.digits.length === 0) return 'reject'
  const next = segments[located.index + 1]
  if (!next || next.type !== 'literal' || !next.text.startsWith(char)) return 'reject'
  return applyAcceptedDigit(prevDraft, segments, located, { digits: located.digits, done: true })
}

// Fallback for a multi-character insert (paste, autofill, IME commit) —
// deliberately simple: strip everything but digits and replay them through
// the segment list from scratch, taking up to each segment's width in
// order. No per-segment range validation and no cursor-preserving remap
// here (full validation still happens at commit time via the existing
// parseDateDraft, unchanged by any of this) — see the plan's scope-cut list
// for why this is an intentional v1 simplification, not an oversight.
function rebuildFromDigits(segments: DateMaskSegment[], digits: string): { draft: string; cursor: number } {
  let draft = ''
  let digitIndex = 0
  for (const seg of segments) {
    if (seg.type === 'literal') {
      draft += seg.text
      continue
    }
    if (digitIndex >= digits.length) break
    const take = Math.min(seg.width, digits.length - digitIndex)
    draft += digits.slice(digitIndex, digitIndex + take)
    digitIndex += take
    if (take < seg.width) break
  }
  return { draft, cursor: draft.length }
}

// The live-typing masker's entry point — called from InputDate's
// handleChange with the result of diffStrings(prevDraft, rawBrowserValue).
// Returns the masked draft + where the cursor should land, or the literal
// string 'reject' when the keystroke can't lead anywhere valid (the caller
// is expected to leave the draft unchanged and restore the cursor to where
// the rejected edit started).
export function applyDateMask(
  segments: DateMaskSegment[],
  prevDraft: string,
  edit: { start: number; removedCount: number; inserted: string },
): { draft: string; cursor: number } | 'reject' {
  // Pure deletion — no masking needed, the removal itself can't produce an
  // invalid *typed* value (full validation stays at commit time).
  if (edit.inserted === '') {
    return { draft: prevDraft.slice(0, edit.start) + prevDraft.slice(edit.start + edit.removedCount), cursor: edit.start }
  }

  if (edit.inserted.length > 1) return rebuildFromRawEdit(segments, prevDraft, edit)

  const inserted = edit.inserted
  if (!/\d/.test(inserted)) {
    const literalResult = applyLiteralKeystroke(prevDraft, segments, edit)
    if (literalResult !== 'reject') return literalResult
    // A single separator keystroke that doesn't cleanly confirm/force-advance
    // is only given the bespoke interpretations above when it's a plain
    // keystroke (nothing removed). When it's replacing a selection instead
    // (e.g. selecting the whole draft and typing "-"), fall back to the
    // same strip-and-rebuild path as a paste rather than silently dropping
    // it — same reasoning as the digit case below.
    return edit.removedCount > 0 ? rebuildFromRawEdit(segments, prevDraft, edit) : 'reject'
  }

  const located = locateSegment(prevDraft, segments, edit.start)
  const posInSegment = located ? edit.start - located.digitsStart : -1
  const fitsInSegment = located !== undefined && posInSegment >= 0 && posInSegment + edit.removedCount <= located.digits.length

  if (fitsInSegment) {
    // The edit lands entirely within one segment's own digits (a plain
    // keystroke, or a selection that never leaves this segment — e.g.
    // overtyping just the "1" in a fully-typed day "12") — per-segment
    // range validation applies exactly like a fresh keystroke would, and a
    // genuinely invalid result rejects outright, no silent fix-up,
    // regardless of whether anything was removed.
    const removeEnd = posInSegment + edit.removedCount
    const digitsBefore = located!.digits.slice(0, posInSegment)
    const digitsAfter = located!.digits.slice(removeEnd)
    const outcome = acceptDigit(located!.segment, digitsBefore, digitsAfter, inserted)
    return outcome === 'reject' ? 'reject' : applyAcceptedDigit(prevDraft, segments, located!, outcome)
  }

  // The edit doesn't fit within a single segment — most commonly, overtyping
  // a fully auto-selected value (e.g. the required-field immediate-snap's
  // select-all) with one digit, where the removed span crosses every
  // segment, not just one. Not given a bespoke per-segment interpretation in
  // v1 (see the plan's "bespoke multi-segment selection" scope-cut note);
  // rather than blocking it outright, it falls back to the same
  // strip-and-rebuild path a paste already uses — rebuilding from scratch is
  // what actually keeps typing over a selection usable. A plain keystroke
  // that doesn't land in any segment at all (only possible for a
  // malformed/inconsistent draft) still rejects, since there's nothing
  // sensible to rebuild from a single character in that case.
  return edit.removedCount > 0 ? rebuildFromRawEdit(segments, prevDraft, edit) : 'reject'
}

function rebuildFromRawEdit(
  segments: DateMaskSegment[],
  prevDraft: string,
  edit: { start: number; removedCount: number; inserted: string },
): { draft: string; cursor: number } {
  const rawNext = prevDraft.slice(0, edit.start) + edit.inserted + prevDraft.slice(edit.start + edit.removedCount)
  return rebuildFromDigits(segments, rawNext.replace(/\D/g, ''))
}

// Used by InputDate's Backspace/Delete handling to decide whether the
// adjacent character is a separator that should be stepped over rather than
// landed on — mirrors locateSegment's own walk so the two stay consistent.
export function isLiteralCharAt(draft: string, index: number, segments: DateMaskSegment[]): boolean {
  let pos = 0
  for (const seg of segments) {
    if (seg.type === 'literal') {
      if (index >= pos && index < pos + seg.text.length) return true
      pos += seg.text.length
      continue
    }
    let digitsEnd = pos
    while (digitsEnd < draft.length && digitsEnd < pos + seg.width && /\d/.test(draft[digitsEnd])) digitsEnd++
    pos = digitsEnd
  }
  return false
}
