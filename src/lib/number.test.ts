import { describe, expect, it } from 'vitest'
import {
  applyPrecision,
  clamp,
  formatValue,
  isValidDraft,
  parseDraft,
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
