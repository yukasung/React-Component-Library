import { describe, expect, it } from 'vitest'
import {
  clampDateTime,
  isSameDateTime,
  isTimeSegment,
  isTimeToken,
  parseDateTimeDraft,
  startOfMinute,
  tokenizeDateTimeMask,
} from './dateTime'

describe('tokenizeDateTimeMask', () => {
  it('describes date and time groups from one format', () => {
    expect(tokenizeDateTimeMask('Y-m-d H:i')).toEqual([
      { type: 'token', token: 'Y', width: 4, fill: 'end' },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '-' },
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
      { type: 'literal', text: ' ' },
      { type: 'token', token: 'H', width: 2, min: 0, max: 23 },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i', width: 2, min: 0, max: 59 },
    ])
  })

  it('gives the AM/PM designator its own segment kind', () => {
    const segments = tokenizeDateTimeMask('d/m/Y h:i K')!
    expect(segments[segments.length - 1]).toEqual({ type: 'ampm' })
  })

  it('refuses a format the groups cannot describe', () => {
    // Month name — spelled out, so there is no fixed-width shape to type into.
    expect(tokenizeDateTimeMask('F j, Y H:i')).toBeUndefined()
    // Seconds — this library works at whole-minute granularity throughout.
    expect(tokenizeDateTimeMask('Y-m-d H:i:S')).toBeUndefined()
  })

  it('refuses a 24-hour hour paired with a designator', () => {
    expect(tokenizeDateTimeMask('Y-m-d H:i K')).toBeUndefined()
  })

  it('treats an escaped token letter as a literal separator', () => {
    // `\\H` is the letter H itself, not the hour token — the escape is the
    // shared tokenizer's, so it behaves the same here as in either half.
    expect(tokenizeDateTimeMask('d/m/Y \\a\\t H:i')).toEqual([
      { type: 'token', token: 'd', width: 2, min: 1, max: 31 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'm', width: 2, min: 1, max: 12 },
      { type: 'literal', text: '/' },
      { type: 'token', token: 'Y', width: 4, fill: 'end' },
      { type: 'literal', text: ' at ' },
      { type: 'token', token: 'H', width: 2, min: 0, max: 23 },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i', width: 2, min: 0, max: 59 },
    ])
  })

  it('describes a format that names only one half', () => {
    expect(tokenizeDateTimeMask('Y-m-d')?.length).toBe(5)
    expect(tokenizeDateTimeMask('H:i')?.length).toBe(3)
  })
})

describe('isTimeToken', () => {
  it('separates the two vocabularies', () => {
    expect(['H', 'h', 'G', 'i', 'K'].every(isTimeToken)).toBe(true)
    expect(['Y', 'y', 'm', 'n', 'd', 'j'].some(isTimeToken)).toBe(false)
  })
})

describe('isTimeSegment', () => {
  it('splits the groups by which half they belong to', () => {
    const segments = tokenizeDateTimeMask('d/m/Y h:i K')!
    expect(segments.filter((segment) => segment.type !== 'literal').map(isTimeSegment)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ])
  })
})

