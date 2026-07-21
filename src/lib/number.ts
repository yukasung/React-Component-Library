// Parses a raw draft string into a value to commit.
// `null` means "empty, a valid cleared state"; `undefined` means the string
// isn't parseable as a finite number at all — callers use that distinction
// to decide between committing and reverting the draft.
export function parseDraft(raw: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function formatValue(value: number | null, precision?: number): string {
  if (value === null) return ''
  return typeof precision === 'number' ? value.toFixed(precision) : String(value)
}

export function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

// Avoids float artifacts (e.g. 0.1 + 0.2 -> 0.30000000000000004) from
// repeated step arithmetic.
export function roundToPrecision(value: number, precision?: number): number {
  return typeof precision === 'number' ? Number(value.toFixed(precision)) : value
}

// Infers decimal places from a fractional `step` (e.g. 0.1 -> 1) so
// increment/decrement doesn't accumulate float garbage. Integer steps need
// no rounding.
export function resolvePrecision(step?: number): number | undefined {
  if (typeof step === 'number' && !Number.isInteger(step)) {
    return String(step).split('.')[1]?.length
  }
  return undefined
}

// Cuts off excess decimal digits instead of rounding them (e.g. 2.999 at
// precision 1 -> 2.9, not 3.0).
export function truncateToPrecision(value: number, precision?: number): number {
  if (typeof precision !== 'number') return value
  const factor = 10 ** precision
  return Math.trunc(value * factor) / factor
}

// Picks rounding vs. truncation for reducing a value to `precision` decimal
// places, per the `truncate` prop.
export function applyPrecision(value: number, precision?: number, truncate = false): number {
  return truncate ? truncateToPrecision(value, precision) : roundToPrecision(value, precision)
}

const DRAFT_PATTERN = /^-?\d*\.?\d*$/

// Structural check for an in-progress typed value: only a leading `-`,
// digits, and at most one `.` are allowed. Deliberately more permissive than
// parseDraft — "-" or "1." are valid partial input, not yet valid numbers;
// parseDraft still governs whether a draft can commit.
export function isValidDraft(raw: string): boolean {
  return DRAFT_PATTERN.test(raw.trim())
}

export function toggleSign(draft: string): string {
  return draft.startsWith('-') ? draft.slice(1) : `-${draft}`
}

export function stripSign(draft: string): string {
  return draft.startsWith('-') ? draft.slice(1) : draft
}

// Draft to show when "." is pressed on an empty field: "0." followed by a
// zero per decimal place (e.g. precision 2 -> "0.00"), or just "0." when no
// precision is set.
export function zeroDraftWithPrecision(precision?: number): string {
  const zeros = typeof precision === 'number' ? '0'.repeat(precision) : ''
  return `0.${zeros}`
}

// .NET-style standard numeric format string support (the `format` prop) —
// e.g. "n2", "C", "P0". Spec: https://learn.microsoft.com/en-us/dotnet/standard/base-types/standard-numeric-format-strings
export type NumericFormatSpecifier = 'C' | 'D' | 'E' | 'F' | 'G' | 'N' | 'P' | 'R' | 'X'

export interface NumericFormatSpec {
  specifier: NumericFormatSpecifier
  // Undefined means "use the specifier's own default precision" (resolved
  // per-specifier in formatWithSpec, matching .NET's per-type defaults).
  precision: number | undefined
  // Case of the format letter controls output case for E/G/X (e.g. "e" vs "E").
  uppercase: boolean
}

const NUMERIC_FORMAT_PATTERN = /^([CDEFGNPRX])(\d{0,9})?$/i

// A standard numeric format string is exactly one letter plus an optional
// precision digit string — anything else (custom format strings) isn't
// supported, matching this component's v1 scope.
export function parseNumericFormat(format: string): NumericFormatSpec | undefined {
  const match = NUMERIC_FORMAT_PATTERN.exec(format.trim())
  if (!match) return undefined
  const [, letter, digits] = match
  return {
    specifier: letter.toUpperCase() as NumericFormatSpecifier,
    precision: digits ? Number(digits) : undefined,
    uppercase: letter === letter.toUpperCase(),
  }
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// -0 is a real, distinct JS value (Object.is(-0, -0) is true) but fails a
// plain `< 0` check and silently loses its sign through toFixed()/
// toExponential()/String() — without this, a live draft that parses to
// exactly -0 (e.g. typing "-" right before an existing lone "0" digit,
// such as "$0" -> "$-0") would snap back to looking positive/unsigned
// until another digit is typed, even though the user's "-" is still
// sitting right there in the draft.
export function isNegative(value: number): boolean {
  return value < 0 || Object.is(value, -0)
}

// Shared by N and (after prefixing/suffixing) C and P: integral + fractional
// digits with group separators, e.g. 1234.5 -> "1,234.50".
function formatGrouped(absValue: number, precision: number): string {
  const [intPart, fracPart] = absValue.toFixed(precision).split('.')
  const grouped = groupDigits(intPart)
  return fracPart ? `${grouped}.${fracPart}` : grouped
}

function formatFixedSpec(value: number, precision: number): string {
  return (isNegative(value) ? '-' : '') + Math.abs(value).toFixed(precision)
}

function formatNumberSpec(value: number, precision: number): string {
  return (isNegative(value) ? '-' : '') + formatGrouped(Math.abs(value), precision)
}

// .NET's default CurrencyNegativePattern for en-US wraps negatives in
// parentheses instead of a leading minus sign (e.g. -123.46 -> "($123.46)")
// — matched here for parity with Wijmo/.NET. The parens mean the "-" the
// user types has no literal counterpart character in the formatted output,
// which the live cursor-position math in reformatDraftLive accounts for
// separately (see the `usesParens` branch there) by excluding the sign
// from the "content characters" it tracks whenever this specifier is
// negative, rather than assuming a 1:1 "-" character to follow.
function formatCurrencySpec(value: number, precision: number): string {
  const grouped = formatGrouped(Math.abs(value), precision)
  return isNegative(value) ? `($${grouped})` : `$${grouped}`
}

// Percent multiplies by 100 before display, per the "P" spec.
function formatPercentSpec(value: number, precision: number): string {
  return (isNegative(value) ? '-' : '') + formatGrouped(Math.abs(value) * 100, precision) + '%'
}

function formatDecimalSpec(value: number, precision: number | undefined): string {
  const intValue = Math.trunc(value)
  const digits = Math.abs(intValue).toString()
  const padded = typeof precision === 'number' ? digits.padStart(precision, '0') : digits
  return (isNegative(intValue) ? '-' : '') + padded
}

// .NET pads the exponent to a minimum of 3 digits for "E" (2 for "G" — see
// formatGeneralSpec) and always includes an explicit +/- sign. Runs
// toExponential() on the magnitude only (not the signed value) and
// prepends the sign itself via isNegative() — value.toExponential() on its
// own silently drops the sign for exactly -0 the same way toFixed() does.
function toExponentialParts(value: number, mantissaDigits: number) {
  const exp = Math.abs(value).toExponential(mantissaDigits)
  const match = /^(\d(?:\.\d+)?)e([+-])(\d+)$/.exec(exp)
  if (!match) return undefined
  const [, mantissaDigitsPart, sign, exponentDigits] = match
  const mantissa = (isNegative(value) ? '-' : '') + mantissaDigitsPart
  return { mantissa, sign, exponentDigits }
}

function formatExponentialSpec(value: number, precision: number, uppercase: boolean): string {
  const parts = toExponentialParts(value, precision)
  if (!parts) return value.toExponential(precision)
  const eChar = uppercase ? 'E' : 'e'
  return `${parts.mantissa}${eChar}${parts.sign}${parts.exponentDigits.padStart(3, '0')}`
}

// Fixed-point or scientific, whichever the .NET "G" spec would pick: fixed
// when the base-10 exponent is between -5 (exclusive) and the precision
// (exclusive), scientific otherwise. Trailing zeros are trimmed either way.
function formatGeneralSpec(value: number, precision: number | undefined, uppercase: boolean): string {
  if (value === 0) return isNegative(value) ? '-0' : '0'
  const significantDigits = precision && precision > 0 ? precision : 15
  const exponent = Math.floor(Math.log10(Math.abs(value)))
  if (exponent > -5 && exponent < significantDigits) {
    const decimals = Math.max(0, significantDigits - 1 - exponent)
    const fixed = value.toFixed(decimals)
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  }
  const parts = toExponentialParts(value, Math.max(0, significantDigits - 1))
  if (!parts) return value.toExponential()
  const mantissa = parts.mantissa.includes('.')
    ? parts.mantissa.replace(/0+$/, '').replace(/\.$/, '')
    : parts.mantissa
  const eChar = uppercase ? 'E' : 'e'
  return `${mantissa}${eChar}${parts.sign}${parts.exponentDigits.padStart(2, '0')}`
}

// Two's complement over 32 bits for negative values — there's no fixed
// integral type width in JS to match .NET's per-type behavior against, so
// Int32 width is the most broadly useful default.
function formatHexSpec(value: number, precision: number | undefined, uppercase: boolean): string {
  const intValue = Math.trunc(value)
  const unsigned = intValue < 0 ? intValue >>> 0 : intValue
  const hex = uppercase ? unsigned.toString(16).toUpperCase() : unsigned.toString(16)
  return typeof precision === 'number' ? hex.padStart(precision, '0') : hex
}

// JS's default Number -> String conversion already produces the shortest
// string that round-trips back to the same value, which is exactly what "R" asks for.
function formatRoundTripSpec(value: number): string {
  return (isNegative(value) ? '-' : '') + String(Math.abs(value))
}

// The decimal-places count to use for clamping/rounding the underlying
// value before display (via applyPrecision), as distinct from spec.precision
// itself — for D and X that field means "minimum padding width", not
// decimal places, so those always round to a whole number instead.
export function resolveFormatPrecision(spec: NumericFormatSpec): number {
  switch (spec.specifier) {
    case 'D':
    case 'X':
      return 0
    case 'E':
      return spec.precision ?? 6
    case 'G':
      return spec.precision ?? 6
    case 'R':
      return 15
    case 'P':
      // Percent displays value*100, so its raw (pre-multiplication) value
      // needs 2 more decimal places than the display precision to round to
      // the same displayed digit — e.g. "p0" (0 display decimals) still
      // needs the raw value rounded to 2 decimal places, since 0.005 rounds
      // to a whole display percent (0.5%) but would vanish entirely at 0
      // raw decimal places.
      return (spec.precision ?? 2) + 2
    default:
      return spec.precision ?? 2
  }
}

export function formatWithSpec(value: number, spec: NumericFormatSpec): string {
  switch (spec.specifier) {
    case 'C':
      return formatCurrencySpec(value, spec.precision ?? 2)
    case 'D':
      return formatDecimalSpec(value, spec.precision)
    case 'E':
      return formatExponentialSpec(value, spec.precision ?? 6, spec.uppercase)
    case 'F':
      return formatFixedSpec(value, spec.precision ?? 2)
    case 'G':
      return formatGeneralSpec(value, spec.precision, spec.uppercase)
    case 'N':
      return formatNumberSpec(value, spec.precision ?? 2)
    case 'P':
      return formatPercentSpec(value, spec.precision ?? 2)
    case 'R':
      return formatRoundTripSpec(value)
    case 'X':
      return formatHexSpec(value, spec.precision, spec.uppercase)
  }
}

// Characters formatWithSpec is allowed to have added for each specifier —
// anything else left after unwrapping parens/removing these is genuine
// invalid input (stray letters etc.), not decoration.
const DECORATION_CHARS: Partial<Record<NumericFormatSpecifier, RegExp>> = {
  C: /[$,\s]/g,
  N: /[,\s]/g,
  P: /[%,\s]/g,
}

const VALID_CONTENT_PATTERN = /^-?\d*\.?\d*$/

// Strips a formatted display string back down to a plain numeric string
// (digits, one leading "-", one ".") so it can be re-parsed — e.g.
// "($1,234.56)" -> "-1234.56", "42.5 %" -> "42.5". Returns undefined if
// anything other than digits/sign/decimal point and this specifier's own
// decoration characters remain (i.e. genuinely invalid input like "abc").
function stripFormatDecorations(raw: string, specifier: NumericFormatSpecifier): string | undefined {
  const trimmed = raw.trim()
  if (specifier === 'X') {
    const hexOnly = trimmed.replace(/\s/g, '')
    return /^-?[0-9a-fA-F]*$/.test(hexOnly) ? hexOnly : undefined
  }
  const parenNegative = /^\((.*)\)$/.exec(trimmed)
  const unwrapped = parenNegative ? `-${parenNegative[1]}` : trimmed
  const decorationPattern = DECORATION_CHARS[specifier]
  const stripped = decorationPattern ? unwrapped.replace(decorationPattern, '') : unwrapped
  return VALID_CONTENT_PATTERN.test(stripped) ? stripped : undefined
}

// Inverse of formatWithSpec: turns whatever the user has typed/pasted into a
// formatted field back into the raw number it represents (e.g. a percent
// field's displayed "42.5" means the underlying value is 0.425). `null`
// means "empty, a valid cleared state"; `undefined` means unparseable —
// callers use this the same way as parseDraft.
export function parseFormattedInput(raw: string, spec: NumericFormatSpec): number | null | undefined {
  const stripped = stripFormatDecorations(raw, spec.specifier)
  if (stripped === undefined) return undefined
  if (stripped === '' || stripped === '-') return null
  const parsed = spec.specifier === 'X' ? parseInt(stripped, 16) : Number(stripped)
  if (!Number.isFinite(parsed)) return undefined
  return spec.specifier === 'P' ? parsed / 100 : parsed
}

// Live re-formatting while typing needs to know which characters in a
// formatted string are "content" (digits/decimal point, plus the sign —
// except when the sign is instead represented by parentheses wrapping the
// whole value, e.g. negative currency, in which case there's no literal
// "-" character in the output to track and it's excluded from the count
// too) versus pure decoration (currency symbol, group separators, "%",
// the parens themselves), so the cursor can be repositioned after the
// decorations shift around.
function countContentCharsBefore(text: string, index: number, includeSign: boolean): number {
  const pattern = includeSign ? /[0-9.-]/ : /[0-9.]/
  let count = 0
  for (let i = 0; i < index && i < text.length; i++) {
    if (pattern.test(text[i])) count++
  }
  return count
}

function indexAfterContentChars(text: string, contentCount: number, includeSign: boolean): number {
  if (contentCount <= 0) return 0
  const pattern = includeSign ? /[0-9.-]/ : /[0-9.]/
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (pattern.test(text[i])) {
      seen++
      if (seen === contentCount) return i + 1
    }
  }
  return text.length
}

// Re-formats a draft live as the user types (not just on commit), preserving
// cursor position relative to the surrounding digits rather than snapping to
// the end. Returns the same shape as parseFormattedInput's success case plus
// the text/cursor to display, or undefined if the raw content isn't
// (yet) a parseable number — callers should leave the draft untouched
// in that case rather than reject the keystroke outright.
export function reformatDraftLive(
  raw: string,
  cursorIndex: number,
  spec: NumericFormatSpec,
): { text: string; cursorIndex: number } | undefined {
  const stripped = stripFormatDecorations(raw, spec.specifier)
  if (stripped === undefined) return undefined
  if (stripped === '' || stripped === '-') return { text: stripped, cursorIndex: stripped.length }
  const parsed = spec.specifier === 'X' ? parseInt(stripped, 16) : Number(stripped)
  if (!Number.isFinite(parsed)) return undefined
  // Formatting a partial decimal draft (e.g. "12.") would drop the trailing
  // dot entirely (toFixed doesn't preserve in-progress decimal entry), so
  // leave those as the bare digit string until they resolve to a full number.
  if (stripped.endsWith('.')) return { text: stripped, cursorIndex: stripped.length }
  const value = spec.specifier === 'P' ? parsed / 100 : parsed
  const formatted = formatWithSpec(value, spec)
  // Currency wraps negatives in parentheses (see formatCurrencySpec) instead
  // of a leading "-", so there's no sign character in `formatted` to line up
  // with the "-" the user typed in `raw` — exclude the sign from both counts
  // in that case so the digit/dot positions still match up 1:1.
  const usesParens = spec.specifier === 'C' && isNegative(value)
  const contentBeforeCursor = countContentCharsBefore(raw, cursorIndex, !usesParens)
  return { text: formatted, cursorIndex: indexAfterContentChars(formatted, contentBeforeCursor, !usesParens) }
}

// Shared by toggleFormattedSign/forcePositiveFormatted below: re-parses the
// whole draft, applies `nextValue` to its underlying number, and reformats
// from scratch, remapping the cursor by digit/dot position only — sign
// decorations (a leading "-", currency parens, ...) never change how many
// digits precede the cursor, only how those digits get wrapped, so the
// sign itself is deliberately excluded from both counts (same reasoning as
// the `usesParens` branch in reformatDraftLive above).
function reformatSignedDraft(
  draft: string,
  cursorIndex: number,
  spec: NumericFormatSpec,
  nextValue: (parsed: number) => number,
): { value: number; text: string; cursorIndex: number } | undefined {
  const parsed = parseFormattedInput(draft, spec)
  if (typeof parsed !== 'number') return undefined
  const value = nextValue(parsed)
  const text = formatWithSpec(value, spec)
  const contentBeforeCursor = countContentCharsBefore(draft, cursorIndex, false)
  return { value, text, cursorIndex: indexAfterContentChars(text, contentBeforeCursor, false) }
}

// Format-aware equivalent of toggleSign() for a plain draft — the -/+ key
// handling under a format can't just flip a leading "-" character the way
// the plain-draft path does, since decorations (parens for negative
// currency, "$", "%", ...) restructure around the sign in a way a single-
// character edit can't express regardless of where the cursor happens to
// sit; this re-parses and reformats the whole value instead, so it works
// from anywhere in the draft, not just right before the first digit.
export function toggleFormattedSign(
  draft: string,
  cursorIndex: number,
  spec: NumericFormatSpec,
): { value: number; text: string; cursorIndex: number } | undefined {
  return reformatSignedDraft(draft, cursorIndex, spec, (parsed) => -parsed)
}

// Format-aware equivalent of stripSign() — forces the value positive
// rather than toggling it, matching how the "+" key only ever removes an
// existing negative and never adds one.
export function forcePositiveFormatted(
  draft: string,
  cursorIndex: number,
  spec: NumericFormatSpec,
): { value: number; text: string; cursorIndex: number } | undefined {
  return reformatSignedDraft(draft, cursorIndex, spec, (parsed) => Math.abs(parsed))
}
