import { DATE_TOKENS, DATE_TOKEN_MASK, isValidDate } from './date'
import type { DateToken } from './date'
import { escapeRegExp, tokenizeFormat } from './inputMask'
import type { MaskSegment } from './inputMask'
import { MINUTES_PER_DAY, TIME_TOKENS, TIME_TOKEN_MASK } from './time'
import type { TimeToken } from './time'

// One `Date` holding both halves — what `InputDateTime` edits, and the only
// module that has to reason about a format naming date *and* time tokens at
// once. Everything it can borrow it borrows: the token sets and their mask
// shapes come from date.ts and time.ts (so a token's width or range is stated
// exactly once), the segment vocabulary from inputMask.ts, and display
// formatting isn't here at all — `formatDateValue` already renders flatpickr's
// time tokens and already handles Buddhist Era, so InputDateTime calls it
// directly.
//
// Parsing is the one thing that genuinely can't be borrowed, and not for want
// of trying:
//   - flatpickr's own parser (which `parseDateDraft` delegates to) has an
//     *empty* tokenRegex entry for `K`, so "2026-08-18 02:30 PM" comes back as
//     02:30 — the same limitation that made time.ts write its own parser.
//   - Splitting the typed text into a date part and a time part and handing
//     each to its existing parser can't be done safely either: finding where
//     one part ends needs exactly the "which digits belong to which token"
//     answer that only a regex over the whole format has (see
//     unshiftYearInDraft's own note in date.ts on "26/01/26").
// So the format is compiled into one regex across every token, the same shape
// time.ts's timePattern builds, and the components are assembled here.

export type DateTimeToken = DateToken | TimeToken

const DATE_TIME_TOKENS: ReadonlySet<DateTimeToken> = new Set<DateTimeToken>([...DATE_TOKENS, ...TIME_TOKENS])

// Whether a token names a time-of-day part rather than a calendar part. Used
// by InputDateTime to decide what an Arrow key steps: the day, or the next
// entry in the time list.
export function isTimeToken(token: string): token is TimeToken {
  return (TIME_TOKENS as ReadonlySet<string>).has(token)
}

// Which half a *group* belongs to (a `MaskSegment` as the group editor sees
// it). The AM/PM designator is a time group despite not being a token
// segment — it is the one part of the time that isn't digits.
export function isTimeSegment(segment: MaskSegment): boolean {
  if (segment.type === 'ampm') return true
  return segment.type === 'token' && isTimeToken(segment.token)
}

// A combined format as fixed-width groups, or undefined when it names a token
// the groups can't describe (F/M/D/l spell a month or weekday out, and `S`/`s`
// are seconds, which this library doesn't carry). Undefined is what makes such
// a format pick-only in the component, exactly as it does in InputDate.
export function tokenizeDateTimeMask(format: string): MaskSegment[] | undefined {
  const segments = tokenizeFormat(format, DATE_TIME_TOKENS)
  if (!segments) return undefined
  const tokens = segments.filter((segment) => segment.type === 'token').map((segment) => segment.token)
  // Same rejection tokenizeTimeFormat makes, and for the same reason: a
  // 24-hour hour has already said which half of the day it is, so a designator
  // beside it has nothing left to mean ("2026-08-18 14:30 PM" is not a time).
  if (tokens.includes('H') && tokens.includes('K')) return undefined
  return segments.map((segment) => {
    if (segment.type === 'literal') return { type: 'literal', text: segment.text }
    if (segment.token === 'K') return { type: 'ampm' }
    if (isTimeToken(segment.token)) {
      const { width, min, max } = TIME_TOKEN_MASK[segment.token]
      return { type: 'token', token: segment.token, width, min, max }
    }
    return { type: 'token', token: segment.token, ...DATE_TOKEN_MASK[segment.token] }
  })
}

// Minute granularity throughout, mirroring how date.ts normalizes through
// startOfDay and time.ts works in whole minutes: two values differing only
// below a minute are the same value here, for comparison and for clamping.
export function startOfMinute(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0)
}

// The commit de-dupe guard's comparison — `isSameDay` and `isSameTime` each
// deliberately ignore the other half, and this control cares about both.
export function isSameDateTime(a: Date, b: Date): boolean {
  return startOfMinute(a).getTime() === startOfMinute(b).getTime()
}

// Whole-timestamp clamp, unlike clampDate's day-granularity one: a `max` of
// 18:00 has to actually stop 18:30 on the same day.
export function clampDateTime(value: Date, min?: Date | null, max?: Date | null): Date {
  let next = value
  if (min && startOfMinute(next).getTime() < startOfMinute(min).getTime()) next = min
  if (max && startOfMinute(next).getTime() > startOfMinute(max).getTime()) next = max
  return startOfMinute(next)
}

// Every digit token accepts one or two digits (four for `Y`, two for `y`) —
// their differing ranges are checked afterward against the shared mask tables,
// where the real distinction already lives. Mirrors flatpickr's own tokenRegex
// for the date half and time.ts's DIGIT_TOKEN_PATTERN for the time half.
const TOKEN_PATTERN: Record<string, string> = {
  Y: '(\\d{4})',
  y: '(\\d{2})',
  K: '([AaPp])[Mm]?',
}
const DEFAULT_TOKEN_PATTERN = '(\\d\\d|\\d)'

