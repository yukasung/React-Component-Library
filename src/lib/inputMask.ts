// Segment shape for the live-typing masker below — a `format` string turned
// into an ordered list of fixed-width character groups (with a valid value
// range, where one applies) and literal separator runs. Deliberately not
// tied to date *or* time formats: everything in this module works purely
// off `width`/`min`/`max`, which is what lets `InputDate` and `InputTime`
// share one masker instead of growing two subtly different ones. The
// per-format tokenizers that produce these live next to their own
// parse/format logic (`tokenizeDateMask` in date.ts, `timeMaskSegments` in
// time.ts).
//
// `min`/`max` are absent for Y/y (any digit is valid at any of their
// positions, only a width cap applies).
export type MaskSegment =
  | {
      type: 'token'
      token: 'Y' | 'y' | 'm' | 'n' | 'd' | 'j' | 'H' | 'h' | 'G' | 'i'
      width: number
      min?: number
      max?: number
    }
  // The AM/PM designator (time formats' `K` token) — the one segment whose
  // content is letters rather than digits, so it gets its own kind instead
  // of being squeezed into a numeric range. Without it, masking would have
  // to be switched off entirely for 12-hour formats, which are the most
  // common time formats there are.
  | { type: 'ampm' }
  | { type: 'literal'; text: string }

// A format string split into its ordered token/literal parts, before any
// per-token widths or ranges are attached. Both date and time formats are
// written in the same shape — single-letter tokens, `\`-escaped literals,
// anything else literal — so they're split by one function rather than a
// walk re-written per format family (which is how the rule "an unrecognized
// letter aborts the whole format rather than being guessed at" ends up
// stated once instead of three times).
export type FormatSegment<T extends string> = { type: 'token'; token: T } | { type: 'literal'; text: string }

// Returns undefined if the format contains any alphabetic character that
// isn't one of `tokens` — callers use that to fall back to a format they can
// actually render, rather than emitting something subtly wrong.
export function tokenizeFormat<T extends string>(
  format: string,
  tokens: ReadonlySet<T>,
): FormatSegment<T>[] | undefined {
  const segments: FormatSegment<T>[] = []
  let literal = ''
  function flushLiteral() {
    if (literal) segments.push({ type: 'literal', text: literal })
    literal = ''
  }
  for (let i = 0; i < format.length; i++) {
    if (format[i] === '\\') continue
    const escaped = format[i - 1] === '\\'
    const char = format[i]
    if (!escaped && (tokens as ReadonlySet<string>).has(char)) {
      flushLiteral()
      segments.push({ type: 'token', token: char as T })
    } else if (!escaped && /[A-Za-z]/.test(char)) {
      return undefined
    } else {
      literal += char
    }
  }
  flushLiteral()
  return segments
}

// Escapes a literal run so it can be embedded in a regex built from a
// format string (used by both date and time parsing).
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// How long to wait, with no further character typed, before an ambiguous
// segment (e.g. a day "1" — could stay "1" or continue to "10"-"19")
// auto-advances on its own. Pairs with (doesn't replace) the explicit-
// separator force-advance below — matches the common pattern in native
// browser date inputs and masked-input libraries (IMask.js, Cleave.js,
// react-input-mask) of supporting both. Internal only, not exposed as a
// prop, and shared by every component using this masker so they can't drift
// apart. Set to 1200ms (up from an initial 600ms, which raced ahead of
// typing a second digit like the "5" of "15" before the user could enter
// it) to leave comfortable room for the second digit.
export const AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS = 1200

// The two AM/PM designators an `ampm` segment can hold. Fixed English
// strings for now — the time formats that use them are English-only in v1.
const AM_PM_TEXT = { a: 'AM', p: 'PM' } as const
export const AM_PM_WIDTH = 2
const AM_PM_CHAR_PATTERN = /[AMP]/i

// The rendered width of anything the user fills in — the one place that
// answers "how many characters does this group occupy", so the fixed-width
// template editor and this module's own walks can't disagree about it.
export function segmentWidth(segment: FillableSegment): number {
  return segment.type === 'ampm' ? AM_PM_WIDTH : segment.width
}

// The mask as an empty template: every fillable segment becomes one dash per
// character it holds, literals stay as they are — "H:i" -> "--:--",
// "h:i K" -> "--:-- --", "d/m/Y" -> "--/--/----". Meant as the default
// placeholder of a masked field, so an empty one shows the shape it expects
// instead of nothing at all, the way a native date/time input does.
// Token-agnostic like everything else here: the dash count comes from the
// segment's own width, never from what its token means.
export const MASK_FILLER = '-'

