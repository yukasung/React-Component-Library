import { describe, expect, it } from 'vitest'
import {
  buildTimeList,
  clampMinutes,
  formatTimeOfDay,
  formatTimeValue,
  isSameTime,
  nearestTimeIndex,
  parseTimeDraft,
  stepThroughTimes,
  timeMaskSegments,
  timeOfDayMinutes,
  tokenizeTimeFormat,
  withTimeOfDay,
} from './time'

describe('tokenizeTimeFormat', () => {
  it('splits tokens from literal separators', () => {
    expect(tokenizeTimeFormat('H:i')).toEqual([
      { type: 'token', token: 'H' },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i' },
    ])
  })

  it('handles the AM/PM designator and multi-character literals', () => {
    expect(tokenizeTimeFormat('h:i K')).toEqual([
      { type: 'token', token: 'h' },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i' },
      { type: 'literal', text: ' ' },
      { type: 'token', token: 'K' },
    ])
  })

  it('treats an escaped token letter as a literal', () => {
    expect(tokenizeTimeFormat('H\\h')).toEqual([
      { type: 'token', token: 'H' },
      { type: 'literal', text: 'h' },
    ])
  })

  it('rejects a format containing an unsupported token', () => {
    // Seconds are out of scope; rejecting lets the component fall back to a
    // format it can actually render rather than displaying a wrong time.
    expect(tokenizeTimeFormat('H:i:S')).toBeUndefined()
    expect(tokenizeTimeFormat('Y-m-d')).toBeUndefined()
  })
})

describe('formatTimeOfDay', () => {
  it('pads a 24-hour time', () => {
    expect(formatTimeOfDay(9 * 60 + 5, 'H:i')).toBe('09:05')
    expect(formatTimeOfDay(23 * 60 + 59, 'H:i')).toBe('23:59')
  })

  it('formats a 12-hour time with a designator', () => {
    expect(formatTimeOfDay(14 * 60 + 30, 'h:i K')).toBe('2:30 PM')
    expect(formatTimeOfDay(9 * 60, 'h:i K')).toBe('9:00 AM')
  })

  it('renders midnight and noon as 12 on the 12-hour clock', () => {
    expect(formatTimeOfDay(0, 'h:i K')).toBe('12:00 AM')
    expect(formatTimeOfDay(12 * 60, 'h:i K')).toBe('12:00 PM')
  })

  it('zero-pads the 12-hour token G but not h', () => {
    expect(formatTimeOfDay(9 * 60, 'G:i')).toBe('09:00')
    expect(formatTimeOfDay(9 * 60, 'h:i')).toBe('9:00')
  })

  it('normalizes an out-of-range minute count into the day', () => {
    expect(formatTimeOfDay(24 * 60, 'H:i')).toBe('00:00')
    expect(formatTimeOfDay(-30, 'H:i')).toBe('23:30')
  })
})

describe('formatTimeValue', () => {
  it('formats the time part of a Date and ignores its date part', () => {
    expect(formatTimeValue(new Date(2026, 6, 22, 8, 5), 'H:i')).toBe('08:05')
  })

  it('renders null as an empty string', () => {
    expect(formatTimeValue(null, 'H:i')).toBe('')
  })
})

describe('parseTimeDraft', () => {
  it('parses a padded and an unpadded 24-hour time alike', () => {
    expect(parseTimeDraft('09:30', 'H:i')).toBe(9 * 60 + 30)
    expect(parseTimeDraft('9:30', 'H:i')).toBe(9 * 60 + 30)
  })

  it('parses a 12-hour time with its designator', () => {
    expect(parseTimeDraft('2:30 PM', 'h:i K')).toBe(14 * 60 + 30)
    expect(parseTimeDraft('2:30 AM', 'h:i K')).toBe(2 * 60 + 30)
  })

  it('accepts a bare A/P designator and any letter case', () => {
    expect(parseTimeDraft('2:30 p', 'h:i K')).toBe(14 * 60 + 30)
    expect(parseTimeDraft('2:30 pm', 'h:i K')).toBe(14 * 60 + 30)
  })

  it('handles the 12 AM / 12 PM special case', () => {
    expect(parseTimeDraft('12:00 AM', 'h:i K')).toBe(0)
    expect(parseTimeDraft('12:00 PM', 'h:i K')).toBe(12 * 60)
  })

  it('round-trips every hour of the day through a 12-hour format', () => {
    for (let hour = 0; hour < 24; hour++) {
      const minutes = hour * 60 + 45
      expect(parseTimeDraft(formatTimeOfDay(minutes, 'h:i K'), 'h:i K')).toBe(minutes)
    }
  })

  it('treats an empty draft as a valid cleared value', () => {
    expect(parseTimeDraft('', 'H:i')).toBeNull()
    expect(parseTimeDraft('   ', 'H:i')).toBeNull()
  })

  it('rejects out-of-range hours and minutes rather than wrapping', () => {
    expect(parseTimeDraft('25:00', 'H:i')).toBeUndefined()
    expect(parseTimeDraft('09:75', 'H:i')).toBeUndefined()
    expect(parseTimeDraft('13:00 PM', 'h:i K')).toBeUndefined()
  })

  it('rejects text that does not match the format', () => {
    expect(parseTimeDraft('09-30', 'H:i')).toBeUndefined()
    expect(parseTimeDraft('half past nine', 'H:i')).toBeUndefined()
    expect(parseTimeDraft('09:30', 'h:i K')).toBeUndefined()
  })

  it('rejects an unsupported format outright', () => {
    expect(parseTimeDraft('09:30:00', 'H:i:S')).toBeUndefined()
  })
})

