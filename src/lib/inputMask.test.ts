import { describe, expect, it } from 'vitest'
import { tokenizeDateMask } from './date'
import { diffStrings, maskPlaceholder, maskPlaceholderRanges } from './inputMask'
import { timeMaskSegments } from './time'

describe('diffStrings', () => {
  it('finds a single character inserted at the end', () => {
    expect(diffStrings('202', '2026')).toEqual({ start: 3, removedCount: 0, inserted: '6' })
  })

  it('finds a single character inserted in the middle', () => {
    expect(diffStrings('26', '206')).toEqual({ start: 1, removedCount: 0, inserted: '0' })
  })

  it('finds a single character deleted', () => {
    expect(diffStrings('2026', '206')).toEqual({ start: 2, removedCount: 1, inserted: '' })
  })

  it('reports no edit for identical strings', () => {
    expect(diffStrings('2026', '2026')).toEqual({ start: 4, removedCount: 0, inserted: '' })
  })

  it('finds a full replacement (paste over a selection)', () => {
    expect(diffStrings('2026-07-22', '2027-01-01')).toEqual({
      start: 3,
      removedCount: 7,
      inserted: '7-01-01',
    })
  })
})

describe('maskPlaceholder', () => {
  it('fills each digit segment to its own width, keeping literals', () => {
    expect(maskPlaceholder(tokenizeDateMask('d/m/Y')!)).toBe('__/__/____')
  })

  it('fills an unpadded token to its full width, not the one digit it can hold', () => {
    expect(maskPlaceholder(timeMaskSegments('h:i')!)).toBe('__:__')
  })

  it('fills the AM/PM designator like a two-character segment', () => {
    expect(maskPlaceholder(timeMaskSegments('h:i K')!)).toBe('__:__ __')
  })

  it('reports where each group sits inside it', () => {
    // The position table the fixed-width template editor works from — offsets
    // into the string the function above produces.
    expect(maskPlaceholderRanges(tokenizeDateMask('d/m/Y')!)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
      { start: 6, end: 10 },
    ])
  })
})
