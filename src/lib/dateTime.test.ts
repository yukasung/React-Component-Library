import { describe, expect, it } from 'vitest'
import {
  clampDateTime,
  isSameDateTime,
  isTimeSegment,
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

  it('clamps on the whole timestamp, not just the day', () => {
    const min = new Date(2026, 7, 18, 9, 0)
    const max = new Date(2026, 7, 18, 18, 0)
    expect(clampDateTime(new Date(2026, 7, 18, 8, 30), min, max)).toEqual(min)
    expect(clampDateTime(new Date(2026, 7, 18, 18, 30), min, max)).toEqual(max)
    expect(clampDateTime(new Date(2026, 7, 18, 12, 0), min, max)).toEqual(new Date(2026, 7, 18, 12, 0))
  })
})
