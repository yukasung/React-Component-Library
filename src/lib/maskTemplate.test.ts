import { describe, expect, it } from 'vitest'
import { diffStrings } from './inputMask'
import {
  emptyTemplateEntry,
  templateEdit,
  templateFinalizeActive,
  templateFromRaw,
  templateMoveTo,
  templateRanges,
  templateSlotAt,
  templateText,
  templateToDraft,
  templateTypeIntoActive,
} from './maskTemplate'
import type { TemplateEntry } from './maskTemplate'
import { tokenizeDateMask } from './date'
import { timeMaskSegments } from './time'

const hi = timeMaskSegments('H:i')!
const hik = timeMaskSegments('h:i K')!
const ymd = tokenizeDateMask('Y-m-d')!

// Types a single character into the entry the way the component does: as the
// diff between the text on screen and what the browser left behind.
function type(segments: typeof hi, entry: TemplateEntry, next: string): TemplateEntry {
  const result = templateEdit(segments, entry, diffStrings(templateText(segments, entry), next))
  if (result === 'reject') throw new Error(`rejected: ${next}`)
  return result
}

// Presses one key into the active group, the way the component does it: the
// key itself, never the text it would have produced. Padding makes that text
// ambiguous -- typing "0" over an hour showing "01" produces "0:__", which
// diffs as a deletion of the "1".
function press(segments: typeof hi, entry: TemplateEntry, key: string): TemplateEntry {
  const result = templateTypeIntoActive(segments, entry, key)
  if (result === 'reject') throw new Error(`rejected: ${key}`)
  return result
}

function expectRejected(segments: typeof hi, entry: TemplateEntry, next: string) {
  expect(templateEdit(segments, entry, diffStrings(templateText(segments, entry), next))).toBe('reject')
}

describe('templateText', () => {
  it('renders an untouched entry as the mask placeholder does', () => {
    expect(templateText(hi, emptyTemplateEntry(hi))).toBe('__:__')
    expect(templateText(hik, emptyTemplateEntry(hik))).toBe('__:__ __')
  })

  it('zero-pads a typed group immediately, keeping every group at full width', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:__')
    expect(templateText(hi, entry)).toBe('01:__')
    expect(templateText(hi, entry)).toHaveLength('__:__'.length)
  })
})

describe('year groups (no range)', () => {
  it('fills out to the right rather than the left, a year being read most-significant-first', () => {
    // Fillers, not zeros: "2000" would both claim a year the user hasn't
    // typed and hide the next two keystrokes of "2006".
    expect(templateText(ymd, press(ymd, emptyTemplateEntry(ymd), '2'))).toBe('2___-__-__')
  })

  it('shows every keystroke of a year, including its zeros', () => {
    let entry = press(ymd, emptyTemplateEntry(ymd), '2')
    for (const [key, shown] of [
      ['0', '20__-__-__'],
      ['0', '200_-__-__'],
      ['6', '2006-__-__'],
    ] as const) {
      entry = press(ymd, entry, key)
      expect(templateText(ymd, entry)).toBe(shown)
    }
    // Four digits fill the group, so the highlight has moved to the month.
    expect(entry.active).toBe(1)
  })

  it('turns a part-typed year into its zeros once the group is finished', () => {
    let entry = press(ymd, emptyTemplateEntry(ymd), '2')
    expect(templateText(ymd, entry)).toBe('2___-__-__')

    // Leaving the group settles it, and that is when the fillers become the
    // zeros that commit -- so what commits is still what was on screen.
    entry = templateMoveTo(ymd, entry, 1)
    expect(templateText(ymd, entry)).toBe('2000-__-__')

    entry = press(ymd, entry, '7')
    entry = press(ymd, entry, '4')
    // "2" showed as 2000 while being typed, so 2000 is what commits -- never
    // the 0002 a right-aligned pad would have produced.
    expect(templateToDraft(ymd, templateFinalizeActive(ymd, entry))).toBe('2000-07-04')
  })

  it('still right-aligns the groups that do have a range', () => {
    const month = press(ymd, templateMoveTo(ymd, emptyTemplateEntry(ymd), 1), '7')
    expect(templateText(ymd, month)).toBe('____-07-__')
  })
})

describe('templateRanges / templateSlotAt', () => {
  it('lists each group at its fixed position', () => {
    expect(templateRanges(hi)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 5 },
    ])
    expect(templateRanges(hik)[2]).toEqual({ start: 6, end: 8 })
  })

  it('maps an offset to the group it lands in', () => {
    expect(templateSlotAt(hi, 0)).toBe(0)
    expect(templateSlotAt(hi, 2)).toBe(0)
    expect(templateSlotAt(hi, 3)).toBe(1)
    expect(templateSlotAt(hik, 7)).toBe(2)
  })

  it('clamps an offset past the last group into it', () => {
    expect(templateSlotAt(hi, 99)).toBe(1)
  })
})

