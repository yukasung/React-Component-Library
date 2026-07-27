import type { MaskSegment } from './inputMask'

// Minutes in a day — the exclusive upper bound of every "minutes of day"
// value in this module. A time is always 0 <= minutes < MINUTES_PER_DAY.
export const MINUTES_PER_DAY = 24 * 60

// Format tokens supported for time entry, deliberately spelled the same way
// InputDate's tokens are (flatpickr's vocabulary) so consumers only ever
// learn one set of format strings for this library:
//   H  hours, 24-hour, zero-padded   00-23
//   h  hours, 12-hour, unpadded       1-12
//   G  hours, 12-hour, zero-padded   01-12
//   i  minutes, zero-padded          00-59
//   K  AM/PM designator
//
// Unlike InputDate — which delegates both formatting and parsing to
// flatpickr's own engine — everything here is implemented from scratch,
// because flatpickr *cannot* parse the AM/PM token back out of typed text:
// its `tokenRegex.K` entry is the empty string and `createDateParser` guards
// every token with `if (tokenRegex[token] && !escaped)`, so the designator
// is skipped outright and "2:30 PM" silently parses as 02:30 (confirmed by
// reading flatpickr/dist/esm/utils/{formatting,dates}.js, not assumed). The
// same limitation is already documented for F/M/D/l in parseDateDraft's doc
// comment in date.ts; for a *date* it only affects month/weekday-name
// formats that were never meant to be typed, but for a time it would break
// the single most common format there is, so it can't be lived with here.
//
// Seconds (S/s) are deliberately not in this set — see tokenizeTimeFormat.
export type TimeToken = 'H' | 'h' | 'G' | 'i' | 'K'

export type TimeFormatSegment = { type: 'token'; token: TimeToken } | { type: 'literal'; text: string }

const TIME_TOKENS = new Set<string>(['H', 'h', 'G', 'i', 'K'])

// The mask shape of each digit token (width plus the range each segment's
// value must land in) — consumed by timeMaskSegments below and, through it,
// by the shared masker in inputMask.ts. `K` has no entry here because it
// isn't a digit segment at all; it maps to the masker's own `ampm` kind.
const TOKEN_MASK: Record<Exclude<TimeToken, 'K'>, { width: number; min: number; max: number }> = {
  H: { width: 2, min: 0, max: 23 },
  h: { width: 2, min: 1, max: 12 },
  G: { width: 2, min: 1, max: 12 },
  i: { width: 2, min: 0, max: 59 },
}

// Splits a format string into ordered token/literal segments, or returns
// undefined if it contains any alphabetic character that isn't a supported
// token. Walks the string the same way tokenizeDateMask does — char by
// char, `\`-escape aware, bail on any other letter — rather than a regex,
// so escaped literals (e.g. `\\h` for a literal "h") behave identically in
// both components.
//
// Returning undefined (rather than rendering the unknown token literally)
// is what lets the component fall back to a format it *can* handle instead
// of silently displaying a wrong time. Seconds are the notable case: a
// format like "H:i:S" is rejected here, since v1 works at whole-minute
// granularity throughout (the dropdown steps in minutes, min/max clamp in
// minutes) and half-supporting seconds in display only would be worse than
// not supporting them.
export function tokenizeTimeFormat(format: string): TimeFormatSegment[] | undefined {
  const segments: TimeFormatSegment[] = []
  let literal = ''
  function flushLiteral() {
    if (literal) segments.push({ type: 'literal', text: literal })
    literal = ''
  }
  for (let i = 0; i < format.length; i++) {
    if (format[i] === '\\') continue
    const escaped = format[i - 1] === '\\'
    const char = format[i]
    if (!escaped && TIME_TOKENS.has(char)) {
      flushLiteral()
      segments.push({ type: 'token', token: char as TimeToken })
    } else if (!escaped && /[A-Za-z]/.test(char)) {
      return undefined
    } else {
      literal += char
    }
  }
  flushLiteral()
  return segments
}

