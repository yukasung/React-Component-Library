import { describe, expect, it } from 'vitest'
import { tokenizeMask } from './maskPattern'
import type { MaskPattern } from './maskPattern'
import {
  applyText,
  backspace,
  caretEnd,
  caretHome,
  caretLeft,
  caretRight,
  caretTo,
  clearRange,
  commitState,
  deleteForward,
  emptyEntry,
  entryText,
  entryToRaw,
  offsetToPosition,
  positionSpan,
  positionToOffset,
  rawToEntry,
  selectRange,
  typeInto,
} from './maskField'
import type { MaskEntry } from './maskField'

const PROMPT = '_'

function pattern(mask: string): MaskPattern {
  const result = tokenizeMask(mask)
  if (!result) throw new Error(`mask did not tokenize: ${mask}`)
  return result
}

function render(mask: string, entry: MaskEntry, promptChar = PROMPT): string {
  return entryText(pattern(mask), entry, promptChar)
}

// Types a run of clusters, asserting nothing was refused along the way unless
// the test is about a refusal.
function type(mask: string, entry: MaskEntry, keys: string, overwriteMode = false): MaskEntry {
  const p = pattern(mask)
  let current = entry
  for (const cluster of Array.from(keys)) {
    current = typeInto(p, current, cluster, overwriteMode).entry
  }
  return current
}

describe('entryToRaw', () => {
  // R3.3's table. Stripping the blanks would make these two indistinguishable.
  const cases: { mask: string; raw: string; rendered: string }[] = [
    { mask: '99-00', raw: '1 23', rendered: '1_-23' },
    { mask: '99-00', raw: ' 123', rendered: '_1-23' },
    { mask: '(999) 000-0000', raw: '   5551234', rendered: '(___) 555-1234' },
    { mask: '(999) 000-0000', raw: '02 5551234', rendered: '(02_) 555-1234' },
  ]

  for (const { mask, raw, rendered } of cases) {
    it(`renders ${rendered} as ${JSON.stringify(raw)}`, () => {
      const entry = rawToEntry(pattern(mask), raw)
      expect(render(mask, entry)).toBe(rendered)
      expect(entryToRaw(pattern(mask), entry)).toBe(raw)
    })
  }

  it('keeps unfilled optional positions as spaces, not as the prompt character', () => {
    const entry = rawToEntry(pattern('99-00'), '1 23')
    expect(render('99-00', entry, '#')).toBe('1#-23')
    expect(entryToRaw(pattern('99-00'), entry)).toBe('1 23')
  })

  it('has a cluster count equal to the fillable count even when filled with Thai', () => {
    const p = pattern('LL')
    const entry = type('LL', emptyEntry(p), '')
    const withThai = typeInto(p, typeInto(p, entry, 'กิ๊', false).entry, 'ที่', false).entry
    const raw = entryToRaw(p, withThai)
    expect(Array.from(raw).length).toBeGreaterThan(p.fillableCount)
    expect(raw).toBe('กิ๊ที่')
  })

  it('is empty-shaped for a fresh entry', () => {
    expect(entryToRaw(pattern('00-00'), emptyEntry(pattern('00-00')))).toBe('    ')
  })
})

describe('rawToEntry', () => {
  it('applies a cluster count equal to the fillable count positionally', () => {
    expect(render('000-000', rawToEntry(pattern('000-000'), '123456'))).toBe('123-456')
  })

  it('applies fewer clusters left to right and leaves the rest unfilled', () => {
    expect(render('000-000', rawToEntry(pattern('000-000'), '1234'))).toBe('123-4__')
  })

  it('drops the excess when there are more clusters', () => {
    expect(render('000-000', rawToEntry(pattern('000-000'), '12345678'))).toBe('123-456')
  })

  it('leaves a position unfilled when its class refuses what lands on it, and continues', () => {
    expect(render('0L0', rawToEntry(pattern('0L0'), '123'))).toBe('1_3')
  })

  it('round-trips the canonical form', () => {
    const p = pattern('(999) 000-0000')
    for (const raw of ['02 5551234', '   5551234', '0812345678', '          ']) {
      expect(entryToRaw(p, rawToEntry(p, raw))).toBe(raw)
    }
  })
})

