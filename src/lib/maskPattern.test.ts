import { describe, expect, it } from 'vitest'
import {
  acceptsCluster,
  applyCase,
  deriveInputMode,
  isStorableCluster,
  resolvePattern,
  resolvePromptChar,
  splitClusters,
  tokenizeMask,
} from './maskPattern'
import type { MaskClass, MaskPattern, MaskPosition } from './maskPattern'

function pattern(mask: string): MaskPattern {
  const result = tokenizeMask(mask)
  if (!result) throw new Error(`mask did not tokenize: ${mask}`)
  return result
}

// The shape of a tokenized mask, as a compact string: one character per
// fillable position's class, and a literal's text in brackets.
function shape(mask: string): string {
  return pattern(mask)
    .positions.map((position) => (position.type === 'literal' ? `[${position.text}]` : position.maskClass))
    .join('')
}

function fillable(maskClass: MaskClass): MaskPosition {
  return { type: 'fillable', maskClass, required: false, caseMode: 'none' }
}

describe('tokenizeMask', () => {
  it('splits class characters from literals', () => {
    expect(shape('000-00-0000')).toBe('000[-]00[-]0000')
    expect(shape('(999) 000-0000')).toBe('[(]999[)][ ]000[-]0000')
  })

  it('marks 0, L and A required and 9, #, l, a optional', () => {
    const required = pattern('0LA').positions.map((p) => p.type === 'fillable' && p.required)
    expect(required).toEqual([true, true, true])
    const optional = pattern('9#la').positions.map((p) => p.type === 'fillable' && p.required)
    expect(optional).toEqual([false, false, false, false])
  })

  it('counts rendered width and fillable positions separately', () => {
    const p = pattern('00\\000')
    expect(p.renderedWidth).toBe(5)
    expect(p.fillableCount).toBe(4)
    expect(p.fillableIndices).toEqual([0, 1, 3, 4])
  })

  describe('escapes', () => {
    it('turns the escaped character into a literal, including a class character', () => {
      expect(shape('00\\000')).toBe('00[0]00')
      expect(shape('\\L\\A')).toBe('[L][A]')
    })

    it('escapes a case token', () => {
      expect(shape('\\>L')).toBe('[>]L')
    })

    it('returns undefined for a trailing backslash rather than throwing', () => {
      expect(tokenizeMask('000\\')).toBeUndefined()
      expect(() => tokenizeMask('000\\')).not.toThrow()
    })
  })

  describe('case conversion', () => {
    it('applies > and < to the positions that follow, and | ends it', () => {
      const modes = pattern('L>L<L|L').positions.map((p) => p.type === 'fillable' && p.caseMode)
      expect(modes).toEqual(['none', 'upper', 'lower', 'none'])
    })

    it('occupies no rendered position', () => {
      expect(pattern('>LL').renderedWidth).toBe(2)
      expect(pattern('>L<L|').renderedWidth).toBe(2)
    })
  })

  describe('characters that are literals rather than tokens', () => {
    // The reference API reads these against a global culture. This library
    // deliberately has none, so they are plain separators.
    it('treats . , : / $ as plain literals', () => {
      expect(shape('00/00/0000')).toBe('00[/]00[/]0000')
      expect(shape('0.0,0:0$0')).toBe('0[.]0[,]0[:]0[$]0')
    })

    it('treats the out-of-scope DBCS tokens as literals', () => {
      expect(shape('LJGKNZH')).toBe('L[J][G][K][N][Z][H]')
    })
  })
})

describe('resolvePattern', () => {
  it('returns null for an absent, empty or untokenizable mask', () => {
    expect(resolvePattern(undefined)).toBeNull()
    expect(resolvePattern('')).toBeNull()
    expect(resolvePattern('000\\')).toBeNull()
  })

  it('returns null for a mask that tokenizes to nothing', () => {
    expect(resolvePattern('><|')).toBeNull()
  })

  // "--" tokenizes into two literals, leaving a field that refuses every
  // keystroke for want of somewhere to put it and reports itself empty
  // forever. That is a field with nothing to fill in.
  it('returns null for a mask with no fillable positions', () => {
    expect(tokenizeMask('--')?.positions).toHaveLength(2)
    expect(resolvePattern('--')).toBeNull()
    expect(resolvePattern('\\0')).toBeNull()
  })

  it('returns a pattern for a usable mask', () => {
    expect(resolvePattern('000')?.fillableCount).toBe(3)
  })
})

