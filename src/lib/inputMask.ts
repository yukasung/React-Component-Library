// Segment shape for group editing — a `format` string turned into an ordered
// list of fixed-width character groups (with a valid value range, where one
// applies) and literal separator runs. Deliberately not tied to date *or*
// time formats: everything in this module works purely off
// `width`/`min`/`max`, which is what lets `InputDate` and `InputTime` share
// one vocabulary and one set of acceptance rules instead of growing two
// subtly different ones. The per-format tokenizers that produce these live
// next to their own parse/format logic (`tokenizeDateMask` in date.ts,
// `timeMaskSegments` in time.ts).
//
// This module is the *rules*; how they get applied to a field is
// src/lib/maskTemplate.ts's job.
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
      // Which end a part-typed group fills from, when something renders it at
      // full width (see maskTemplate's padSlot). Default 'start': a group with
      // a range holds a number, so "3" minutes is 03. 'end' is for a group
      // read most-significant-first — a year, where "2" means the 2000s. Set
      // by the tokenizers, which are the only place that knows which token is
      // which; inferring it from a missing `min` would tie the fill direction
      // to a range that could reasonably be added later.
      fill?: 'start' | 'end'
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

// The two AM/PM designators an `ampm` segment can hold. Fixed English
// strings for now — the time formats that use them are English-only in v1.
const AM_PM_TEXT = { a: 'AM', p: 'PM' } as const
export const AM_PM_WIDTH = 2

// The rendered width of anything the user fills in — the one place that
// answers "how many characters does this group occupy", so the fixed-width
// template editor and this module's own walks can't disagree about it.
export function segmentWidth(segment: FillableSegment): number {
  return segment.type === 'ampm' ? AM_PM_WIDTH : segment.width
}

// The mask as an empty template: every fillable segment becomes one filler per
// character it holds, literals stay as they are — "H:i" -> "__:__",
// "h:i K" -> "__:__ __", "d/m/Y" -> "__/__/____". Meant as the default
// placeholder of a masked field, so an empty one shows the shape it expects
// instead of nothing at all, the way a native date/time input does.
// Token-agnostic like everything else here: the filler count comes from the
// segment's own width, never from what its token means.
//
// Underscore rather than a dash so a group never blends into the separators
// around it: "Y-m-d" would otherwise render as ten identical dashes.
export const MASK_FILLER = '_'

export function maskPlaceholder(segments: MaskSegment[]): string {
  return segments
    .map((segment) => (segment.type === 'literal' ? segment.text : MASK_FILLER.repeat(segmentWidth(segment))))
    .join('')
}

// Where each fillable group sits inside a string of maskPlaceholder's shape,
// in order — the position table the fixed-width template editor works from,
// and what turns a click offset into "the minutes group". Derived from the
// widths rather than from the characters, because in a template every group
// is rendered at full width whether it holds typed characters or fillers.
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
// *how* it changed) — which is what lets the group editor read a paste or an
// IME commit without trying to classify the DOM event itself.
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