describe('commitState', () => {
  it('is empty for a fresh field', () => {
    expect(commitState(pattern('000'), emptyEntry(pattern('000')))).toBe('empty')
  })

  // The ordering regression: an all-optional mask has no required position to
  // be missing, so a completeness test alone would call an empty field
  // complete and commit two blanks instead of null.
  it('is empty — not complete — for an all-optional mask with nothing typed', () => {
    expect(commitState(pattern('99'), emptyEntry(pattern('99')))).toBe('empty')
  })

  it('is complete once every required position is filled', () => {
    expect(commitState(pattern('000'), rawToEntry(pattern('000'), '123'))).toBe('complete')
  })

  it('is complete with optional positions left blank', () => {
    const p = pattern('(999) 000-0000')
    expect(commitState(p, rawToEntry(p, '   5551234'))).toBe('complete')
  })

  it('is incomplete when a required position is unfilled', () => {
    expect(commitState(pattern('000'), rawToEntry(pattern('000'), '12'))).toBe('incomplete')
  })
})

describe('the offset bridge', () => {
  it('agrees with the index while every position is one code unit', () => {
    const p = pattern('00-00')
    const entry = rawToEntry(p, '1234')
    for (let i = 0; i <= p.positions.length; i++) {
      expect(positionToOffset(p, entry, PROMPT, i)).toBe(i)
    }
  })

  // The case a table precomputed from the mask alone gets wrong.
  it('moves with the rendered text once a position holds a cluster', () => {
    const p = pattern('LL')
    const empty = emptyEntry(p)
    expect(positionToOffset(p, empty, PROMPT, 1)).toBe(1)

    const thai = typeInto(p, empty, 'กิ๊', false).entry
    expect(entryText(p, thai, PROMPT)).toBe('กิ๊_')
    expect(positionToOffset(p, thai, PROMPT, 1)).toBe(3)
  })

  it('resolves any offset inside a cluster to that cluster, never splitting it', () => {
    const p = pattern('LL')
    const thai = typeInto(p, emptyEntry(p), 'กิ๊', false).entry
    for (const offset of [0, 1, 2]) {
      expect(offsetToPosition(p, thai, PROMPT, offset)).toBe(0)
    }
    expect(offsetToPosition(p, thai, PROMPT, 3)).toBe(1)
  })

  it('clamps an offset past the end rather than landing nowhere', () => {
    const p = pattern('00')
    expect(offsetToPosition(p, emptyEntry(p), PROMPT, 99)).toBe(p.positions.length)
  })

  it('spans a position by its rendered width, not by one', () => {
    const p = pattern('LL')
    const thai = typeInto(p, emptyEntry(p), 'กิ๊', false).entry
    expect(positionSpan(p, thai, PROMPT, 0)).toEqual({ start: 0, end: 3 })
    expect(positionSpan(p, thai, PROMPT, 1)).toEqual({ start: 3, end: 4 })
  })

  it('round-trips position to offset and back for a mixed-script field', () => {
    const p = pattern('LL-LL')
    let entry = emptyEntry(p)
    for (const cluster of ['a', 'กิ๊', 'ที่', 'z']) {
      entry = typeInto(p, entry, cluster, false).entry
    }
    for (const index of p.fillableIndices) {
      const offset = positionToOffset(p, entry, PROMPT, index)
      expect(offsetToPosition(p, entry, PROMPT, offset)).toBe(index)
    }
  })
})

