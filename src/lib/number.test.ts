import { describe, expect, it } from 'vitest'
import {
  applyPrecision,
  clamp,
  formatValue,
  formatWithSpec,
  isValidDraft,
  parseDraft,
  parseFormattedInput,
  parseNumericFormat,
  reformatDraftLive,
  resolvePrecision,
  roundToPrecision,
  stripSign,
  toggleSign,
  truncateToPrecision,
  zeroDraftWithPrecision,
} from './number'

describe('parseDraft', () => {
  it('parses a valid integer string', () => {
    expect(parseDraft('42')).toBe(42)
  })

  it('parses a valid decimal string', () => {
    expect(parseDraft('3.14')).toBe(3.14)
  })

  it('treats an empty (or whitespace-only) string as null', () => {
    expect(parseDraft('')).toBeNull()
    expect(parseDraft('   ')).toBeNull()
  })

  it('returns undefined for unparseable strings', () => {
    expect(parseDraft('-')).toBeUndefined()
    expect(parseDraft('1.2.3')).toBeUndefined()
    expect(parseDraft('abc')).toBeUndefined()
  })
})

describe('formatValue', () => {
  it('formats null as an empty string', () => {
    expect(formatValue(null)).toBe('')
  })

  it('formats a number as its string representation', () => {
    expect(formatValue(42)).toBe('42')
    expect(formatValue(3.14)).toBe('3.14')
  })

  it('formats with a fixed number of decimal places when precision is given', () => {
    expect(formatValue(3.14159, 2)).toBe('3.14')
    expect(formatValue(3, 2)).toBe('3.00')
    expect(formatValue(null, 2)).toBe('')
  })
})

