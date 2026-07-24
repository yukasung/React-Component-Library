import { describe, expect, it } from 'vitest'
import { tokenizeDateMask } from './date'
import { applyDateMask, diffStrings, isLiteralCharAt, pendingAdvanceAtCursor } from './dateMask'

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

describe('applyDateMask', () => {
  const dmy = tokenizeDateMask('d/m/Y')!
  const mdy = tokenizeDateMask('m/d/Y')!
  const ymd = tokenizeDateMask('Y-m-d')!
  const y2md = tokenizeDateMask('y-m-d')!

  it('auto-completes and auto-advances a day leading digit 4-9', () => {
    const edit = diffStrings('', '4')
    expect(applyDateMask(dmy, '', edit)).toEqual({ draft: '4/', cursor: 2 })
  })

  it('keeps a day leading digit 0-3 open, awaiting a possible 2nd digit', () => {
    const edit = diffStrings('', '3')
    expect(applyDateMask(dmy, '', edit)).toEqual({ draft: '3', cursor: 1 })
  })

  it('completes a 2-digit day when the combined value is valid', () => {
    const edit = diffStrings('3', '31')
    expect(applyDateMask(dmy, '3', edit)).toEqual({ draft: '31/', cursor: 3 })
  })

  it('rejects a 2nd day digit that would exceed 31', () => {
    const edit = diffStrings('3', '35')
    expect(applyDateMask(dmy, '3', edit)).toBe('reject')
  })

  it('auto-completes and auto-advances a month leading digit 2-9', () => {
    const edit = diffStrings('', '2')
    expect(applyDateMask(mdy, '', edit)).toEqual({ draft: '2/', cursor: 2 })
  })

  it('keeps a month leading digit 0-1 open, awaiting a possible 2nd digit', () => {
    const edit = diffStrings('', '1')
    expect(applyDateMask(mdy, '', edit)).toEqual({ draft: '1', cursor: 1 })
  })

  it('keeps a leading "0" open (valid prefix of 01-09, not a valid standalone month)', () => {
    const edit = diffStrings('', '0')
    expect(applyDateMask(mdy, '', edit)).toEqual({ draft: '0', cursor: 1 })
  })

  it('completes a leading-zero month once the 2nd digit arrives', () => {
    const edit = diffStrings('0', '05')
    expect(applyDateMask(mdy, '0', edit)).toEqual({ draft: '05/', cursor: 3 })
  })

  it('rejects an explicit separator after a bare "0" (0 is not a valid standalone month)', () => {
    const edit = diffStrings('0', '0/')
    expect(applyDateMask(mdy, '0', edit)).toBe('reject')
  })

  it('completes a 2-digit month when the combined value is valid', () => {
    const edit = diffStrings('1', '12')
    expect(applyDateMask(mdy, '1', edit)).toEqual({ draft: '12/', cursor: 3 })
  })

  it('rejects a 2nd month digit that would exceed 12', () => {
    const edit = diffStrings('1', '13')
    expect(applyDateMask(mdy, '1', edit)).toBe('reject')
  })

  it('accepts a Y (4-digit year) digit at any position, only done at width 4', () => {
    let draft = ''
    for (const digit of ['2', '0', '2']) {
      const edit = diffStrings(draft, draft + digit)
      const result = applyDateMask(ymd, draft, edit)
      expect(result).not.toBe('reject')
      draft = (result as { draft: string }).draft
    }
    expect(draft).toBe('202')
    const finalEdit = diffStrings(draft, draft + '6')
    expect(applyDateMask(ymd, draft, finalEdit)).toEqual({ draft: '2026-', cursor: 5 })
  })

  it('accepts a y (2-digit year) digit at any position, only done at width 2', () => {
    const edit1 = diffStrings('', '2')
    const step1 = applyDateMask(y2md, '', edit1)
    expect(step1).toEqual({ draft: '2', cursor: 1 })
    const edit2 = diffStrings('2', '26')
    expect(applyDateMask(y2md, '2', edit2)).toEqual({ draft: '26-', cursor: 3 })
  })

  it('force-advances an explicit early separator on a not-yet-full segment', () => {
    const edit = diffStrings('7', '7/')
    expect(applyDateMask(dmy, '7', edit)).toEqual({ draft: '7/', cursor: 2 })
  })

  it('rejects an explicit separator typed with nothing in the segment yet', () => {
    const edit = diffStrings('', '/')
    expect(applyDateMask(dmy, '', edit)).toBe('reject')
  })

  it('treats a redundant separator keystroke (already present) as a no-op cursor advance', () => {
    // Constructed directly rather than via diffStrings — this exercises
    // applyDateMask's own contract for this edit shape regardless of how a
    // caller determines it (see the module's own note on the diffing
    // approach's limits for this specific case).
    const edit = { start: 1, removedCount: 0, inserted: '/' }
    expect(applyDateMask(dmy, '7/', edit)).toEqual({ draft: '7/', cursor: 2 })
  })

  it('accepts a pure deletion unmodified', () => {
    const edit = diffStrings('2026', '206')
    expect(applyDateMask(ymd, '2026', edit)).toEqual({ draft: '206', cursor: 2 })
  })

  it('rebuilds a full date from a multi-character paste', () => {
    const edit = diffStrings('', '22/07/2026')
    expect(applyDateMask(dmy, '', edit)).toEqual({ draft: '22/07/2026', cursor: 10 })
  })

  it('strips a paste\'s own separators and rebuilds using the format\'s own', () => {
    // Pasted text uses "/" but the target format ("Y-m-d") uses "-" --
    // rebuildFromDigits strips all non-digits first, so the format's own
    // literals are what actually appear, not whatever the pasted text used.
    const edit = diffStrings('', '2026/07/22')
    expect(applyDateMask(ymd, '', edit)).toEqual({ draft: '2026-07-22', cursor: 10 })
  })

  it('accepts a selection-overtype within a segment when the result is valid', () => {
    // Day "31" fully typed with trailing "/"; select just the "3" and
    // replace it with "1" -> day becomes "11", still valid, and (like any
    // completed segment) advances past the trailing separator.
    const edit = { start: 0, removedCount: 1, inserted: '1' }
    expect(applyDateMask(dmy, '31/', edit)).toEqual({ draft: '11/', cursor: 3 })
  })

  it('rejects a selection-overtype within a segment when the result is invalid', () => {
    // Day "12" fully typed; replace the "1" with "9" -> "92", invalid. The
    // edit still fits entirely within the day segment (unlike a selection
    // spanning multiple segments), so it's a genuine reject, not a
    // strip-and-rebuild fallback.
    const edit = { start: 0, removedCount: 1, inserted: '9' }
    expect(applyDateMask(dmy, '12/', edit)).toBe('reject')
  })

  it('falls back to a strip-and-rebuild when a single-character edit replaces a selection crossing a segment boundary', () => {
    // Selecting "1/" (day's 2nd digit plus the separator) and typing "5"
    // spans a segment boundary -- not given a bespoke per-segment
    // interpretation in v1, so (like a paste) it's rebuilt from scratch
    // rather than rejected outright.
    const edit = { start: 1, removedCount: 2, inserted: '5' }
    expect(applyDateMask(dmy, '31/07/2026', edit)).toEqual({ draft: '35/07/2026', cursor: 10 })
  })

  it('falls back to a strip-and-rebuild when a single digit overtypes a fully-selected value', () => {
    // Mirrors the required-field immediate-snap's select-all-on-empty
    // behavior: the whole formatted date is selected, then one digit is
    // typed -- removedCount spans every segment, well beyond the year
    // segment alone.
    const edit = { start: 0, removedCount: 10, inserted: '9' }
    expect(applyDateMask(ymd, '2026-07-23', edit)).toEqual({ draft: '9', cursor: 1 })
  })
})