describe('typing', () => {
  it('fills a position and advances past literals', () => {
    expect(render('000-000', type('000-000', emptyEntry(pattern('000-000')), '123456'))).toBe('123-456')
  })

  it('rejects a character its class refuses, leaving the caret where it was', () => {
    const p = pattern('000')
    const result = typeInto(p, emptyEntry(p), 'a', false)
    expect(result.invalid).toEqual({ reason: 'character', input: 'a', position: 0 })
    expect(entryText(p, result.entry, PROMPT)).toBe('___')
    expect(result.entry.caret).toEqual({ start: 0, end: 0 })
  })

  it('applies a position case conversion', () => {
    expect(render('>LL', type('>LL', emptyEntry(pattern('>LL')), 'ab'))).toBe('AB')
    expect(render('<LL', type('<LL', emptyEntry(pattern('<LL')), 'AB'))).toBe('ab')
  })

  describe('typing a literal', () => {
    it('lets a phone number be typed straight through', () => {
      const p = pattern('000-000-0000')
      let entry = emptyEntry(p)
      for (const cluster of Array.from('081-234-5678')) {
        const result = typeInto(p, entry, cluster, false)
        expect(result.invalid).toBeUndefined()
        entry = result.entry
      }
      expect(entryText(p, entry, PROMPT)).toBe('081-234-5678')
    })

    it('swallows the separator once and refuses a second one', () => {
      const p = pattern('000-000-0000')
      const entry = type('000-000-0000', emptyEntry(p), '081')
      const first = typeInto(p, entry, '-', false)
      expect(first.invalid).toBeUndefined()
      expect(entryText(p, first.entry, PROMPT)).toBe('081-___-____')

      const second = typeInto(p, first.entry, '-', false)
      expect(second.invalid?.reason).toBe('character')
    })

    // A flag swallows one dash and rejects the other.
    it('swallows every literal of a run, in order', () => {
      const p = pattern('00--00')
      let entry = emptyEntry(p)
      for (const cluster of Array.from('12--34')) {
        const result = typeInto(p, entry, cluster, false)
        expect(result.invalid).toBeUndefined()
        entry = result.entry
      }
      expect(entryText(p, entry, PROMPT)).toBe('12--34')
    })

    it('refuses a literal that is in the queue but not at its head', () => {
      const p = pattern('00-/00')
      const entry = type('00-/00', emptyEntry(p), '12')
      expect(entry.owedLiterals).toEqual(['-', '/'])
      expect(typeInto(p, entry, '/', false).invalid?.reason).toBe('character')
    })

    // The caret is always normalized onto a fillable position, so it never
    // comes to rest on a literal — a click on one lands on the fillable
    // position after it.
    it('never leaves the caret on a literal position', () => {
      const p = pattern('00-00')
      expect(caretTo(p, emptyEntry(p), 2).caret).toEqual({ start: 3, end: 3 })
    })

    // With the queue emptied by the arrow keys, a separator typed out of
    // sequence is an ordinary rejection.
    it('refuses a literal typed with nothing owed', () => {
      const p = pattern('00-00')
      const entry = caretLeft(p, type('00-00', emptyEntry(p), '12'))
      expect(entry.owedLiterals).toEqual([])
      expect(typeInto(p, entry, '-', false).invalid?.reason).toBe('character')
    })
  })

  describe('the owed-literal queue is emptied by everything that is not a fill', () => {
    const p = pattern('000-000-0000')
    const primed = () => {
      const entry = type('000-000-0000', emptyEntry(p), '081')
      expect(entry.owedLiterals).toEqual(['-'])
      return entry
    }

    const operations: [string, (entry: MaskEntry) => MaskEntry][] = [
      ['a rejected key', (entry) => typeInto(p, entry, 'z', false).entry],
      ['arrow left', (entry) => caretLeft(p, entry)],
      ['arrow right', (entry) => caretRight(p, entry)],
      ['home', (entry) => caretHome(p, entry)],
      ['end', (entry) => caretEnd(p, entry)],
      ['a click', (entry) => caretTo(p, entry, 0)],
      ['backspace', (entry) => backspace(p, entry)],
      ['delete', (entry) => deleteForward(p, entry)],
      ['a selection', (entry) => selectRange(entry, { start: 0, end: 2 })],
      ['clearing a range', (entry) => clearRange(p, entry, { start: 0, end: 2 })],
      ['a paste', (entry) => applyText(p, entry, '55', PROMPT).entry],
    ]

    for (const [name, operate] of operations) {
      it(`empties it after ${name}`, () => {
        expect(operate(primed()).owedLiterals).toEqual([])
      })
    }
  })

  describe('insert mode', () => {
    it('pushes the occupants along', () => {
      const p = pattern('000')
      const entry = caretHome(p, rawToEntry(p, '12 '))
      expect(entryText(p, typeInto(p, entry, '9', false).entry, PROMPT)).toBe('912')
    })

    // The rule stated as "the last fillable position is occupied" refused
    // this, although the hole in the middle is somewhere to shift to.
    it('shifts into a hole in the middle of the field', () => {
      const p = pattern('000')
      const entry = caretHome(p, rawToEntry(p, '1 3'))
      const result = typeInto(p, entry, '9', false)
      expect(result.invalid).toBeUndefined()
      expect(entryText(p, result.entry, PROMPT)).toBe('913')
    })

    it('leaves the positions beyond the hole untouched', () => {
      const p = pattern('00000')
      const entry = caretHome(p, rawToEntry(p, '12 45'))
      expect(entryText(p, typeInto(p, entry, '9', false).entry, PROMPT)).toBe('91245')
    })

    it('shifts across a literal run without moving the literals', () => {
      const p = pattern('00--00')
      const entry = caretHome(p, rawToEntry(p, '123 '))
      expect(entryText(p, typeInto(p, entry, '9', false).entry, PROMPT)).toBe('91--23')
    })

    it('refuses with full when there is no hole at or after the caret', () => {
      const p = pattern('000')
      const entry = caretHome(p, rawToEntry(p, '123'))
      const result = typeInto(p, entry, '9', false)
      expect(result.invalid?.reason).toBe('full')
      expect(entryText(p, result.entry, PROMPT)).toBe('123')
    })

    // All-or-nothing: a digit cannot land in a letter position.
    it('refuses all-or-nothing when a shifted character would change class', () => {
      const p = pattern('000-LL')
      const entry = caretTo(p, rawToEntry(p, '123a '), 2)
      const result = typeInto(p, entry, '9', false)
      expect(result.invalid?.reason).toBe('character')
      expect(entryText(p, result.entry, PROMPT)).toBe('123-a_')
    })
  })

  describe('overwrite mode', () => {
    it('replaces the character at the caret and shifts nothing', () => {
      const p = pattern('000')
      const entry = caretHome(p, rawToEntry(p, '123'))
      expect(entryText(p, typeInto(p, entry, '9', true).entry, PROMPT)).toBe('923')
    })

    it('never reports full', () => {
      const p = pattern('000')
      const entry = caretHome(p, rawToEntry(p, '123'))
      expect(typeInto(p, entry, '9', true).invalid).toBeUndefined()
    })
  })

  describe('over a selection', () => {
    // Without clearing first, this is refused as full on a field that is
    // full — when the user has just asked for it to be replaced.
    it('replaces the selection rather than being refused as full', () => {
      const p = pattern('000')
      const entry = selectRange(rawToEntry(p, '123'), { start: 0, end: 3 })
      const result = typeInto(p, entry, '9', false)
      expect(result.invalid).toBeUndefined()
      expect(entryText(p, result.entry, PROMPT)).toBe('9__')
    })

    // Clearing leaves holes where the selection was; typing fills the first
    // of them. Nothing slides left — the positions after the selection are
    // exactly where they were.
    it('clears a partial selection and types at its start', () => {
      const p = pattern('0000')
      const entry = selectRange(rawToEntry(p, '1234'), { start: 1, end: 3 })
      expect(entryText(p, typeInto(p, entry, '9', false).entry, PROMPT)).toBe('19_4')
    })

    it('leaves literals inside a cleared range alone', () => {
      const p = pattern('00-00')
      const cleared = clearRange(p, rawToEntry(p, '1234'), { start: 0, end: 5 })
      expect(entryText(p, cleared, PROMPT)).toBe('__-__')
    })
  })
})