describe('templateEdit', () => {
  it('fills a later group while the earlier one stays empty', () => {
    // The state a draft cannot represent at all.
    const minutes = templateMoveTo(hi, emptyTemplateEntry(hi), 1)
    const entry = type(hi, minutes, '__:3')
    expect(templateText(hi, entry)).toBe('__:03')
    expect(templateText(hi, type(hi, entry, '__:5'))).toBe('__:35')
  })

  it('finishes and pads a group that cannot take another digit', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '9:__')
    expect(templateText(hi, entry)).toBe('09:__')
    // The highlight has moved on to the minutes.
    expect(entry.active).toBe(1)
  })

  it('leaves an ambiguous group unfinished behind its padded value', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:__')
    // Reads as an hour already, but "1" could still become 10-19, so the
    // group keeps the highlight and its next digit appends.
    expect(templateText(hi, entry)).toBe('01:__')
    expect(entry.active).toBe(0)
    expect(entry.slots[0]).toEqual({ chars: '1', done: false })
  })

  it('rejects a digit that takes a group out of range', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '2:__')
    expectRejected(hi, entry, '5:__')
  })

  it('continues an unfinished group on the next digit', () => {
    const entry = press(hi, emptyTemplateEntry(hi), '1')
    expect(templateText(hi, press(hi, entry, '4'))).toBe('14:__')
  })

  it('starts a finished group over on the next digit', () => {
    let entry = press(hi, emptyTemplateEntry(hi), '1')
    entry = press(hi, entry, '4')
    expect(templateText(hi, entry)).toBe('14:__')
    // Back on the (finished) hour, a digit replaces it rather than appending.
    expect(templateText(hi, press(hi, templateMoveTo(hi, entry, 0), '5'))).toBe('05:__')
  })

  it('writes the whole designator from one letter', () => {
    const ampm = templateMoveTo(hik, emptyTemplateEntry(hik), 2)
    expect(templateText(hik, type(hik, ampm, '__:__ p'))).toBe('__:__ PM')
  })

  it('finishes a short group early on its separator', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:__')
    expect(templateText(hi, type(hi, entry, '::__'))).toBe('01:__')
    expect(type(hi, entry, '::__').slots[0].done).toBe(true)
  })

  it('moves on from an empty group when its separator is typed', () => {
    // The separator is how a group gets skipped, so it moves the highlight
    // even with nothing typed -- what the next digit fills is the minutes.
    const entry = type(hi, emptyTemplateEntry(hi), '::__')
    expect(templateText(hi, entry)).toBe('__:__')
    expect(entry.active).toBe(1)
    expect(templateText(hi, type(hi, entry, '__:3'))).toBe('__:03')
  })

  it('clears a group holding only a prefix when its separator is typed', () => {
    // "0" is a valid prefix of 01-09 for a 12-hour hour, not a value itself --
    // keeping it would render "00", which reads as filled but cannot commit.
    const entry = type(hik, emptyTemplateEntry(hik), '0:__ __')
    const moved = type(hik, entry, '::__ __')
    expect(templateText(hik, moved)).toBe('__:__ __')
    expect(moved.active).toBe(1)
  })

  it('empties the group a deletion lands on', () => {
    const entry = templateMoveTo(hi, type(hi, emptyTemplateEntry(hi), '9:__'), 0)
    expect(templateText(hi, type(hi, entry, ':__'))).toBe('__:__')
  })

  it('steps back and clears the previous group when the target is already empty', () => {
    const filled = type(hi, emptyTemplateEntry(hi), '9:__')
    const cleared = type(hi, filled, '09:')
    expect(cleared.active).toBe(0)
  })

  it('rebuilds from a pasted time', () => {
    const entry = templateFromRaw(hik, '9:30 PM')
    expect(templateText(hik, entry)).toBe('09:30 PM')
  })

  it('stops a paste at the first group it cannot fill', () => {
    expect(templateText(hi, templateFromRaw(hi, '9'))).toBe('09:__')
  })

  it('drops a pasted group that is out of range rather than correcting it', () => {
    expect(templateText(hi, templateFromRaw(hi, '25:30'))).toBe('__:__')
  })
})

describe('templateFinalizeActive', () => {
  it('closes out the active group at what it already holds', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:__')
    const finalized = templateFinalizeActive(hi, entry)
    // The text was already "01"; what changes is that the group now counts as
    // filled, which is what lets the entry commit.
    expect(finalized.slots[0]).toEqual({ chars: '1', done: true })
    expect(templateText(hi, finalized)).toBe('01:__')
  })

  it('leaves an empty group alone', () => {
    const empty = emptyTemplateEntry(hi)
    expect(templateFinalizeActive(hi, empty)).toEqual(empty)
  })

  it('clears a group holding only a prefix rather than leaving it looking filled', () => {
    const entry = type(hik, emptyTemplateEntry(hik), '0:__ __')
    expect(templateText(hik, templateFinalizeActive(hik, entry))).toBe('__:__ __')
  })
})

describe('templateToDraft', () => {
  it('produces a parseable draft once every group is filled', () => {
    let entry = type(hi, emptyTemplateEntry(hi), '9:__')
    entry = type(hi, entry, '09:3')
    entry = type(hi, entry, '09:5')
    expect(templateToDraft(hi, entry)).toBe('09:35')
  })

  it('pads the designator format the same way', () => {
    expect(templateToDraft(hik, templateFromRaw(hik, '2:30 PM'))).toBe('02:30 PM')
  })

  it('is null while any group is unfinished', () => {
    expect(templateToDraft(hi, emptyTemplateEntry(hi))).toBeNull()
    expect(templateToDraft(hi, type(hi, emptyTemplateEntry(hi), '9:__'))).toBeNull()
    expect(templateToDraft(hi, type(hi, emptyTemplateEntry(hi), '1:__'))).toBeNull()
  })
})