describe('pendingAdvanceAtCursor', () => {
  const dmy = tokenizeDateMask('d/m/Y')!
  const jny = tokenizeDateMask('j/n/Y')!
  const ymd = tokenizeDateMask('Y-m-d')!

  it('finalizes the open day segment the cursor sits in, auto-inserting the trailing separator', () => {
    expect(pendingAdvanceAtCursor(dmy, '1', 1)).toEqual({ draft: '1/', cursor: 2 })
  })

  it('finalizes an open month segment the cursor sits in, not just the first segment', () => {
    // "31/1" with the cursor right after the month's single "1".
    expect(pendingAdvanceAtCursor(dmy, '31/1', 4)).toEqual({ draft: '31/1/', cursor: 5 })
  })

  it('returns null for an open segment the cursor has already moved PAST (the core bug)', () => {
    // Day "3" force-advanced to "3/", month "3" then auto-advanced to
    // "3/3/", cursor now at 4 (in the year). The day "3" is still a 1-digit
    // "open-looking" segment, but the cursor isn't in it -- must NOT
    // schedule an advance that would drag the cursor back to position 2.
    expect(pendingAdvanceAtCursor(jny, '3/3/', 4)).toBeNull()
  })

  it('returns null when the cursor sits in an already-complete (2-digit) segment', () => {
    expect(pendingAdvanceAtCursor(dmy, '31/12/2026', 2)).toBeNull()
  })

  it('returns null for a bare "0" -- not a valid standalone month, must not auto-advance to an invalid "0"', () => {
    const mdy = tokenizeDateMask('m/d/Y')!
    expect(pendingAdvanceAtCursor(mdy, '0', 1)).toBeNull()
  })

  it('auto-advances "0" once it becomes a valid 2-digit month prefix... i.e. still null at 1 digit, advances only when valid', () => {
    // "1" is a valid standalone month (January), so it does auto-advance,
    // unlike "0".
    const mdy = tokenizeDateMask('m/d/Y')!
    expect(pendingAdvanceAtCursor(mdy, '1', 1)).toEqual({ draft: '1/', cursor: 2 })
  })

  it('returns null when the cursor is not at the end of the open segment digits', () => {
    // Cursor at position 0, before the "1" -- not the "just typed, waiting
    // for a possible 2nd digit" state, so no auto-advance.
    expect(pendingAdvanceAtCursor(dmy, '1', 0)).toBeNull()
  })

  it('returns null for an empty draft', () => {
    expect(pendingAdvanceAtCursor(dmy, '', 0)).toBeNull()
  })

  it('returns null for a not-yet-complete Y segment -- year is never "ambiguous", only incomplete', () => {
    expect(pendingAdvanceAtCursor(ymd, '202', 3)).toBeNull()
  })

  it('returns null for a not-yet-complete y (2-digit year) segment', () => {
    const y2md = tokenizeDateMask('y-m-d')!
    expect(pendingAdvanceAtCursor(y2md, '2', 1)).toBeNull()
  })

  it('works identically for unpadded j/n tokens (same width/range as d/m)', () => {
    expect(pendingAdvanceAtCursor(jny, '1', 1)).toEqual({ draft: '1/', cursor: 2 })
  })
})

describe('isLiteralCharAt', () => {
  const dmy = tokenizeDateMask('d/m/Y')!

  it('is true at the index of a literal separator', () => {
    expect(isLiteralCharAt('31/07/2026', 2, dmy)).toBe(true)
    expect(isLiteralCharAt('31/07/2026', 5, dmy)).toBe(true)
  })

  it('is false at the index of a digit', () => {
    expect(isLiteralCharAt('31/07/2026', 0, dmy)).toBe(false)
    expect(isLiteralCharAt('31/07/2026', 6, dmy)).toBe(false)
  })
})