describe('combining marks', () => {
  // A Thai keyboard sends "กิ๊" as three keystrokes. Offering the marks to
  // the next position means Thai cannot be typed at all.
  it('attaches a mark typed after a consonant to that consonant', () => {
    const p = pattern('LL')
    let entry = emptyEntry(p)
    for (const cluster of ['ก', '\u0E34', '\u0E4A']) {
      const result = typeInto(p, entry, cluster, false)
      expect(result.invalid).toBeUndefined()
      entry = result.entry
    }
    expect(entryText(p, entry, PROMPT)).toBe('กิ๊_')
    expect(entryToRaw(p, entry)).toBe('กิ๊ ')
  })

  it('leaves the caret where it is, so the next base starts the next position', () => {
    const p = pattern('LL')
    const entry = type('LL', emptyEntry(p), 'ก\u0E34\u0E4Aข')
    expect(entryText(p, entry, PROMPT)).toBe('กิ๊ข')
  })

  it('keeps the owed-literal queue, since no new position was started', () => {
    const p = pattern('LL-LL')
    const entry = type('LL-LL', emptyEntry(p), 'aก\u0E34')
    expect(entry.owedLiterals).toEqual(['-'])
    expect(typeInto(p, entry, '-', false).invalid).toBeUndefined()
  })

  it('refuses a mark with nothing to attach to', () => {
    const p = pattern('LL')
    const result = typeInto(p, emptyEntry(p), '\u0E34', false)
    expect(result.invalid?.reason).toBe('character')
    expect(entryText(p, result.entry, PROMPT)).toBe('__')
  })

  it('refuses a mark that would push the cluster past the code-point guard', () => {
    const p = pattern('L')
    let entry = typeInto(p, emptyEntry(p), 'ก', false).entry
    for (let i = 0; i < 7; i++) {
      entry = typeInto(p, entry, '\u0E34', false).entry
    }
    expect(typeInto(p, entry, '\u0E34', false).invalid?.reason).toBe('character')
  })

  // A mark reaches a position by three routes. Enforcing the letter-base rule
  // at the keystroke alone left the other two accepting "1ิ" and reporting
  // the field complete.
  it('refuses a decorated digit through a raw value', () => {
    const p = pattern('00')
    const entry = rawToEntry(p, '1\u0E34' + '2')
    expect(entryText(p, entry, PROMPT)).toBe('_2')
    expect(commitState(p, entry)).toBe('incomplete')
  })

  it('refuses a decorated digit through a paste', () => {
    const p = pattern('00')
    const result = applyText(p, emptyEntry(p), '1\u0E34' + '2', PROMPT)
    expect(entryToRaw(p, result.entry)).not.toContain('\u0E34')
    expect(result.invalid?.reason).toBe('paste')
  })

  it('refuses a mark on a position whose class would not accept the result', () => {
    const p = pattern('00')
    const entry = typeInto(p, emptyEntry(p), '1', false).entry
    expect(typeInto(p, entry, '\u0E34', false).invalid?.reason).toBe('character')
  })
})