export function maskPlaceholder(segments: MaskSegment[]): string {
  return segments
    .map((segment) => (segment.type === 'literal' ? segment.text : MASK_FILLER.repeat(segmentWidth(segment))))
    .join('')
}

// Where each fillable group sits inside a string of maskPlaceholder's shape,
// in order — the position table the fixed-width template editor works from,
// and what turns a click offset into "the minutes group". Derived from the
// widths rather than from the characters, because in a template every group
// is rendered at full width whether it holds typed characters or fillers —
// unlike a draft, which holds only what's been typed and so has to be
// measured character by character (locateSegment, below).
export function maskPlaceholderRanges(segments: MaskSegment[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = []
  let pos = 0
  for (const segment of segments) {
    if (segment.type === 'literal') {
      pos += segment.text.length
      continue
    }
    const width = segmentWidth(segment)
    ranges.push({ start: pos, end: pos + width })
    pos += width
  }
  return ranges
}

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

export type TokenSegment = Extract<MaskSegment, { type: 'token' }>
// Everything the user actually fills in, as opposed to the literal
// separators the mask inserts for them.
export type FillableSegment = Extract<MaskSegment, { type: 'token' | 'ampm' }>

interface LocatedSegment {
  index: number
  digitsStart: number
  digits: string
  segment: FillableSegment
}

// How far a fillable segment's own characters extend from `pos`. `ampm`
// holds letters rather than digits, and that's the only thing that differs
// about it as far as locating and splicing go — so the difference is
// confined to this one function, which every walk over the segment list
// goes through (rather than each walk re-deciding it and drifting).
function segmentCharsEnd(draft: string, segment: FillableSegment, pos: number): number {
  const isAmPm = segment.type === 'ampm'
  const pattern = isAmPm ? AM_PM_CHAR_PATTERN : /\d/
  const limit = Math.min(draft.length, pos + (isAmPm ? AM_PM_WIDTH : segment.width))
  let end = pos
  while (end < limit && pattern.test(draft[end])) end++
  return end
}

// Re-derives, fresh from the draft string every time (cheap — format
// strings are ~10 chars), which token segment a draft-offset falls in and
// what characters it already holds. No persistent typing-session state is
// kept anywhere in this module — every call starts from the actual current
// draft, so deleting mid-segment and later typing a replacement digit just
// works without any special-casing.
function locateSegment(draft: string, segments: MaskSegment[], offset: number): LocatedSegment | undefined {
  let pos = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === 'literal') {
      if (!draft.startsWith(seg.text, pos)) return undefined
      pos += seg.text.length
      continue
    }
    const digitsEnd = segmentCharsEnd(draft, seg, pos)
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
export function acceptDigit(
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

// The AM/PM equivalent of acceptDigit — far simpler, because there are only
// two possible values and the leading letter already identifies which one:
// typing "a"/"p" (in any case) writes the whole designator and completes the
// segment in one keystroke, so there's no ambiguous half-typed state to
// track and nothing for the auto-advance timeout to resolve.
//
// Deliberately overwrites whatever the segment already holds rather than
// rejecting a keystroke onto a full one: switching an existing "AM" to "PM"
// by putting the cursor next to it and typing "p" is the natural way to
// correct this field, and there's no partial state where appending would
// make sense anyway. The consequence is that "m" is never an accepted
// keystroke (the mask spells the designator out, the user doesn't), so
// typing "a" then "m" simply leaves the already-written "AM" alone.
export function acceptAmPmChar(newChar: string): { digits: string; done: boolean } | 'reject' {
  const key = newChar.toLowerCase()
  if (key !== 'a' && key !== 'p') return 'reject'
  return { digits: AM_PM_TEXT[key], done: true }
}

// Whether a group that holds fewer digits than its width can be finalized as
// the value it already spells — the rule behind both ways a short group gets
// closed out: an explicit separator keystroke and the ambiguous-digit
// timeout. A day "7" can (no 70-99 exists), a month "0" cannot (a valid
// prefix of "01"-"09", not a value), and a range-less Y/y always can.
export function canFinalizeDigits(segment: TokenSegment, digits: string): boolean {
  if (segment.min === undefined || segment.max === undefined) return true
  const value = Number(digits)
  return value >= segment.min && value <= segment.max
}

// Splices accepted characters (or an early force-advance) into the draft
// and, when the segment is done, auto-inserts the next literal separator —
// idempotently, since a redundant-separator keystroke can also route here
// with the literal already present.
function applyAcceptedChars(
  prevDraft: string,
  segments: MaskSegment[],
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
  segments: MaskSegment[],
  edit: { start: number; removedCount: number; inserted: string },
): { draft: string; cursor: number } | 'reject' {
  const char = edit.inserted
  if (edit.removedCount === 0 && prevDraft[edit.start] === char) {
    return { draft: prevDraft, cursor: edit.start + 1 }
  }
  const located = locateSegment(prevDraft, segments, edit.start)
  if (!located || located.digits.length === 0) return 'reject'
  // A partial day/month whose typed digits aren't themselves a valid value
  // (e.g. "0", a valid prefix of "01"-"09" but not a valid standalone
  // month/day) can't be finalized by an early separator either — reject it
  // so the user has to type the second digit, same rule the auto-advance
  // timeout applies (see pendingAdvanceAtCursor). Range-less Y/y is exempt
  // (any digits are "valid"), matching its existing force-advance behavior.
  const { segment, digits } = located
  if (segment.type === 'token' && digits.length < segment.width && !canFinalizeDigits(segment, digits)) {
    return 'reject'
  }
  const next = segments[located.index + 1]
  if (!next || next.type !== 'literal' || !next.text.startsWith(char)) return 'reject'
  return applyAcceptedChars(prevDraft, segments, located, { digits, done: true })
}

// Fallback for a multi-character insert (paste, autofill, IME commit) —
// deliberately simple: replay the raw text through the segment list from
// scratch, filling each segment with up to `width` consecutive digits.
// No per-segment range validation and no cursor-preserving remap here
// (full validation still happens at commit time via the owning component's
// own parse step, unchanged by any of this) — an intentional simplification,
// not an oversight.
//
// Reads the raw text rather than a digits-only reduction of it, because a
// separator in the input is real information about where one segment ends:
// a pasted "9:30 PM" has a one-digit hour, and flattening it to "930" first
// would fill a 2-wide hour segment with "93". Any *other* character between
// segments is still skipped over, so a paste whose separators differ from
// the format's (e.g. "2026/07/22" into "Y-m-d") still comes out in the
// format's own punctuation.
function rebuildFromRaw(segments: MaskSegment[], raw: string): { draft: string; cursor: number } {
  let draft = ''
  let pos = 0
  for (const seg of segments) {
    if (seg.type === 'literal') {
      draft += seg.text
      // Only consume the input's own copy of this separator when it
      // actually has one there; otherwise the format's separator is being
      // supplied, not matched.
      if (raw.startsWith(seg.text, pos)) pos += seg.text.length
      continue
    }
    if (seg.type === 'ampm') {
      const designator = /[ap]/i.exec(raw.slice(pos))
      if (!designator) break
      draft += AM_PM_TEXT[designator[0].toLowerCase() as 'a' | 'p']
      pos += designator.index + 1
      continue
    }
    while (pos < raw.length && !/\d/.test(raw[pos])) pos++
    let taken = ''
    while (pos < raw.length && taken.length < seg.width && /\d/.test(raw[pos])) {
      taken += raw[pos]
      pos++
    }
    if (taken === '') break
    draft += taken
    // Stop before the next literal separator when this segment came up
    // short and there's nothing left to fill the rest of the mask with —
    // a short segment followed by more input (the unpadded-hour case) is
    // complete as typed and carries on.
    if (taken.length < seg.width && !/\d/.test(raw.slice(pos))) break
  }
  return { draft, cursor: draft.length }
}

// The live-typing masker's entry point — called from InputDate's and
// InputTime's handleChange with the result of
// diffStrings(prevDraft, rawBrowserValue). Returns the masked draft + where
// the cursor should land, or the literal string 'reject' when the keystroke
// can't lead anywhere valid (the caller is expected to leave the draft
// unchanged and restore the cursor to where the rejected edit started).
export function applyInputMask(
  segments: MaskSegment[],
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
    // A letter typed into an AM/PM segment is the one non-digit keystroke
    // that fills a segment rather than confirming a separator, so it's
    // checked before the literal handling below (which would reject it).
    const ampmLocated = locateSegment(prevDraft, segments, edit.start)
    if (ampmLocated?.segment.type === 'ampm') {
      const outcome = acceptAmPmChar(inserted)
      if (outcome !== 'reject') return applyAcceptedChars(prevDraft, segments, ampmLocated, outcome)
    }
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
  if (located && located.segment.type === 'token') {
    const posInSegment = edit.start - located.digitsStart
    if (posInSegment >= 0 && posInSegment + edit.removedCount <= located.digits.length) {
      // The edit lands entirely within one segment's own digits (a plain
      // keystroke, or a selection that never leaves this segment — e.g.
      // overtyping just the "1" in a fully-typed day "12") — per-segment
      // range validation applies exactly like a fresh keystroke would, and a
      // genuinely invalid result rejects outright, no silent fix-up,
      // regardless of whether anything was removed.
      const removeEnd = posInSegment + edit.removedCount
      const digitsBefore = located.digits.slice(0, posInSegment)
      const digitsAfter = located.digits.slice(removeEnd)
      const outcome = acceptDigit(located.segment, digitsBefore, digitsAfter, inserted)
      return outcome === 'reject' ? 'reject' : applyAcceptedChars(prevDraft, segments, located, outcome)
    }
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
  segments: MaskSegment[],
  prevDraft: string,
  edit: { start: number; removedCount: number; inserted: string },
): { draft: string; cursor: number } {
  const rawNext = prevDraft.slice(0, edit.start) + edit.inserted + prevDraft.slice(edit.start + edit.removedCount)
  return rebuildFromRaw(segments, rawNext)
}

// Finalizes the ambiguous day/month/hour/minute segment the cursor is
// *currently sitting in* (finalize = force-advance it as-is, the same thing
// applyAcceptedChars does for an explicit early separator keystroke, just
// triggered without one), or returns null when the cursor's segment isn't an
// ambiguous open one. Drives the owning component's pending-advance timeout:
// after a short pause on an ambiguous digit like day "1", auto-complete it —
// matching the common native-date-input/masked-input pattern of pairing an
// explicit-separator path with a timeout rather than requiring one or the
// other.
//
// Cursor-scoped on purpose, NOT a global "find the first open segment
// anywhere" scan (which an earlier version was, and which was the bug): a
// day force-advanced to a single digit — e.g. "3/" — stays a 1-digit,
// "still technically open" segment forever, so a global scan keeps finding
// *it* even after the user has typed past it into the month/year, and would
// then schedule a spurious re-flush that yanks the cursor back to that old
// day segment. Only the segment actually under the cursor is a candidate,
// and only when the cursor sits right at the end of its single typed digit
// (i.e. it was just typed and is waiting for a possible second digit).
//
// Returns null for Y/y even when open — they have no min/max, so
// acceptDigit never leaves them in an "ambiguous, could stop here" state
// (only a genuinely-incomplete one that must be typed out in full), and
// there's nothing to auto-advance. Same for an AM/PM segment, which a
// single keystroke always completes outright.
export function pendingAdvanceAtCursor(
  segments: MaskSegment[],
  draft: string,
  cursor: number,
): { draft: string; cursor: number } | null {
  const located = locateSegment(draft, segments, cursor)
  if (!located) return null
  const { segment, digits, digitsStart } = located
  if (segment.type !== 'token') return null
  if (segment.min === undefined || segment.max === undefined) return null
  if (digits.length === 0 || digits.length >= segment.width) return null
  if (cursor !== digitsStart + digits.length) return null
  // Only auto-advance a single digit that's itself a valid value. "0" (for a
  // min-1 month/day) is a valid *prefix* of "01"-"09" but not a valid
  // standalone value — finalizing it to a bare "0" would commit to a wrong
  // date (flatpickr reads month "0" as December of the previous year), so it
  // stays open, waiting for the second digit, instead of auto-advancing.
  if (!canFinalizeDigits(segment, digits)) return null
  return applyAcceptedChars(draft, segments, located, { digits, done: true })
}

// Used by the Backspace/Delete handling in InputDate/InputTime to decide
// whether the adjacent character is a separator that should be stepped over
// rather than landed on — mirrors locateSegment's own walk so the two stay
// consistent.
export function isLiteralCharAt(draft: string, index: number, segments: MaskSegment[]): boolean {
  let pos = 0
  for (const seg of segments) {
    if (seg.type === 'literal') {
      if (index >= pos && index < pos + seg.text.length) return true
      pos += seg.text.length
      continue
    }
    pos = segmentCharsEnd(draft, seg, pos)
  }
  return false
}
