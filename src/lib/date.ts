import flatpickr from 'flatpickr'

// flatpickr's static parseDate/formatDate accept an extra `locale` argument
// at runtime (confirmed empirically against the installed version — e.g.
// `flatpickr.formatDate(date, 'F j, Y', Thai)` correctly renders Thai month
// names) that isn't in the public FlatpickrFn type declarations (which only
// list 3/2 params respectively). Cast through these local types rather than
// `any` so every other call site stays fully typed.
type FormatDateWithLocale = (date: Date, format: string, locale?: flatpickr.CustomLocale) => string
type ParseDateWithLocale = (
  date: string,
  format?: string,
  timeless?: boolean,
  locale?: flatpickr.CustomLocale,
) => Date | undefined
const formatDateWithLocale = flatpickr.formatDate as FormatDateWithLocale
const parseDateWithLocale = flatpickr.parseDate as unknown as ParseDateWithLocale

// Day-granularity only for v1 (no time picker) — every commit point and
// min/max comparison normalizes through this first, so two Dates that only
// differ by time-of-day never compare as different days.
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime())
}

// Plain native Date arithmetic, deliberately not routed through flatpickr —
// keeps this pure function DOM/instance-free and independently testable.
export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// Used in place of InputNumber's `next !== lastCommittedRef.current`
// primitive check in the commit de-dupe guard — Dates need value
// comparison, not reference/primitive equality.
export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

// Day-granularity clamp (compares startOfDay results), symmetric to
// number.ts's clamp.
export function clampDate(value: Date, min?: Date | null, max?: Date | null): Date {
  let next = value
  if (min && startOfDay(next).getTime() < startOfDay(min).getTime()) next = min
  if (max && startOfDay(next).getTime() > startOfDay(max).getTime()) next = max
  return next
}

// Parses a raw draft string into a value to commit, using flatpickr's own
// parser (flatpickr.parseDate) so the text field's parsing and the calendar
// popup's own rendering are driven by literally the same format-token
// engine. `null` means "empty, a valid cleared state"; `undefined` means the
// string isn't parseable in the given format at all — same contract as
// number.ts's parseDraft. flatpickr.parseDate returns undefined for an
// empty string too, so the empty case is special-cased here to produce the
// "valid empty" `null` instead.
//
// Caveat (confirmed against flatpickr's own source, not documented by
// flatpickr itself): alphabetic name tokens — F/M (month name) and D/l
// (weekday name) and K (AM/PM) — have an *empty* tokenRegex entry in
// flatpickr's parser, so typed text can't actually be parsed back through
// them (the parser silently skips that part of the string instead of
// matching a month/weekday name, leaving that date component at its
// freshly-constructed default). formats.F/M/D/l/K still work fine for
// *display* (formatDateValue below), and the calendar popup never needs to
// parse typed text at all (it only ever produces a Date directly from a
// click) — this only bites a `format` that both (a) includes one of these
// alphabetic tokens and (b) is manually typed rather than picked from the
// popup. Prefer a numeric-only format (Y/y/m/n/d/j + separators) for any
// format string a consumer expects users to type into reliably.
export function parseDateDraft(
  raw: string,
  format: string,
  yearOffset = 0,
  locale?: flatpickr.CustomLocale,
): Date | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  let toParse = trimmed
  if (yearOffset !== 0) {
    const yearToken = findYearToken(format)
    if (yearToken) {
      const shifted = unshiftYearInDraft(trimmed, format, yearOffset)
      // A format with a year token but input that doesn't match it at all
      // (malformed/incomplete typing) is genuinely unparseable — don't fall
      // through to an unshifted parse, which could silently succeed with
      // the wrong (still-BE, not yet converted to Gregorian) year.
      if (shifted === undefined) return undefined
      toParse = shifted
    }
    // else: format has no year token at all, so there's nothing to shift —
    // parse the raw text as-is regardless of yearOffset.
  }
  const parsed = locale ? parseDateWithLocale(toParse, format, false, locale) : flatpickr.parseDate(toParse, format)
  if (!parsed || !isValidDate(parsed)) return undefined
  return startOfDay(parsed)
}

export function formatDateValue(
  value: Date | null,
  format: string,
  yearOffset = 0,
  locale?: flatpickr.CustomLocale,
): string {
  if (value === null) return ''
  const formatter = locale
    ? (date: Date, fmt: string) => formatDateWithLocale(date, fmt, locale)
    : (date: Date, fmt: string) => flatpickr.formatDate(date, fmt)
  if (yearOffset === 0) return formatter(value, format)
  return formatDateWithYearOffset(value, format, yearOffset, formatter) ?? formatter(value, format)
}

// Locates the first unescaped Y (4-digit) or y (2-digit) token in a format
// string — shared by formatDateWithYearOffset (which needs to split the
// format around it) and parseDateDraft (which needs to know whether
// shifting even applies before delegating to unshiftYearInDraft).
function findYearToken(format: string): { index: number; token: 'Y' | 'y' } | undefined {
  for (let i = 0; i < format.length; i++) {
    if (format[i - 1] === '\\') continue
    if (format[i] === 'Y' || format[i] === 'y') return { index: i, token: format[i] as 'Y' | 'y' }
  }
  return undefined
}