describe('a space in an optional position', () => {
  // R3.3 makes the raw blank a space, so "typed a space" and "left blank"
  // are one state rather than two that render differently.
  it('blanks the position rather than storing a character', () => {
    const p = pattern('99')
    const entry = type('99', emptyEntry(p), ' 1')
    expect(entryText(p, entry, PROMPT)).toBe('_1')
    expect(entryToRaw(p, entry)).toBe(' 1')
  })

  it('advances the caret like any accepted cluster', () => {
    const p = pattern('999')
    expect(entryToRaw(p, type('999', emptyEntry(p), '1 2'))).toBe('1 2')
  })

  it('clears an occupied position without shifting anything along', () => {
    const p = pattern('999')
    const entry = caretHome(p, rawToEntry(p, '123'))
    expect(entryText(p, typeInto(p, entry, ' ', false).entry, PROMPT)).toBe('_23')
  })

  it('is refused by a required position', () => {
    const p = pattern('000')
    expect(typeInto(p, emptyEntry(p), ' ', false).invalid?.reason).toBe('character')
  })

  it('makes the render survive a raw round trip', () => {
    const p = pattern('(999) 000-0000')
    const entry = rawToEntry(p, '02 5551234')
    expect(entryText(p, rawToEntry(p, entryToRaw(p, entry)), PROMPT)).toBe(entryText(p, entry, PROMPT))
  })
})