interface DateTimePattern {
  regex: RegExp
  groupTokens: DateTimeToken[]
}

// Compiled once per format string: building the pattern walks the format and
// escapes every literal, while parsing itself runs on every commit, Arrow key
// and wheel notch. Same cache, same reasoning, as time.ts's patternCache.
const patternCache = new Map<string, DateTimePattern | undefined>()

function dateTimePattern(format: string): DateTimePattern | undefined {
  if (patternCache.has(format)) return patternCache.get(format)
  const segments = tokenizeFormat(format, DATE_TIME_TOKENS)
  if (!segments) {
    patternCache.set(format, undefined)
    return undefined
  }
  let pattern = ''
  const groupTokens: DateTimeToken[] = []
  for (const segment of segments) {
    if (segment.type === 'literal') {
      pattern += escapeRegExp(segment.text)
      continue
    }
    groupTokens.push(segment.token)
    pattern += TOKEN_PATTERN[segment.token] ?? DEFAULT_TOKEN_PATTERN
  }
  const compiled = { regex: new RegExp('^' + pattern + '$', 'i'), groupTokens }
  patternCache.set(format, compiled)
  return compiled
}

interface DateTimeParts {
  year?: number
  month?: number
  day?: number
  hours?: number
  minutes: number
  isTwelveHour: boolean
  isPm?: boolean
}

// Parses a raw draft into a Date carrying both halves. `null` means "empty, a
// valid cleared state"; `undefined` means the text isn't parseable in this
// format at all — the same three-way contract as parseDraft (number.ts),
// parseDateDraft (date.ts) and parseTimeDraft (time.ts), so every component's
// commit path treats all four identically.
//
// Tolerant in the two ways a typed draft differs from a formatted one, exactly
// as parseTimeDraft is: a zero-padded token still accepts a single digit, and
// the designator accepts a bare "A"/"P". Ranges are strict, and a date whose
// parts don't survive construction (Feb 31, "13" as a month) is rejected
// rather than rolled over into the next month.
//
// `yearOffset` is the Buddhist Era shift — subtracted from the typed year to
// get back to a Gregorian one. Unlike date.ts, which has to splice a corrected
// year back into the text before handing it to flatpickr, this parser owns the
// year digits directly, so the shift is one subtraction.
export function parseDateTimeDraft(raw: string, format: string, yearOffset = 0): Date | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const pattern = dateTimePattern(format)
  if (!pattern) return undefined
  const match = pattern.regex.exec(trimmed)
  if (!match) return undefined

  const parts: DateTimeParts = { minutes: 0, isTwelveHour: false }
  for (let i = 0; i < pattern.groupTokens.length; i++) {
    const token = pattern.groupTokens[i]
    const text = match[i + 1]
    if (token === 'K') {
      parts.isPm = text.toLowerCase() === 'p'
      continue
    }
    const value = Number(text)
    if (!Number.isFinite(value)) return undefined
    if (isTimeToken(token)) {
      const { min, max } = TIME_TOKEN_MASK[token]
      if (value < min || value > max) return undefined
      if (token === 'i') parts.minutes = value
      else {
        parts.hours = value
        parts.isTwelveHour = token !== 'H'
      }
      continue
    }
    const { min, max } = DATE_TOKEN_MASK[token]
    if (min !== undefined && (value < min || value > max!)) return undefined
    if (token === 'Y') parts.year = value
    // A 2-digit year is the 2000s, matching flatpickr's own revFormat.y.
    else if (token === 'y') parts.year = 2000 + value
    else if (token === 'm' || token === 'n') parts.month = value
    else parts.day = value
  }
  return assemble(parts, yearOffset)
}

function assemble(parts: DateTimeParts, yearOffset: number): Date | undefined {
  const { minutes } = parts
  let hours = parts.hours ?? 0
  if (parts.isTwelveHour) {
    // A 12-hour format with no designator can't express the afternoon, so 12
    // is midnight and 1-11 are the morning; with one, "12 AM" is midnight and
    // "12 PM" is noon. Same rule parseTimeDraft states, and the same reason.
    hours = hours % 12
    if (parts.isPm) hours += 12
  }
  if (hours * 60 + minutes >= MINUTES_PER_DAY) return undefined
  // A format naming no date token at all (a bare time) is still a date: it
  // takes today's, the way an InputTime-only value carries whatever day it
  // already had.
  const today = new Date()
  const year = (parts.year ?? today.getFullYear()) - yearOffset
  const month = (parts.month ?? today.getMonth() + 1) - 1
  const day = parts.day ?? today.getDate()
  const date = new Date(year, month, day, hours, minutes, 0, 0)
  if (!isValidDate(date)) return undefined
  // Construction rolls an impossible day over (Feb 31 becomes March 3) rather
  // than failing, so the components are read back to catch it. Years below 100
  // are the other case: `new Date(26, ...)` means 1926, and a year the user
  // genuinely typed as "0026" shouldn't silently become that.
  if (date.getMonth() !== month || date.getDate() !== day) return undefined
  if (date.getFullYear() !== year) return undefined
  return date
}