describe('clamp', () => {
  it('leaves a value within range untouched', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('raises a value below min up to min', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('lowers a value above max down to max', () => {
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('only applies the bounds that are provided', () => {
    expect(clamp(-100, undefined, 10)).toBe(-100)
    expect(clamp(100, 0, undefined)).toBe(100)
    expect(clamp(100)).toBe(100)
  })
})

describe('resolvePrecision', () => {
  it('infers decimal places from a fractional step', () => {
    expect(resolvePrecision(0.1)).toBe(1)
    expect(resolvePrecision(0.25)).toBe(2)
  })

  it('returns undefined for an integer step or no step', () => {
    expect(resolvePrecision(1)).toBeUndefined()
    expect(resolvePrecision(undefined)).toBeUndefined()
  })
})

describe('roundToPrecision', () => {
  it('fixes floating-point artifacts from step arithmetic', () => {
    expect(roundToPrecision(0.1 + 0.2, resolvePrecision(0.1))).toBe(0.3)
  })

  it('passes the value through unchanged when precision is undefined', () => {
    expect(roundToPrecision(3.14159, undefined)).toBe(3.14159)
  })
})

describe('truncateToPrecision', () => {
  it('cuts off excess decimals instead of rounding them', () => {
    expect(truncateToPrecision(2.999, 1)).toBe(2.9)
    expect(truncateToPrecision(2.999, 2)).toBe(2.99)
  })

  it('passes the value through unchanged when precision is undefined', () => {
    expect(truncateToPrecision(3.14159, undefined)).toBe(3.14159)
  })

  it('truncates negative numbers toward zero, not away from it', () => {
    expect(truncateToPrecision(-2.999, 1)).toBe(-2.9)
  })
})

describe('applyPrecision', () => {
  it('rounds by default (truncate not passed)', () => {
    expect(applyPrecision(2.999, 1)).toBe(3)
  })

  it('rounds when truncate is explicitly false', () => {
    expect(applyPrecision(2.999, 1, false)).toBe(3)
  })

  it('truncates when truncate is true', () => {
    expect(applyPrecision(2.999, 1, true)).toBe(2.9)
  })
})

describe('isValidDraft', () => {
  it('accepts empty and partial-number intermediate strings', () => {
    expect(isValidDraft('')).toBe(true)
    expect(isValidDraft('-')).toBe(true)
    expect(isValidDraft('.')).toBe(true)
    expect(isValidDraft('5.')).toBe(true)
    expect(isValidDraft('-.5')).toBe(true)
  })

  it('accepts complete integers and decimals, positive and negative', () => {
    expect(isValidDraft('5')).toBe(true)
    expect(isValidDraft('-5')).toBe(true)
    expect(isValidDraft('5.5')).toBe(true)
    expect(isValidDraft('-5.5')).toBe(true)
  })

  it('tolerates surrounding whitespace (e.g. from paste)', () => {
    expect(isValidDraft(' 42 ')).toBe(true)
  })

  it('rejects letters', () => {
    expect(isValidDraft('abc')).toBe(false)
    expect(isValidDraft('1a')).toBe(false)
  })

  it('rejects scientific notation', () => {
    expect(isValidDraft('1e10')).toBe(false)
  })

  it('rejects a minus sign anywhere but the start', () => {
    expect(isValidDraft('1-1')).toBe(false)
    expect(isValidDraft('1-')).toBe(false)
  })

  it('rejects more than one decimal point', () => {
    expect(isValidDraft('1.2.3')).toBe(false)
  })

  it('rejects other punctuation such as commas', () => {
    expect(isValidDraft('1,000')).toBe(false)
  })
})

describe('toggleSign', () => {
  it('adds a leading "-" when absent', () => {
    expect(toggleSign('500')).toBe('-500')
  })

  it('removes a leading "-" when present', () => {
    expect(toggleSign('-500')).toBe('500')
  })

  it('round-trips back to the original', () => {
    expect(toggleSign(toggleSign('42'))).toBe('42')
  })

  it('adds a leading "-" to an empty string', () => {
    expect(toggleSign('')).toBe('-')
  })
})

describe('stripSign', () => {
  it('removes a leading "-" when present', () => {
    expect(stripSign('-500')).toBe('500')
  })

  it('is a no-op when there is no leading "-"', () => {
    expect(stripSign('500')).toBe('500')
  })

  it('is a no-op on an empty string', () => {
    expect(stripSign('')).toBe('')
  })
})

describe('zeroDraftWithPrecision', () => {
  it('produces "0." followed by a zero per decimal place', () => {
    expect(zeroDraftWithPrecision(2)).toBe('0.00')
    expect(zeroDraftWithPrecision(3)).toBe('0.000')
  })

  it('produces "0." with no trailing zeros when precision is 0', () => {
    expect(zeroDraftWithPrecision(0)).toBe('0.')
  })

  it('produces "0." with no trailing zeros when precision is undefined', () => {
    expect(zeroDraftWithPrecision(undefined)).toBe('0.')
  })
})

describe('parseNumericFormat', () => {
  it('parses a letter + precision digits, case-insensitively', () => {
    expect(parseNumericFormat('n2')).toEqual({ specifier: 'N', precision: 2, uppercase: false })
    expect(parseNumericFormat('N2')).toEqual({ specifier: 'N', precision: 2, uppercase: true })
  })

  it('parses a bare letter with no precision as undefined precision', () => {
    expect(parseNumericFormat('C')).toEqual({ specifier: 'C', precision: undefined, uppercase: true })
  })

  it('accepts multi-digit precision', () => {
    expect(parseNumericFormat('F12')).toEqual({ specifier: 'F', precision: 12, uppercase: true })
  })

  it('returns undefined for an unsupported specifier letter', () => {
    expect(parseNumericFormat('Z')).toBeUndefined()
  })

  it('returns undefined for a custom (multi-letter) format string', () => {
    expect(parseNumericFormat('n2x')).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(parseNumericFormat('')).toBeUndefined()
  })
})

describe('formatWithSpec', () => {
  it('formats N with group separators and the given precision', () => {
    expect(formatWithSpec(1234.567, { specifier: 'N', precision: 2, uppercase: false })).toBe('1,234.57')
    expect(formatWithSpec(-1234.567, { specifier: 'N', precision: 2, uppercase: false })).toBe('-1,234.57')
  })

  it('defaults N precision to 2 when omitted', () => {
    expect(formatWithSpec(1234.5, { specifier: 'N', precision: undefined, uppercase: false })).toBe('1,234.50')
  })

  it('formats C with a currency symbol and a leading minus for negatives', () => {
    expect(formatWithSpec(1234.567, { specifier: 'C', precision: 2, uppercase: true })).toBe('$1,234.57')
    expect(formatWithSpec(-1234.567, { specifier: 'C', precision: 2, uppercase: true })).toBe('-$1,234.57')
  })

  it('formats P by multiplying by 100 and appending a percent sign', () => {
    expect(formatWithSpec(0.2468013, { specifier: 'P', precision: 2, uppercase: false })).toBe('24.68%')
    expect(formatWithSpec(-0.39678, { specifier: 'P', precision: 1, uppercase: false })).toBe('-39.7%')
  })

  it('formats F as a plain fixed-point number with no grouping', () => {
    expect(formatWithSpec(1234.567, { specifier: 'F', precision: 2, uppercase: false })).toBe('1234.57')
  })

  it('formats D as zero-padded integer digits, truncating any fraction', () => {
    expect(formatWithSpec(1234, { specifier: 'D', precision: undefined, uppercase: true })).toBe('1234')
    expect(formatWithSpec(-1234, { specifier: 'D', precision: 6, uppercase: true })).toBe('-001234')
  })

  it('formats E in scientific notation with a 3-digit exponent', () => {
    expect(formatWithSpec(12345.6789, { specifier: 'E', precision: 6, uppercase: true })).toBe('1.234568E+004')
    expect(formatWithSpec(-1052.0329112756, { specifier: 'E', precision: 2, uppercase: false })).toBe('-1.05e+003')
  })

  it('formats G as compact fixed-point for in-range magnitudes', () => {
    expect(formatWithSpec(-123.456, { specifier: 'G', precision: undefined, uppercase: true })).toBe('-123.456')
    expect(formatWithSpec(123.4546, { specifier: 'G', precision: 4, uppercase: true })).toBe('123.5')
  })

  it('formats G in scientific notation for very small/large magnitudes', () => {
    expect(formatWithSpec(0.0000023, { specifier: 'G', precision: undefined, uppercase: true })).toBe('2.3E-06')
  })

  it('formats X as hexadecimal, uppercase or lowercase per specifier case', () => {
    expect(formatWithSpec(255, { specifier: 'X', precision: undefined, uppercase: true })).toBe('FF')
    expect(formatWithSpec(255, { specifier: 'X', precision: undefined, uppercase: false })).toBe('ff')
    expect(formatWithSpec(255, { specifier: 'X', precision: 4, uppercase: true })).toBe('00FF')
  })

  it('formats R as the shortest round-trippable representation', () => {
    expect(formatWithSpec(10761.937554, { specifier: 'R', precision: undefined, uppercase: true })).toBe(
      '10761.937554',
    )
  })
})

describe('parseFormattedInput', () => {
  it('strips currency symbol and group separators back to a plain number', () => {
    expect(parseFormattedInput('$1,234.56', { specifier: 'C', precision: 2, uppercase: true })).toBe(1234.56)
  })

  it('reads parenthesized currency as negative', () => {
    expect(parseFormattedInput('($123.46)', { specifier: 'C', precision: 2, uppercase: true })).toBe(-123.46)
  })

  it('divides percent input by 100', () => {
    expect(parseFormattedInput('42.5 %', { specifier: 'P', precision: 1, uppercase: false })).toBe(0.425)
  })

  it('strips group separators for N', () => {
    expect(parseFormattedInput('1,234.57', { specifier: 'N', precision: 2, uppercase: false })).toBe(1234.57)
  })

  it('parses hex digits back to a decimal number for X', () => {
    expect(parseFormattedInput('FF', { specifier: 'X', precision: undefined, uppercase: true })).toBe(255)
  })

  it('treats an empty string as null', () => {
    expect(parseFormattedInput('', { specifier: 'N', precision: 2, uppercase: false })).toBeNull()
  })

  it('returns undefined for unparseable content', () => {
    expect(parseFormattedInput('abc', { specifier: 'N', precision: 2, uppercase: false })).toBeUndefined()
  })
})

describe('reformatDraftLive', () => {
  const n0: Parameters<typeof reformatDraftLive>[2] = { specifier: 'N', precision: 0, uppercase: false }

  it('reformats accumulated digits with group separators as the user types', () => {
    expect(reformatDraftLive('1', 1, n0)).toEqual({ text: '1', cursorIndex: 1 })
    expect(reformatDraftLive('12', 2, n0)).toEqual({ text: '12', cursorIndex: 2 })
    expect(reformatDraftLive('1234', 4, n0)).toEqual({ text: '1,234', cursorIndex: 5 })
  })

  it('keeps the cursor positioned after the same count of digits, not snapped to the end', () => {
    // Cursor after the 3rd digit of "1234" (before the trailing "4") should
    // land after the 3rd digit of "1,234" too (before the trailing "4"),
    // not at the very end of the reformatted string.
    expect(reformatDraftLive('1234', 3, n0)).toEqual({ text: '1,234', cursorIndex: 4 })
  })

  it('leaves an in-progress decimal point alone rather than dropping it', () => {
    const n2: Parameters<typeof reformatDraftLive>[2] = { specifier: 'N', precision: 2, uppercase: false }
    expect(reformatDraftLive('12.', 3, n2)).toEqual({ text: '12.', cursorIndex: 3 })
  })

  it('returns the bare "-" while a negative number is still being typed', () => {
    expect(reformatDraftLive('-', 1, n0)).toEqual({ text: '-', cursorIndex: 1 })
  })

  it('returns undefined for content that is not (yet) a parseable number', () => {
    expect(reformatDraftLive('abc', 3, n0)).toBeUndefined()
  })
})