describe('parseDateTimeDraft', () => {
  it('reads both halves out of a finished draft', () => {
    expect(parseDateTimeDraft('2026-08-18 09:30', 'Y-m-d H:i')).toEqual(new Date(2026, 7, 18, 9, 30))
  })

  it('keeps the afternoon a 12-hour format would otherwise lose', () => {
    // flatpickr's own parser drops the designator entirely (empty tokenRegex
    // for K), which is why this module parses for itself.
    expect(parseDateTimeDraft('18/08/2026 02:30 PM', 'd/m/Y h:i K')).toEqual(new Date(2026, 7, 18, 14, 30))
    expect(parseDateTimeDraft('18/08/2026 12:00 AM', 'd/m/Y h:i K')).toEqual(new Date(2026, 7, 18, 0, 0))
    expect(parseDateTimeDraft('18/08/2026 12:00 PM', 'd/m/Y h:i K')).toEqual(new Date(2026, 7, 18, 12, 0))
  })

  it('accepts the tolerances a typed draft needs', () => {
    // Single digits where the format pads, and a bare designator letter.
    expect(parseDateTimeDraft('2026-8-1 9:05', 'Y-m-d H:i')).toEqual(new Date(2026, 7, 1, 9, 5))
    expect(parseDateTimeDraft('1/8/2026 2:30 p', 'j/n/Y h:i K')).toEqual(new Date(2026, 7, 1, 14, 30))
  })

  it('reports an empty draft as a valid cleared value, and junk as unparseable', () => {
    expect(parseDateTimeDraft('   ', 'Y-m-d H:i')).toBeNull()
    expect(parseDateTimeDraft('not a date', 'Y-m-d H:i')).toBeUndefined()
    expect(parseDateTimeDraft('2026-08-18', 'Y-m-d H:i')).toBeUndefined()
  })

  it('rejects out-of-range parts rather than wrapping them', () => {
    expect(parseDateTimeDraft('2026-13-01 09:30', 'Y-m-d H:i')).toBeUndefined()
    expect(parseDateTimeDraft('2026-08-18 25:00', 'Y-m-d H:i')).toBeUndefined()
    expect(parseDateTimeDraft('2026-08-18 09:60', 'Y-m-d H:i')).toBeUndefined()
  })

  it('rejects a day its month does not have', () => {
    expect(parseDateTimeDraft('2026-02-31 09:30', 'Y-m-d H:i')).toBeUndefined()
    expect(parseDateTimeDraft('2024-02-29 09:30', 'Y-m-d H:i')).toEqual(new Date(2024, 1, 29, 9, 30))
  })

  it('shifts a Buddhist Era year back to Gregorian', () => {
    expect(parseDateTimeDraft('2569-08-18 09:30', 'Y-m-d H:i', 543)).toEqual(new Date(2026, 7, 18, 9, 30))
  })

  it('reads a 2-digit year as the 2000s', () => {
    expect(parseDateTimeDraft('18/08/26 09:30', 'd/m/y H:i')).toEqual(new Date(2026, 7, 18, 9, 30))
  })

  it('reads a 12-hour format with no designator as the morning', () => {
    // No designator means the format cannot express the afternoon at all, so
    // 12 is midnight and 1-11 are the morning hours.
    expect(parseDateTimeDraft('2026-08-18 12:30', 'Y-m-d h:i')).toEqual(new Date(2026, 7, 18, 0, 30))
    expect(parseDateTimeDraft('2026-08-18 11:30', 'Y-m-d h:i')).toEqual(new Date(2026, 7, 18, 11, 30))
  })

  it('parses the same format twice through its compiled pattern', () => {
    // The pattern is cached per format string; a second parse must not see a
    // stale match from the first.
    expect(parseDateTimeDraft('2026-08-18 09:30', 'Y-m-d H:i')).toEqual(new Date(2026, 7, 18, 9, 30))
    expect(parseDateTimeDraft('2027-01-02 23:59', 'Y-m-d H:i')).toEqual(new Date(2027, 0, 2, 23, 59))
    expect(parseDateTimeDraft('nonsense', 'Y-m-d H:i')).toBeUndefined()
  })

  it('rejects a year the Date constructor would reinterpret', () => {
    // `new Date(26, ...)` means 1926, so a 4-digit year typed as "0026" is
    // refused rather than silently committed as a different century.
    expect(parseDateTimeDraft('0026-08-18 09:30', 'Y-m-d H:i')).toBeUndefined()
  })

  it('takes today for a format that names no date part', () => {
    const parsed = parseDateTimeDraft('09:30', 'H:i')
    const today = new Date()
    expect(parsed).toEqual(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30))
  })
})

describe('startOfMinute / isSameDateTime / clampDateTime', () => {
  it('drops seconds and milliseconds', () => {
    expect(startOfMinute(new Date(2026, 7, 18, 9, 30, 45, 250))).toEqual(new Date(2026, 7, 18, 9, 30))
  })

  it('compares both halves, unlike isSameDay or isSameTime alone', () => {
    expect(isSameDateTime(new Date(2026, 7, 18, 9, 30, 12), new Date(2026, 7, 18, 9, 30, 59))).toBe(true)
    // Same time of day, different day.
    expect(isSameDateTime(new Date(2026, 7, 18, 9, 30), new Date(2026, 7, 19, 9, 30))).toBe(false)
    // Same day, different time.
    expect(isSameDateTime(new Date(2026, 7, 18, 9, 30), new Date(2026, 7, 18, 9, 31))).toBe(false)
  })

  it('leaves a value alone when neither bound is given, but still drops seconds', () => {
    expect(clampDateTime(new Date(2026, 7, 18, 9, 30, 45))).toEqual(new Date(2026, 7, 18, 9, 30))
    expect(clampDateTime(new Date(2026, 7, 18, 9, 30), null, null)).toEqual(new Date(2026, 7, 18, 9, 30))
  })

  it('clamps across days, not only within one', () => {
    const min = new Date(2026, 7, 18, 9, 0)
    const max = new Date(2026, 7, 20, 18, 0)
    expect(clampDateTime(new Date(2026, 7, 17, 23, 0), min, max)).toEqual(min)
    expect(clampDateTime(new Date(2026, 7, 21, 1, 0), min, max)).toEqual(max)
  })

  it('clamps on the whole timestamp, not just the day', () => {
    const min = new Date(2026, 7, 18, 9, 0)
    const max = new Date(2026, 7, 18, 18, 0)
    expect(clampDateTime(new Date(2026, 7, 18, 8, 30), min, max)).toEqual(min)
    expect(clampDateTime(new Date(2026, 7, 18, 18, 30), min, max)).toEqual(max)
    expect(clampDateTime(new Date(2026, 7, 18, 12, 0), min, max)).toEqual(new Date(2026, 7, 18, 12, 0))
  })
})