describe('backspace and delete', () => {
  it('backspace clears the position before the caret and moves back', () => {
    const p = pattern('000')
    const entry = type('000', emptyEntry(p), '123')
    expect(entryText(p, backspace(p, entry), PROMPT)).toBe('12_')
  })

  it('delete clears the position at the caret and stays', () => {
    const p = pattern('000')
    const entry = caretHome(p, rawToEntry(p, '123'))
    const result = deleteForward(p, entry)
    expect(entryText(p, result, PROMPT)).toBe('_23')
    expect(result.caret).toEqual({ start: 0, end: 0 })
  })

  it('neither removes a literal', () => {
    const p = pattern('00-00')
    const entry = caretTo(p, rawToEntry(p, '1234'), 3)
    expect(entryText(p, backspace(p, entry), PROMPT)).toBe('1_-34')
    expect(entryText(p, deleteForward(p, entry), PROMPT)).toBe('12-_4')
  })

  it('clears the selection when there is one', () => {
    const p = pattern('0000')
    const entry = selectRange(rawToEntry(p, '1234'), { start: 1, end: 3 })
    expect(entryText(p, backspace(p, entry), PROMPT)).toBe('1__4')
    expect(entryText(p, deleteForward(p, entry), PROMPT)).toBe('1__4')
  })

  it('does nothing at the start of the field', () => {
    const p = pattern('000')
    const entry = caretHome(p, emptyEntry(p))
    expect(entryText(p, backspace(p, entry), PROMPT)).toBe('___')
  })
})