// Buddhist Era (and any other fixed year offset) support, layered entirely
// on top of flatpickr — flatpickr itself has zero concept of calendar eras,
// its Y/y tokens always read date.getFullYear() (Gregorian) directly.
//
// Format direction: shifts the year *up* by `yearOffset` for display.
// Deliberately does NOT construct a shifted Date (e.g.
// `new Date(date.getFullYear() + yearOffset, ...)`) — leap-year-ness of the
// real year and of the shifted year follow different mod-4/100/400 results
// (e.g. 2024 is a leap year, 2567 is not), so a shifted-Date approach
// silently normalizes a real Feb 29 to March 1. Instead, the format string
// is split around the year token into `before`/`after` substrings, each
// formatted separately (via the injected `formatter`, kept flatpickr-
// instance/locale-agnostic here) against the real, unmodified date, and the
// shifted year digits are spliced in between — the day is never at risk of
// moving because the real date is all that's ever formatted. Works equally
// for numeric (`"Y-m-d"`) and alphabetic-token (`"F j, Y"`) formats, since
// it never needs to parse rendered output text, only the format string
// itself. Returns undefined if the format has no year token.
export function formatDateWithYearOffset(
  date: Date,
  format: string,
  yearOffset: number,
  formatter: (date: Date, format: string) => string,
): string | undefined {
  const yearToken = findYearToken(format)
  if (!yearToken) return undefined
  const before = format.slice(0, yearToken.index)
  const after = format.slice(yearToken.index + 1)
  const beforeText = before ? formatter(date, before) : ''
  const afterText = after ? formatter(date, after) : ''
  const shiftedYear = date.getFullYear() + yearOffset
  const yearText =
    yearToken.token === 'Y' ? String(shiftedYear).padStart(4, '0') : String(positiveMod(shiftedYear, 100)).padStart(2, '0')
  return beforeText + yearText + afterText
}

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

// Regex fragments for the numeric tokens flatpickr's own parser accepts —
// mirrors flatpickr's tokenRegex table (confirmed against
// flatpickr/dist/esm/utils/formatting.js) for exactly the subset that
// matters here: alphabetic name tokens (F/M/D/l) can't be reliably parsed
// back from typed text at all (see parseDateDraft's doc comment above),
// era-independently, so unshiftYearInDraft only ever needs to handle
// formats built from these.
const NUMERIC_TOKEN_PATTERN: Record<string, string> = {
  Y: '(\\d{4})',
  y: '(\\d{2})',
  m: '(\\d\\d|\\d)',
  n: '(\\d\\d|\\d)',
  d: '(\\d\\d|\\d)',
  j: '(\\d\\d|\\d)',
}

// Parse direction: shifts a typed year *down* by `yearOffset` before
// handing the corrected (Gregorian-equivalent) string off to flatpickr's
// real parser. Unlike the format direction, this can't just split the
// format string and format each half independently — it has to locate the
// year's digit span within arbitrary, unstructured typed text. Naively
// searching for "the year's digits" is unsafe: e.g. format "d/m/y" on
// "26/01/26" has day and 2-digit year-suffix that are textually identical
// (a common date, not a rare edge case), and adjacent variable-width
// tokens with no separator (e.g. "nY") can't be split without knowing
// where one token's digits end and the next begins. Both are only solved
// correctly by building ONE combined regex across every numeric token in
// the format (mirroring flatpickr's own createDateParser accumulation
// loop) and letting regex backtracking disambiguate — matching just the
// year token in isolation can't know where neighboring tokens end.
//
// Scoped to numeric tokens only (Y y m n d j) — returns undefined for a
// format containing any other token, since typed round-trip through
// alphabetic tokens was already unsupported before era-shifting existed
// (see parseDateDraft's doc comment), not a new restriction.
export function unshiftYearInDraft(raw: string, format: string, yearOffset: number): string | undefined {
  let pattern = ''
  let groupIndex = 0
  let yearGroupIndex: number | undefined
  let yearToken: 'Y' | 'y' | undefined
  for (let i = 0; i < format.length; i++) {
    if (format[i] === '\\') continue
    const escaped = format[i - 1] === '\\'
    const char = format[i]
    if (!escaped && NUMERIC_TOKEN_PATTERN[char]) {
      groupIndex++
      if (char === 'Y' || char === 'y') {
        yearGroupIndex = groupIndex
        yearToken = char
      }
      pattern += NUMERIC_TOKEN_PATTERN[char]
    } else if (!escaped && /[A-Za-z]/.test(char)) {
      // Any other alphabetic token (F, M, D, l, ...) — not supported for
      // typed round-trip at all, era-independently; bail out entirely
      // rather than guessing.
      return undefined
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  if (yearGroupIndex === undefined || !yearToken) return undefined
  const match = new RegExp('^' + pattern + '$').exec(raw.trim())
  if (!match) return undefined
  const rawYear = match[yearGroupIndex]
  const shifted =
    yearToken === 'Y' ? Number(rawYear) - yearOffset : positiveMod(Number(rawYear) - yearOffset, 100)
  const replacement = yearToken === 'Y' ? String(shifted).padStart(4, '0') : String(shifted).padStart(2, '0')
  // Locate the matched year group's exact position within the full match
  // by re-scanning group values in order — a capture group's string value
  // alone doesn't carry its own offset, and adjacent groups can share
  // identical text (the "26/01/26" case), so this has to walk forward
  // through the groups in sequence rather than search for `rawYear` in
  // isolation.
  let searchFrom = 0
  let yearStart = -1
  for (let g = 1; g <= yearGroupIndex; g++) {
    const groupText = match[g]
    const idx = match[0].indexOf(groupText, searchFrom)
    if (g === yearGroupIndex) yearStart = idx
    searchFrom = idx + groupText.length
  }
  const trimmed = raw.trim()
  return trimmed.slice(0, yearStart) + replacement + trimmed.slice(yearStart + rawYear.length)
}