describe('acceptsCluster', () => {
  const cases: { maskClass: MaskClass; accepts: string[]; refuses: string[] }[] = [
    { maskClass: '0', accepts: ['0', '7'], refuses: [' ', 'a', '+', '-'] },
    { maskClass: '9', accepts: ['0', '7', ' '], refuses: ['a', '+', '-'] },
    { maskClass: '#', accepts: ['0', '7', ' ', '+', '-'], refuses: ['a', '/'] },
    { maskClass: 'L', accepts: ['a', 'Z', 'ก'], refuses: ['0', ' ', '-'] },
    { maskClass: 'l', accepts: ['a', 'Z', 'ก', ' '], refuses: ['0', '-'] },
    { maskClass: 'A', accepts: ['a', 'Z', 'ก', '0'], refuses: [' ', '-'] },
    { maskClass: 'a', accepts: ['a', 'Z', 'ก', '0', ' '], refuses: ['-', '/'] },
  ]

  for (const { maskClass, accepts, refuses } of cases) {
    it(`${maskClass} accepts ${accepts.join(' ')} and refuses ${refuses.join(' ')}`, () => {
      for (const cluster of accepts) {
        expect(acceptsCluster(fillable(maskClass), cluster)).toBe(true)
      }
      for (const cluster of refuses) {
        expect(acceptsCluster(fillable(maskClass), cluster)).toBe(false)
      }
    })
  }

  // Letters are Unicode so the letter classes work in any script; digits are
  // ASCII because they hold the numbers inside an identifier.
  it('accepts a Thai letter but refuses a Thai digit', () => {
    expect(acceptsCluster(fillable('L'), 'ก')).toBe(true)
    expect(acceptsCluster(fillable('A'), 'ก')).toBe(true)
    for (const maskClass of ['0', '9', '#', 'A', 'a'] as const) {
      expect(acceptsCluster(fillable(maskClass), '\u0E50')).toBe(false)
    }
  })

  // Classification goes by the base, so "1" plus a Thai vowel is one cluster
  // whose base is a digit. Accepting it would put a non-ASCII cluster into
  // the raw value the digit classes are ASCII to keep clean.
  it('refuses a decorated digit wherever the cluster comes from', () => {
    for (const maskClass of ['0', '9', '#', 'A', 'a'] as const) {
      expect(acceptsCluster(fillable(maskClass), '1\u0E34')).toBe(false)
    }
  })

  it('still accepts a decorated letter', () => {
    expect(acceptsCluster(fillable('L'), 'กิ๊')).toBe(true)
    expect(acceptsCluster(fillable('A'), 'กิ๊')).toBe(true)
  })

  it('never accepts anything into a literal position', () => {
    expect(acceptsCluster({ type: 'literal', text: '-' }, '-')).toBe(false)
  })
})

describe('grapheme clusters', () => {
  it('keeps a Thai base and its marks together as one cluster', () => {
    expect(splitClusters('กิ๊')).toEqual(['กิ๊'])
    expect(splitClusters('ที่')).toEqual(['ที่'])
  })

  // A Thai reader sees one syllable; the mask counts clusters, and the
  // leading vowel is a base character in its own right.
  it('splits a leading-vowel syllable into separate clusters', () => {
    expect(splitClusters('เกี๊ยว')).toEqual(['เ', 'กี๊', 'ย', 'ว'])
  })

  it('accepts a base with two nonspacing marks, which ordinary Thai needs', () => {
    expect(isStorableCluster('กิ๊')).toBe(true)
    expect(isStorableCluster('ที่')).toBe(true)
    expect(acceptsCluster(fillable('L'), 'กิ๊')).toBe(true)
    expect(acceptsCluster(fillable('A'), 'ที่')).toBe(true)
  })

  it('refuses a spacing combining mark', () => {
    // Devanagari sign AA (U+093E) is Mc — it adds advance width.
    const spacing = 'का'
    expect(isStorableCluster(spacing)).toBe(false)
    expect(acceptsCluster(fillable('L'), spacing)).toBe(false)
  })

  it('refuses a ZWJ sequence', () => {
    const zwj = 'क‍ख'
    expect(isStorableCluster(zwj)).toBe(false)
    expect(acceptsCluster(fillable('L'), zwj)).toBe(false)
  })

  it('refuses a ninth stacked code point', () => {
    const marks = 'ิ'.repeat(7)
    expect(isStorableCluster(`ก${marks}`)).toBe(true)
    expect(isStorableCluster(`ก${marks}ิ`)).toBe(false)
  })
})