describe('applyText', () => {
  describe('step 1 — formatted', () => {
    // The identity that makes copy-then-paste safe. Dropping the prompt and
    // sliding the digits left would silently change which position "1" holds.
    it('round-trips text copied out of the field, prompts included', () => {
      const p = pattern('99-00')
      const entry = rawToEntry(p, '1 23')
      const copied = entryText(p, entry, PROMPT)
      expect(copied).toBe('1_-23')

      const pasted = applyText(p, emptyEntry(p), copied, PROMPT)
      expect(entryText(p, pasted.entry, PROMPT)).toBe('1_-23')
      expect(entryToRaw(p, pasted.entry)).toBe('1 23')
    })

    it('round-trips a leading blank the same way', () => {
      const p = pattern('99-00')
      const pasted = applyText(p, emptyEntry(p), '_1-23', PROMPT)
      expect(entryToRaw(p, pasted.entry)).toBe(' 123')
    })

    it('takes spaces in the unfilled positions too', () => {
      const p = pattern('99-00')
      expect(entryToRaw(p, applyText(p, emptyEntry(p), ' 1-23', PROMPT).entry)).toBe(' 123')
    })

    // A space stands for a blank whatever the position's class is. Reading it
    // as data means a required position refuses it, the whole string falls
    // through to the sequential walk, and the value lands one position to the
    // left of where it was pasted from.
    it('takes a space standing in for an unfilled required position', () => {
      const p = pattern('00-00')
      const result = applyText(p, emptyEntry(p), ' 1-23', PROMPT)
      expect(entryText(p, result.entry, PROMPT)).toBe('_1-23')
      expect(entryToRaw(p, result.entry)).toBe(' 123')
    })

    it('recognizes a non-default prompt character', () => {
      const p = pattern('99-00')
      expect(entryToRaw(p, applyText(p, emptyEntry(p), '#1-23', '#').entry)).toBe(' 123')
    })

    it('takes a formatted phone number', () => {
      const p = pattern('000-000-0000')
      const result = applyText(p, emptyEntry(p), '081-234-5678', PROMPT)
      expect(entryToRaw(p, result.entry)).toBe('0812345678')
      expect(result.invalid).toBeUndefined()
    })
  })

  describe('step 2 — raw', () => {
    it('takes a bare value of the fillable length', () => {
      const p = pattern('000-000-0000')
      const result = applyText(p, emptyEntry(p), '0812345678', PROMPT)
      expect(entryText(p, result.entry, PROMPT)).toBe('081-234-5678')
      expect(result.invalid).toBeUndefined()
    })

    it('produces the same field as the formatted form', () => {
      const p = pattern('000-000-0000')
      const formatted = applyText(p, emptyEntry(p), '081-234-5678', PROMPT).entry
      const raw = applyText(p, emptyEntry(p), '0812345678', PROMPT).entry
      expect(entryToRaw(p, raw)).toBe(entryToRaw(p, formatted))
    })
  })

  // A literal that looks like data: mask "00\000" is two digits, a literal
  // "0", then two digits. Rendered width 5, fillable count 4.
  describe('a literal that looks like data', () => {
    const mask = '00\\000'
    const cases: { pasted: string; rendered: string; raw: string; note: string }[] = [
      { pasted: '12034', rendered: '12034', raw: '1234', note: 'step 1, matching the rendered width' },
      { pasted: '1234', rendered: '12034', raw: '1234', note: 'step 2, matching the fillable count' },
      { pasted: '1203', rendered: '12003', raw: '1203', note: 'step 2, with a data zero' },
      { pasted: '12', rendered: '120__', raw: '12  ', note: 'step 3, partial' },
    ]

    for (const { pasted, rendered, raw, note } of cases) {
      it(`pastes ${JSON.stringify(pasted)} as ${rendered} (${note})`, () => {
        const p = pattern(mask)
        const result = applyText(p, emptyEntry(p), pasted, PROMPT)
        expect(entryText(p, result.entry, PROMPT)).toBe(rendered)
        expect(entryToRaw(p, result.entry)).toBe(raw)
      })
    }

    // Walked sequentially, "1203" hands its third cluster to the literal and
    // the user's digit disappears.
    it('does not eat a data zero as the literal', () => {
      const p = pattern(mask)
      expect(entryToRaw(p, applyText(p, emptyEntry(p), '1203', PROMPT).entry)).not.toBe('123 ')
    })

    it('never puts a literal position into the raw value', () => {
      const p = pattern(mask)
      for (const pasted of ['12034', '1234', '1203', '12']) {
        expect(entryToRaw(p, applyText(p, emptyEntry(p), pasted, PROMPT).entry)).toHaveLength(4)
      }
    })
  })

  it('resolves steps 1 and 2 identically for a mask with no literals', () => {
    const p = pattern('0000')
    expect(p.renderedWidth).toBe(p.fillableCount)
    expect(entryToRaw(p, applyText(p, emptyEntry(p), '1234', PROMPT).entry)).toBe('1234')
  })

  describe('step 3 — sequential', () => {
    it('applies a partial paste from the caret', () => {
      const p = pattern('000-000')
      const entry = caretTo(p, emptyEntry(p), 4)
      expect(entryText(p, applyText(p, entry, '99', PROMPT).entry, PROMPT)).toBe('___-99_')
    })

    it('reports one invalid for the whole paste when something was dropped', () => {
      const p = pattern('000-000')
      const result = applyText(p, emptyEntry(p), '1a', PROMPT)
      expect(result.invalid).toEqual({ reason: 'paste', input: '1a' })
    })

    it('reports nothing when everything was placed', () => {
      const p = pattern('000-000')
      expect(applyText(p, emptyEntry(p), '12', PROMPT).invalid).toBeUndefined()
    })

    it('leaves the caret alone when nothing was placed', () => {
      const p = pattern('000')
      const entry = caretTo(p, rawToEntry(p, '123'), 1)
      for (const text of ['x', '']) {
        const result = applyText(p, entry, text, PROMPT)
        expect(entryText(p, result.entry, PROMPT)).toBe('123')
        expect(result.entry.caret).toEqual({ start: 1, end: 1 })
      }
    })

    it('clears the range it replaces first', () => {
      const p = pattern('0000')
      const entry = selectRange(rawToEntry(p, '1234'), { start: 1, end: 3 })
      expect(entryText(p, applyText(p, entry, '9', PROMPT, { start: 1, end: 3 }).entry, PROMPT)).toBe('19_4')
    })
  })
})