// The live-typing mask segments for a format, or undefined when the format
// isn't one this module can drive a mask from. Everything about how those
// segments then behave while typing (auto-inserted separators, per-segment
// digit ranges, the ambiguous-digit auto-advance) is the shared masker's
// job, not this module's — see src/lib/inputMask.ts.
export function timeMaskSegments(format: string): MaskSegment[] | undefined {
  const segments = tokenizeTimeFormat(format)
  if (!segments) return undefined
  return segments.map((segment) => {
    if (segment.type === 'literal') return { type: 'literal', text: segment.text }
    if (segment.token === 'K') return { type: 'ampm' }
    const { width, min, max } = TOKEN_MASK[segment.token]
    return { type: 'token', token: segment.token, width, min, max }
  })
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

// 0 and 12-23 map onto the 12-hour clock's 12 and 1-11; midnight and noon
// are both displayed as "12", which is what makes the AM/PM designator
// load-bearing rather than decorative.
function to12Hour(hours: number): number {
  const hour = hours % 12
  return hour === 0 ? 12 : hour
}

export function formatTimeOfDay(minutes: number, format: string): string {
  const segments = tokenizeTimeFormat(format)
  if (!segments) return ''
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  return segments
    .map((segment) => {
      if (segment.type === 'literal') return segment.text
      switch (segment.token) {
        case 'H':
          return pad2(hours)
        case 'h':
          return String(to12Hour(hours))
        case 'G':
          return pad2(to12Hour(hours))
        case 'i':
          return pad2(mins)
        case 'K':
          return hours < 12 ? 'AM' : 'PM'
      }
    })
    .join('')
}

export function formatTimeValue(value: Date | null, format: string): string {
  if (value === null) return ''
  return formatTimeOfDay(timeOfDayMinutes(value), format)
}

// Regex fragments for each token, used to build one combined pattern for
// the whole format — the same single-pass approach unshiftYearInDraft uses
// in date.ts, and for the same reason: matching tokens in isolation can't
// tell where one variable-width digit group ends and the next begins when
// they sit next to each other without a separator.
const TOKEN_PATTERN: Record<TimeToken, string> = {
  H: '(\\d\\d|\\d)',
  h: '(\\d\\d|\\d)',
  G: '(\\d\\d|\\d)',
  i: '(\\d\\d|\\d)',
  K: '([AaPp])[Mm]?',
}

// Parses a raw draft string into minutes of day. `null` means "empty, a
// valid cleared state"; `undefined` means the string isn't parseable in the
// given format at all — the same contract as number.ts's parseDraft and
// date.ts's parseDateDraft, so every component's commit path can treat all
// three identically.
//
// Deliberately tolerant in the two ways a typed draft differs from a
// formatted one: a zero-padded token still accepts a single digit (so "9:30"
// parses under "H:i" without waiting for "09:30"), and the AM/PM designator
// accepts a bare "A"/"P" as well as the full "AM"/"PM". Range checking is
// strict, though — hours and minutes outside their token's range fail
// rather than wrapping, so "25:00" is rejected instead of quietly becoming
// 01:00 the next day.
export function parseTimeDraft(raw: string, format: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const segments = tokenizeTimeFormat(format)
  if (!segments) return undefined

  let pattern = ''
  const groupTokens: TimeToken[] = []
  for (const segment of segments) {
    if (segment.type === 'literal') {
      pattern += segment.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      continue
    }
    groupTokens.push(segment.token)
    pattern += TOKEN_PATTERN[segment.token]
  }
  const match = new RegExp('^' + pattern + '$', 'i').exec(trimmed)
  if (!match) return undefined

  let hours: number | undefined
  let minutes = 0
  let isTwelveHour = false
  let isPm: boolean | undefined
  for (let i = 0; i < groupTokens.length; i++) {
    const token = groupTokens[i]
    const text = match[i + 1]
    if (token === 'K') {
      isPm = text.toLowerCase() === 'p'
      continue
    }
    const value = Number(text)
    const { min, max } = TOKEN_MASK[token]
    if (value < min || value > max) return undefined
    if (token === 'i') {
      minutes = value
      continue
    }
    hours = value
    isTwelveHour = token !== 'H'
  }
  if (hours === undefined) return undefined
  if (isTwelveHour) {
    // A 12-hour format with no designator in it at all (e.g. plain "h:i")
    // has no way to express the afternoon, so 12 means midnight there and
    // 1-11 mean the morning hours. When there *is* a designator, "12 AM" is
    // midnight and "12 PM" is noon — the one hour where the 12-hour clock's
    // numbering doesn't simply offset by 12.
    hours = hours % 12
    if (isPm) hours += 12
  }
  return hours * 60 + minutes
}

// Minute granularity throughout: seconds and milliseconds are dropped, so
// two values that differ only below a minute compare and clamp as the same
// time (mirrors startOfDay's role in date.ts).
export function timeOfDayMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

// Applies a time of day to an existing date, keeping its year/month/day.
// This is what makes a date field and a time field composable into one
// Date: committing a time never moves the day it belongs to.
export function withTimeOfDay(base: Date, minutes: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0)
}

// Used in place of a primitive `!==` in the commit de-dupe guard — Dates
// need value comparison, and only their time-of-day part matters here
// (symmetric to isSameDay in date.ts, which compares only the other part).
export function isSameTime(a: Date, b: Date): boolean {
  return timeOfDayMinutes(a) === timeOfDayMinutes(b)
}

export function clampMinutes(minutes: number, min?: number | null, max?: number | null): number {
  let next = minutes
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

// The dropdown's entries: every time from `min` to `max` inclusive, spaced
// `step` minutes apart. An unusable step (zero or negative, which would
// loop forever) yields an empty list rather than throwing — the component
// treats "no entries" and "no dropdown" as the same state anyway.
export function buildTimeList(min: number, max: number, step: number): number[] {
  if (step <= 0 || max < min) return []
  const times: number[] = []
  for (let minutes = min; minutes <= max; minutes += step) times.push(minutes)
  return times
}

// The entry Arrow-key/wheel stepping should move to, given where the value
// currently sits. Stepping is defined as movement through the generated
// list rather than raw ±step arithmetic, so a value that isn't on the grid
// (typed by hand, or left over from a previous `step`) snaps onto the
// nearest entry in the direction of travel instead of carrying its
// off-grid remainder along forever. Returns undefined when there's nowhere
// left to go (already at the end of the list, or the list is empty).
export function stepThroughTimes(times: number[], current: number | null, direction: 1 | -1): number | undefined {
  if (times.length === 0) return undefined
  if (current === null) return direction === 1 ? times[0] : times[times.length - 1]
  if (direction === 1) return times.find((minutes) => minutes > current)
  // findLast would read better but needs a newer lib target than this
  // package builds against.
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] < current) return times[i]
  }
  return undefined
}
