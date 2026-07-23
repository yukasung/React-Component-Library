import { describe, expect, it } from 'vitest'
import flatpickr from 'flatpickr'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import {
  addDays,
  clampDate,
  formatDateValue,
  formatDateWithYearOffset,
  isSameDay,
  isValidDate,
  parseDateDraft,
  startOfDay,
  tokenizeDateMask,
  unshiftYearInDraft,
} from './date'

// formatDateWithYearOffset takes an injected formatter (kept
// flatpickr-instance/locale-agnostic in date.ts itself) -- this is the
// plain-English-locale variant used by most tests below.
function formatWithFlatpickr(date: Date, format: string, locale?: flatpickr.CustomLocale): string {
  return locale
    ? (flatpickr.formatDate as (date: Date, format: string, locale: flatpickr.CustomLocale) => string)(
        date,
        format,
        locale,
      )
    : flatpickr.formatDate(date, format)
}

describe('startOfDay', () => {
  it('normalizes a date to local midnight', () => {
    const result = startOfDay(new Date(2026, 6, 22, 15, 30, 45))
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(6)
    expect(result.getDate()).toBe(22)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

describe('isValidDate', () => {
  it('accepts a real date', () => {
    expect(isValidDate(new Date(2026, 6, 22))).toBe(true)
  })

  it('rejects an invalid date', () => {
    expect(isValidDate(new Date('not a date'))).toBe(false)
  })
})

describe('addDays', () => {
  it('adds days within the same month', () => {
    const result = addDays(new Date(2026, 6, 22), 3)
    expect(result.getDate()).toBe(25)
    expect(result.getMonth()).toBe(6)
  })

  it('subtracts days with a negative amount', () => {
    const result = addDays(new Date(2026, 6, 22), -3)
    expect(result.getDate()).toBe(19)
  })

  it('rolls over into the next month', () => {
    const result = addDays(new Date(2026, 6, 31), 1)
    expect(result.getMonth()).toBe(7)
    expect(result.getDate()).toBe(1)
  })

  it('does not mutate the input date', () => {
    const original = new Date(2026, 6, 22)
    addDays(original, 5)
    expect(original.getDate()).toBe(22)
  })
})

describe('isSameDay', () => {
  it('treats two Dates on the same day but different times as equal', () => {
    expect(isSameDay(new Date(2026, 6, 22, 1, 0), new Date(2026, 6, 22, 23, 59))).toBe(true)
  })

  it('treats two Dates on different days as unequal', () => {
    expect(isSameDay(new Date(2026, 6, 22), new Date(2026, 6, 23))).toBe(false)
  })
})

describe('clampDate', () => {
  const min = new Date(2026, 6, 1)
  const max = new Date(2026, 6, 31)

  it('leaves a value within range untouched', () => {
    const value = new Date(2026, 6, 15)
    expect(clampDate(value, min, max)).toBe(value)
  })

  it('raises a value below min up to min', () => {
    expect(clampDate(new Date(2026, 5, 20), min, max)).toBe(min)
  })

  it('lowers a value above max down to max', () => {
    expect(clampDate(new Date(2026, 7, 5), min, max)).toBe(max)
  })

  it('only applies the bounds that are provided', () => {
    const farPast = new Date(2000, 0, 1)
    const farFuture = new Date(2100, 0, 1)
    expect(clampDate(farPast, null, max)).toBe(farPast)
    expect(clampDate(farFuture, min, null)).toBe(farFuture)
  })
})

describe('parseDateDraft', () => {
  it('parses a valid date string in the given format', () => {
    const result = parseDateDraft('2026-07-22', 'Y-m-d')
    expect(result).toEqual(startOfDay(new Date(2026, 6, 22)))
  })

  it('treats an empty (or whitespace-only) string as null', () => {
    expect(parseDateDraft('', 'Y-m-d')).toBeNull()
    expect(parseDateDraft('   ', 'Y-m-d')).toBeNull()
  })

  it('returns undefined for a genuinely unparseable string', () => {
    expect(parseDateDraft('not a date', 'Y-m-d')).toBeUndefined()
  })

  it('parses a different numeric format token string', () => {
    const result = parseDateDraft('4/7/2026', 'j/n/Y')
    expect(result).toEqual(startOfDay(new Date(2026, 6, 4)))
  })

  // flatpickr's own parser has an empty tokenRegex entry for alphabetic
  // month/weekday-name tokens (F/M/D/l), so it can't actually parse them
  // back out of typed text — confirmed against flatpickr's source, not
  // documented behavior. This test pins that limitation down so a future
  // flatpickr upgrade that changes it doesn't go unnoticed. See the
  // caveat on parseDateDraft's own doc comment.
  it('cannot round-trip a typed month name through an "F" format token (flatpickr limitation)', () => {
    const result = parseDateDraft('July 4, 2026', 'F j, Y')
    expect(result).not.toEqual(startOfDay(new Date(2026, 6, 4)))
  })
})

describe('formatDateValue', () => {
  it('formats null as an empty string', () => {
    expect(formatDateValue(null, 'Y-m-d')).toBe('')
  })

  it('formats a date using the given format tokens', () => {
    expect(formatDateValue(new Date(2026, 6, 22), 'Y-m-d')).toBe('2026-07-22')
  })

  it('formats using a different token string', () => {
    expect(formatDateValue(new Date(2026, 6, 4), 'F j, Y')).toBe('July 4, 2026')
  })

  it('shifts the year when yearOffset is given', () => {
    expect(formatDateValue(new Date(2026, 6, 22), 'Y-m-d', 543)).toBe('2569-07-22')
  })

  it('leaves the value unchanged when yearOffset is 0 (default)', () => {
    expect(formatDateValue(new Date(2026, 6, 22), 'Y-m-d', 0)).toBe('2026-07-22')
  })

  it('renders Thai month names when a locale is given', () => {
    expect(formatDateValue(new Date(2026, 6, 22), 'F j, Y', 543, Thai)).toBe('กรกฎาคม 22, 2569')
  })

  it('never corrupts the day on a leap-year date when shifting the year', () => {
    expect(formatDateValue(new Date(2024, 1, 29), 'Y-m-d', 543)).toBe('2567-02-29')
  })
})

describe('formatDateWithYearOffset', () => {
  it('shifts the year for a pure numeric format', () => {
    expect(formatDateWithYearOffset(new Date(2026, 6, 22), 'Y-m-d', 543, formatWithFlatpickr)).toBe('2569-07-22')
  })

  it('shifts the year for an alphabetic-token format without breaking the month name', () => {
    expect(
      formatDateWithYearOffset(new Date(2026, 6, 22), 'F j, Y', 543, (date, format) =>
        formatWithFlatpickr(date, format, Thai),
      ),
    ).toBe('กรกฎาคม 22, 2569')
  })

  it('does not corrupt the day on a leap-year date (Feb 29)', () => {
    // 2024 is a leap year; 2024 + 543 = 2567 is not. Since the real, unmodified
    // date is what's always formatted (never a shifted Date object), the real
    // Feb 29 renders correctly regardless of the target era's own leap-year rules.
    expect(formatDateWithYearOffset(new Date(2024, 1, 29), 'Y-m-d', 543, formatWithFlatpickr)).toBe('2567-02-29')
  })

  it('handles the year token in a middle position', () => {
    expect(formatDateWithYearOffset(new Date(2026, 6, 22), 'd/Y/m', 543, formatWithFlatpickr)).toBe('22/2569/07')
  })

  it('shifts a 2-digit y token', () => {
    expect(formatDateWithYearOffset(new Date(2026, 6, 22), 'd/m/y', 543, formatWithFlatpickr)).toBe('22/07/69')
  })

  it('returns undefined when the format has no year token', () => {
    expect(formatDateWithYearOffset(new Date(2026, 6, 22), 'd/m', 543, formatWithFlatpickr)).toBeUndefined()
  })
})

describe('unshiftYearInDraft', () => {
  it('shifts a typed Y (4-digit) year back down', () => {
    expect(unshiftYearInDraft('2569-07-22', 'Y-m-d', 543)).toBe('2026-07-22')
  })

  it('disambiguates the day/month=year digit collision case for y (d/m/y)', () => {
    // Day "26" and the 2-digit year suffix "26" are textually identical --
    // only the year group (the last one) should shift.
    expect(unshiftYearInDraft('26/01/26', 'd/m/y', 543)).toBe('26/01/83')
  })

  it('disambiguates adjacent variable-width tokens with no separator ("nY")', () => {
    // Unpadded month "1" directly followed by 4-digit year "2569", no
    // separator -- only resolvable by matching the whole token sequence.
    expect(unshiftYearInDraft('12569', 'nY', 543)).toBe('12026')
  })

  it('returns undefined for a non-numeric (alphabetic-token) format', () => {
    expect(unshiftYearInDraft('กรกฎาคม 22, 2569', 'F j, Y', 543)).toBeUndefined()
  })

  it('returns undefined when the input does not match the format at all', () => {
    expect(unshiftYearInDraft('not a date', 'Y-m-d', 543)).toBeUndefined()
  })
})

describe('parseDateDraft with yearOffset', () => {
  it('shifts a typed Buddhist year down to the correct Gregorian date', () => {
    const result = parseDateDraft('2569-07-22', 'Y-m-d', 543)
    expect(result).toEqual(startOfDay(new Date(2026, 6, 22)))
  })

  it('returns undefined for malformed input when the format has a year token', () => {
    expect(parseDateDraft('not a date', 'Y-m-d', 543)).toBeUndefined()
  })

  it('parses normally (offset irrelevant) when the format has no year token', () => {
    const result = parseDateDraft('07-22', 'm-d', 543)
    expect(result?.getMonth()).toBe(6)
    expect(result?.getDate()).toBe(22)
  })

  it('treats empty input as null regardless of yearOffset', () => {
    expect(parseDateDraft('', 'Y-m-d', 543)).toBeNull()
  })
})

describe('tokenizeDateMask', () => {
  it('returns undefined for a format with an alphabetic name token', () => {
    expect(tokenizeDateMask('F j, Y')).toBeUndefined()
    expect(tokenizeDateMask('d M Y')).toBeUndefined()
    expect(tokenizeDateMask('l, d/m/Y')).toBeUndefined()
  })

  it('produces the exact segment shape for "Y-m-d"', () => {
    expect(tokenizeDateMask('Y-m-d')).toEqual([
      { type: 'token', token: 'Y', width: 4 },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
    ])
  })

  it('produces the exact segment shape for "d/m/Y"', () => {
    expect(tokenizeDateMask('d/m/Y')).toEqual([
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'Y', width: 4 },
    ])
  })

  it('produces the exact segment shape for "y-m-d" (2-digit year)', () => {
    expect(tokenizeDateMask('y-m-d')).toEqual([
      { type: 'token', token: 'y', width: 2 },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
    ])
  })

  it('gives n/j the same width and range as m/d', () => {
    expect(tokenizeDateMask('n/j/Y')).toEqual([
      { type: 'token', token: 'n', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'j', width: 2, min: 1, max: 31 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'Y', width: 4 },
    ])
  })

  it('merges consecutive literal characters into one segment', () => {
    expect(tokenizeDateMask('Y - m - d')).toEqual([
      { type: 'token', token: 'Y', width: 4 },
      { type: 'literal', text: ' - ' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: ' - ' },
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
    ])
  })

  it('treats an escaped token character as a literal', () => {
    expect(tokenizeDateMask('Y\\Y')).toEqual([
      { type: 'token', token: 'Y', width: 4 },
      { type: 'literal', text: 'Y' },
    ])
  })
})
