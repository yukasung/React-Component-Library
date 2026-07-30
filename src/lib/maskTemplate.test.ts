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
} from './maskTemplate'
import type { TemplateEntry } from './maskTemplate'
import { timeMaskSegments } from './time'

const hi = timeMaskSegments('H:i')!
const hik = timeMaskSegments('h:i K')!

// Types a single character into the entry the way the component does: as the
// diff between the text on screen and what the browser left behind.
function type(segments: typeof hi, entry: TemplateEntry, next: string): TemplateEntry {
  const result = templateEdit(segments, entry, diffStrings(templateText(segments, entry), next))
  if (result === 'reject') throw new Error(`rejected: ${next}`)
  return result
}

function expectRejected(segments: typeof hi, entry: TemplateEntry, next: string) {
  expect(templateEdit(segments, entry, diffStrings(templateText(segments, entry), next))).toBe('reject')
}

describe('templateText', () => {
  it('renders an untouched entry as the mask placeholder does', () => {
    expect(templateText(hi, emptyTemplateEntry(hi))).toBe('--:--')
    expect(templateText(hik, emptyTemplateEntry(hik))).toBe('--:-- --')
  })

  it('zero-pads a typed group immediately, keeping every group at full width', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:--')
    expect(templateText(hi, entry)).toBe('01:--')
    expect(templateText(hi, entry)).toHaveLength('--:--'.length)
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
    const entry = type(hi, minutes, '--:3')
    expect(templateText(hi, entry)).toBe('--:03')
    expect(templateText(hi, type(hi, entry, '--:5'))).toBe('--:35')
  })

  it('finishes and pads a group that cannot take another digit', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '9:--')
    expect(templateText(hi, entry)).toBe('09:--')
    // The highlight has moved on to the minutes.
    expect(entry.active).toBe(1)
  })

  it('leaves an ambiguous group unfinished behind its padded value', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:--')
    // Reads as an hour already, but "1" could still become 10-19, so the
    // group keeps the highlight and its next digit appends.
    expect(templateText(hi, entry)).toBe('01:--')
    expect(entry.active).toBe(0)
    expect(entry.slots[0]).toEqual({ chars: '1', done: false })
  })

  it('rejects a digit that takes a group out of range', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '2:--')
    expectRejected(hi, entry, '5:--')
  })

  it('continues an unfinished group even though the edit looks like a replacement', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:--')
    // The whole group is highlighted, so every keystroke arrives as one --
    // continuing or starting over is the group's own state to decide.
    expect(templateText(hi, templateEdit(hi, entry, { start: 0, removedCount: 2, inserted: '4' }) as TemplateEntry)).toBe(
      '14:--',
    )
  })

  it('starts a finished group over on the next digit', () => {
    let entry = type(hi, emptyTemplateEntry(hi), '1:--')
    entry = type(hi, entry, '4:--')
    expect(templateText(hi, entry)).toBe('14:--')
    expect(templateText(hi, templateEdit(hi, templateMoveTo(hi, entry, 0), { start: 0, removedCount: 2, inserted: '5' }) as TemplateEntry)).toBe(
      '05:--',
    )
  })

  it('writes the whole designator from one letter', () => {
    const ampm = templateMoveTo(hik, emptyTemplateEntry(hik), 2)
    expect(templateText(hik, type(hik, ampm, '--:-- p'))).toBe('--:-- PM')
  })

  it('finishes a short group early on its separator', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:--')
    expect(templateText(hi, type(hi, entry, '::--'))).toBe('01:--')
    expect(type(hi, entry, '::--').slots[0].done).toBe(true)
  })

  it('moves on from an empty group when its separator is typed', () => {
    // The separator is how a group gets skipped, so it moves the highlight
    // even with nothing typed -- what the next digit fills is the minutes.
    const entry = type(hi, emptyTemplateEntry(hi), '::--')
    expect(templateText(hi, entry)).toBe('--:--')
    expect(entry.active).toBe(1)
    expect(templateText(hi, type(hi, entry, '--:3'))).toBe('--:03')
  })

  it('clears a group holding only a prefix when its separator is typed', () => {
    // "0" is a valid prefix of 01-09 for a 12-hour hour, not a value itself --
    // keeping it would render "00", which reads as filled but cannot commit.
    const entry = type(hik, emptyTemplateEntry(hik), '0:-- --')
    const moved = type(hik, entry, '::-- --')
    expect(templateText(hik, moved)).toBe('--:-- --')
    expect(moved.active).toBe(1)
  })

  it('empties the group a deletion lands on', () => {
    const entry = templateMoveTo(hi, type(hi, emptyTemplateEntry(hi), '9:--'), 0)
    expect(templateText(hi, type(hi, entry, ':--'))).toBe('--:--')
  })

  it('steps back and clears the previous group when the target is already empty', () => {
    const filled = type(hi, emptyTemplateEntry(hi), '9:--')
    const cleared = type(hi, filled, '09:')
    expect(cleared.active).toBe(0)
  })

  it('rebuilds from a pasted time', () => {
    const entry = templateFromRaw(hik, '9:30 PM')
    expect(templateText(hik, entry)).toBe('09:30 PM')
  })

  it('stops a paste at the first group it cannot fill', () => {
    expect(templateText(hi, templateFromRaw(hi, '9'))).toBe('09:--')
  })

  it('drops a pasted group that is out of range rather than correcting it', () => {
    expect(templateText(hi, templateFromRaw(hi, '25:30'))).toBe('--:--')
  })
})

describe('templateFinalizeActive', () => {
  it('closes out the active group at what it already holds', () => {
    const entry = type(hi, emptyTemplateEntry(hi), '1:--')
    const finalized = templateFinalizeActive(hi, entry)
    // The text was already "01"; what changes is that the group now counts as
    // filled, which is what lets the entry commit.
    expect(finalized.slots[0]).toEqual({ chars: '1', done: true })
    expect(templateText(hi, finalized)).toBe('01:--')
  })

  it('leaves an empty group alone', () => {
    const empty = emptyTemplateEntry(hi)
    expect(templateFinalizeActive(hi, empty)).toEqual(empty)
  })

  it('clears a group holding only a prefix rather than leaving it looking filled', () => {
    const entry = type(hik, emptyTemplateEntry(hik), '0:-- --')
    expect(templateText(hik, templateFinalizeActive(hik, entry))).toBe('--:-- --')
  })
})

describe('templateToDraft', () => {
  it('produces a parseable draft once every group is filled', () => {
    let entry = type(hi, emptyTemplateEntry(hi), '9:--')
    entry = type(hi, entry, '09:3')
    entry = type(hi, entry, '09:5')
    expect(templateToDraft(hi, entry)).toBe('09:35')
  })

  it('pads the designator format the same way', () => {
    expect(templateToDraft(hik, templateFromRaw(hik, '2:30 PM'))).toBe('02:30 PM')
  })

  it('is null while any group is unfinished', () => {
    expect(templateToDraft(hi, emptyTemplateEntry(hi))).toBeNull()
    expect(templateToDraft(hi, type(hi, emptyTemplateEntry(hi), '9:--'))).toBeNull()
    expect(templateToDraft(hi, type(hi, emptyTemplateEntry(hi), '1:--'))).toBeNull()
  })
})