describe('timeMaskSegments', () => {
  it('maps digit tokens to their width and valid range', () => {
    expect(timeMaskSegments('H:i')).toEqual([
      { type: 'token', token: 'H', width: 2, min: 0, max: 23 },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i', width: 2, min: 0, max: 59 },
    ])
  })

  it('maps the AM/PM token to the masker own segment kind', () => {
    expect(timeMaskSegments('h:i K')).toEqual([
      { type: 'token', token: 'h', width: 2, min: 1, max: 12 },
      { type: 'literal', text: ':' },
      { type: 'token', token: 'i', width: 2, min: 0, max: 59 },
      { type: 'literal', text: ' ' },
      { type: 'ampm' },
    ])
  })

  it('returns undefined for an unsupported format', () => {
    expect(timeMaskSegments('H:i:S')).toBeUndefined()
  })
})

describe('timeOfDayMinutes / withTimeOfDay', () => {
  it('reads the time of day at minute granularity', () => {
    expect(timeOfDayMinutes(new Date(2026, 6, 22, 14, 30, 45, 500))).toBe(14 * 60 + 30)
  })

  it('keeps the date part and drops sub-minute precision', () => {
    const base = new Date(2026, 6, 22, 23, 59, 45, 500)
    expect(withTimeOfDay(base, 9 * 60 + 30)).toEqual(new Date(2026, 6, 22, 9, 30, 0, 0))
  })

  it('compares only the time part', () => {
    expect(isSameTime(new Date(2026, 6, 22, 9, 30), new Date(2020, 0, 1, 9, 30))).toBe(true)
    expect(isSameTime(new Date(2026, 6, 22, 9, 30), new Date(2026, 6, 22, 9, 31))).toBe(false)
  })
})

describe('clampMinutes', () => {
  it('clamps to each bound and leaves in-range values alone', () => {
    const nine = 9 * 60
    const five = 17 * 60
    expect(clampMinutes(8 * 60, nine, five)).toBe(nine)
    expect(clampMinutes(18 * 60, nine, five)).toBe(five)
    expect(clampMinutes(12 * 60, nine, five)).toBe(12 * 60)
  })

  it('ignores unset bounds', () => {
    expect(clampMinutes(3 * 60, null, undefined)).toBe(3 * 60)
  })
})

describe('buildTimeList', () => {
  it('lists every step from min to max inclusive', () => {
    expect(buildTimeList(9 * 60, 10 * 60, 30)).toEqual([9 * 60, 9 * 60 + 30, 10 * 60])
  })

  it('covers a full day at the default step', () => {
    const times = buildTimeList(0, 24 * 60 - 1, 15)
    expect(times).toHaveLength(96)
    expect(times[0]).toBe(0)
    expect(times[95]).toBe(23 * 60 + 45)
  })

  it('stops before overshooting max', () => {
    expect(buildTimeList(0, 50, 20)).toEqual([0, 20, 40])
  })

  it('returns nothing for an unusable step or an inverted range', () => {
    expect(buildTimeList(0, 60, 0)).toEqual([])
    expect(buildTimeList(0, 60, -15)).toEqual([])
    expect(buildTimeList(10 * 60, 9 * 60, 15)).toEqual([])
  })
})

describe('nearestTimeIndex', () => {
  const times = buildTimeList(9 * 60, 10 * 60, 30)

  it('finds the exact entry when the value is on the grid', () => {
    expect(nearestTimeIndex(times, 9 * 60 + 30)).toBe(1)
  })

  it('rounds an off-grid value up to the next entry', () => {
    expect(nearestTimeIndex(times, 9 * 60 + 7)).toBe(1)
  })

  it('falls back to the last entry when the value is past the end', () => {
    expect(nearestTimeIndex(times, 23 * 60)).toBe(2)
  })

  it('reports nothing to highlight for a null value or an empty list', () => {
    expect(nearestTimeIndex(times, null)).toBe(-1)
    expect(nearestTimeIndex([], 9 * 60)).toBe(-1)
  })
})

describe('stepThroughTimes', () => {
  const times = buildTimeList(9 * 60, 10 * 60, 30)

  it('moves to the adjacent entry', () => {
    expect(stepThroughTimes(times, 9 * 60, 1)).toBe(9 * 60 + 30)
    expect(stepThroughTimes(times, 9 * 60 + 30, -1)).toBe(9 * 60)
  })

  it('snaps an off-grid value onto the next entry in the direction of travel', () => {
    expect(stepThroughTimes(times, 9 * 60 + 10, 1)).toBe(9 * 60 + 30)
    expect(stepThroughTimes(times, 9 * 60 + 10, -1)).toBe(9 * 60)
  })

  it('starts from the first or last entry when there is no current value', () => {
    expect(stepThroughTimes(times, null, 1)).toBe(9 * 60)
    expect(stepThroughTimes(times, null, -1)).toBe(10 * 60)
  })

  it('reports nowhere left to go at either end', () => {
    expect(stepThroughTimes(times, 10 * 60, 1)).toBeUndefined()
    expect(stepThroughTimes(times, 9 * 60, -1)).toBeUndefined()
    expect(stepThroughTimes([], 9 * 60, 1)).toBeUndefined()
  })
})