describe('applyCase', () => {
  it('converts when the cluster count is unchanged', () => {
    expect(applyCase('a', 'upper')).toBe('A')
    expect(applyCase('Z', 'lower')).toBe('z')
  })

  it('leaves the cluster alone when no conversion is configured', () => {
    expect(applyCase('a', 'none')).toBe('a')
  })

  // "ß" upper-cases to "SS": two clusters for one position.
  it('skips a conversion that would take two clusters', () => {
    expect(applyCase('ß', 'upper')).toBe('ß')
  })

  // "ᾳ" upper-cases to "ΑΙ" — also two clusters, and also refused. Kept
  // alongside "ß" because it is the case a naive "always convert" fix passes
  // while still overflowing the position.
  it('skips a conversion that takes two clusters from one code point', () => {
    expect('ᾳ'.toUpperCase()).toBe('ΑΙ')
    expect(applyCase('ᾳ', 'upper')).toBe('ᾳ')
  })

  // "İ" lower-cases to "i̇": two code points, still one cluster, so it fits
  // the position and must be applied. Counting code points refuses it.
  it('applies a conversion that grows in code points but stays one cluster', () => {
    expect(Array.from('İ'.toLowerCase())).toHaveLength(2)
    expect(splitClusters('İ'.toLowerCase())).toHaveLength(1)
    expect(applyCase('İ', 'lower')).toBe('İ'.toLowerCase())
  })

  it('leaves Thai unchanged, having no case', () => {
    expect(applyCase('ก', 'upper')).toBe('ก')
    expect(applyCase('กิ๊', 'lower')).toBe('กิ๊')
  })
})

describe('resolvePromptChar', () => {
  it('defaults to _', () => {
    expect(resolvePromptChar(pattern('00'), undefined)).toBe('_')
  })

  it('falls back when the prompt is not exactly one cluster', () => {
    expect(resolvePromptChar(pattern('00'), '')).toBe('_')
    expect(resolvePromptChar(pattern('00'), '--')).toBe('_')
  })

  it('keeps a multi-code-point cluster that is still one cluster', () => {
    expect(resolvePromptChar(pattern('00'), 'กิ๊')).toBe('กิ๊')
  })

  // A lone combining mark is one cluster by itself, but two of them in a row
  // are also one cluster — so rendering it into two positions would make the
  // field one cluster narrower than it has positions, and every caret offset
  // would be unmappable.
  it('falls back when the prompt merges with whatever is beside it', () => {
    expect(splitClusters('\u0E34')).toHaveLength(1)
    expect(splitClusters('\u0E34\u0E34')).toHaveLength(1)
    expect(resolvePromptChar(pattern('00'), '\u0E34')).toBe('_')
  })

  it('falls back for a zero-width joiner, which merges the same way', () => {
    expect(resolvePromptChar(pattern('00'), '\u200D')).toBe('_')
  })

  it('keeps the rendered width equal to the position count for a kept prompt', () => {
    const prompt = resolvePromptChar(pattern('00-00'), 'กิ๊')
    const rendered = `${prompt}${prompt}-${prompt}${prompt}`
    expect(splitClusters(rendered)).toHaveLength(pattern('00-00').renderedWidth)
  })

  // The round-trip guard: a "0" prompt on a digit mask makes an empty field
  // indistinguishable from one holding zeros.
  it('falls back when the mask would accept the prompt as data', () => {
    expect(resolvePromptChar(pattern('00'), '0')).toBe('_')
    expect(resolvePromptChar(pattern('99'), ' ')).toBe('_')
    expect(resolvePromptChar(pattern('LL'), 'a')).toBe('_')
  })

  it('keeps a prompt no position of this mask accepts', () => {
    expect(resolvePromptChar(pattern('LL'), '0')).toBe('0')
    expect(resolvePromptChar(pattern('00'), '#')).toBe('#')
  })

  it('checks only fillable positions, not literals', () => {
    expect(resolvePromptChar(pattern('LL-LL'), '-')).toBe('-')
  })

  it('accepts any single cluster when there is no mask', () => {
    expect(resolvePromptChar(null, '0')).toBe('0')
    expect(resolvePromptChar(null, undefined)).toBe('_')
  })
})

describe('deriveInputMode', () => {
  it('is numeric when every fillable position takes digits only', () => {
    expect(deriveInputMode(pattern('000-0000'))).toBe('numeric')
    expect(deriveInputMode(pattern('(999) 000-0000'))).toBe('numeric')
  })

  // "#" accepts + and -, which a numeric keypad does not offer.
  it('is text when the mask contains #', () => {
    expect(deriveInputMode(pattern('+66 #########'))).toBe('text')
  })

  it('is text for letter classes', () => {
    expect(deriveInputMode(pattern('LL-0000'))).toBe('text')
    expect(deriveInputMode(pattern('AAAA'))).toBe('text')
  })

  it('is text when unmasked', () => {
    expect(deriveInputMode(null)).toBe('text')
  })
})
