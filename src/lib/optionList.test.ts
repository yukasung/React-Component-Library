import { describe, expect, it } from 'vitest'
import {
  applySelectAll,
  filterOptions,
  formatHeader,
  isSubset,
  normalizeSelection,
  selectAllState,
  selectedOptions,
  toggleValue,
  unionSelection,
  uniqueOptions,
} from './optionList'
import type { MultiSelectOption } from './optionList'

const option = (value: string, label = value.toUpperCase()): MultiSelectOption => ({ value, label })

// A deliberately non-alphabetical list, so "options order" cannot be confused
// with "sorted" by a test that happens to pass either way.
const options: readonly MultiSelectOption[] = [
  option('th', 'Thailand'),
  option('us', 'United States'),
  option('gb', 'United Kingdom'),
  option('ae', 'United Arab Emirates'),
  option('jp', 'Japan'),
]

const header = { headerFormat: '{count} items selected', maxHeaderItems: 2 }
const filter = { caseSensitiveSearch: false }

describe('uniqueOptions', () => {
  it('drops later duplicates by value, first wins', () => {
    expect(uniqueOptions([option('a', 'first'), option('b'), option('a', 'second')])).toEqual([
      option('a', 'first'),
      option('b'),
    ])
  })

  it('returns the input unchanged when there are no duplicates', () => {
    expect(uniqueOptions(options)).toBe(options)
  })
})

describe('normalizeSelection', () => {
  it('returns options order, not selection order', () => {
    expect(normalizeSelection(['jp', 'th', 'gb'], options)).toEqual(['th', 'gb', 'jp'])
  })

  it('produces the same array whichever order the values arrived in', () => {
    const forwards = normalizeSelection(['th', 'us', 'gb'], options)
    const backwards = normalizeSelection(['gb', 'us', 'th'], options)
    expect(forwards).toEqual(backwards)
  })

  it('collapses duplicates', () => {
    expect(normalizeSelection(['us', 'us', 'th', 'us'], options)).toEqual(['th', 'us'])
  })

  it('is idempotent', () => {
    const once = normalizeSelection(['jp', 'th', 'zz', 'gb'], options)
    expect(normalizeSelection(once, options)).toEqual(once)
  })

  it('keeps values matching no option, after the matched ones', () => {
    expect(normalizeSelection(['zz', 'jp', 'th'], options)).toEqual(['th', 'jp', 'zz'])
  })

  it('keeps unmatched values in the order they arrived', () => {
    expect(normalizeSelection(['zz', 'us', 'yy'], options)).toEqual(['us', 'zz', 'yy'])
  })

  it('treats every value as unmatched when options is empty', () => {
    expect(normalizeSelection(['b', 'a'], [])).toEqual(['b', 'a'])
  })

  it('orders against the de-duplicated options list', () => {
    const duplicated = [option('th'), option('us'), option('th')]
    expect(normalizeSelection(['us', 'th'], duplicated)).toEqual(['th', 'us'])
  })
})

describe('selectedOptions', () => {
  it('returns the matched options in committed order', () => {
    expect(selectedOptions(['jp', 'th'], options)).toEqual([
      option('th', 'Thailand'),
      option('jp', 'Japan'),
    ])
  })

  it('labels an unmatched value with the value itself', () => {
    expect(selectedOptions(['zz', 'th'], options)).toEqual([
      option('th', 'Thailand'),
      { value: 'zz', label: 'zz' },
    ])
  })

  it('returns nothing for an empty selection', () => {
    expect(selectedOptions([], options)).toEqual([])
  })
})

describe('formatHeader', () => {
  const checked = (count: number) => selectedOptions(options.slice(0, count).map((o) => o.value), options)

  it('is empty with nothing checked', () => {
    expect(formatHeader(checked(0), header)).toBe('')
  })

  it('lists labels up to maxHeaderItems', () => {
    expect(formatHeader(checked(1), header)).toBe('Thailand')
    expect(formatHeader(checked(2), header)).toBe('Thailand, United States')
  })

  it('summarises beyond maxHeaderItems', () => {
    expect(formatHeader(checked(3), header)).toBe('3 items selected')
  })

  it('substitutes every occurrence of {count}', () => {
    expect(formatHeader(checked(3), { ...header, headerFormat: '{count} of many ({count})' }))
      .toBe('3 of many (3)')
  })

  it('leaves a culture-formatted token verbatim rather than dropping the count', () => {
    expect(formatHeader(checked(3), { ...header, headerFormat: '{count:n0} items selected' }))
      .toBe('{count:n0} items selected')
  })

  it('summarises from the first checked option when maxHeaderItems is 0', () => {
    expect(formatHeader(checked(1), { ...header, maxHeaderItems: 0 })).toBe('1 items selected')
  })

  it('is still empty with nothing checked and maxHeaderItems 0', () => {
    expect(formatHeader(checked(0), { ...header, maxHeaderItems: 0 })).toBe('')
  })

  it('uses an unmatched value as its own label', () => {
    expect(formatHeader(selectedOptions(['zz'], options), header)).toBe('zz')
  })
})

describe('filterOptions', () => {
  it('returns the list unchanged for an empty filter', () => {
    expect(filterOptions(options, '', filter)).toEqual(options)
  })

  it('matches a substring of the label, case-insensitively by default', () => {
    expect(filterOptions(options, 'united', filter).map((o) => o.value)).toEqual(['us', 'gb', 'ae'])
  })

  it('respects caseSensitiveSearch', () => {
    expect(filterOptions(options, 'united', { caseSensitiveSearch: true })).toEqual([])
    expect(filterOptions(options, 'United', { caseSensitiveSearch: true })).toHaveLength(3)
  })

  it('folds case for a non-ASCII label', () => {
    const accented = [option('de', 'Österreich')]
    expect(filterOptions(accented, 'österreich', filter)).toHaveLength(1)
  })

  it('leaves a Thai label unaffected by case folding', () => {
    const thai = [option('th', 'ประเทศไทย')]
    expect(filterOptions(thai, 'ไทย', filter)).toHaveLength(1)
  })

  it('preserves options order in the result', () => {
    expect(filterOptions(options, 'a', filter).map((o) => o.value)).toEqual(['th', 'us', 'ae', 'jp'])
  })

  it('lets customFilter replace the default test entirely', () => {
    const byValue = (o: MultiSelectOption, text: string) => o.value.startsWith(text)
    expect(filterOptions(options, 'j', { ...filter, customFilter: byValue }).map((o) => o.value))
      .toEqual(['jp'])
  })

  it('applies customFilter to an empty filter too, rather than short-circuiting', () => {
    const none = () => false
    expect(filterOptions(options, '', { ...filter, customFilter: none })).toEqual([])
  })
})

describe('selectAllState', () => {
  it('is unchecked when no visible row is selected', () => {
    expect(selectAllState(options, [])).toBe('unchecked')
  })

  it('is checked when every visible row is selected', () => {
    expect(selectAllState(options, options.map((o) => o.value))).toBe('checked')
  })

  it('is mixed when some are', () => {
    expect(selectAllState(options, ['th'])).toBe('mixed')
  })

  it('is unchecked for an empty visible set', () => {
    expect(selectAllState([], ['th'])).toBe('unchecked')
  })

  it('ignores selected values that are not visible', () => {
    const visible = filterOptions(options, 'japan', filter)
    expect(selectAllState(visible, ['th'])).toBe('unchecked')
    expect(selectAllState(visible, ['th', 'jp'])).toBe('checked')
  })
})

describe('applySelectAll', () => {
  const visible = () => filterOptions(options, 'united', filter)

  it('checks every visible row from unchecked', () => {
    expect(applySelectAll([], visible(), 'unchecked', options)).toEqual(['us', 'gb', 'ae'])
  })

  it('checks every visible row from mixed', () => {
    expect(applySelectAll(['gb'], visible(), 'mixed', options)).toEqual(['us', 'gb', 'ae'])
  })

  it('unchecks every visible row from checked', () => {
    expect(applySelectAll(['us', 'gb', 'ae'], visible(), 'checked', options)).toEqual([])
  })

  it('leaves values the filter hides alone when unchecking', () => {
    const selected = ['th', 'us', 'gb', 'ae', 'jp']
    expect(applySelectAll(selected, visible(), 'checked', options)).toEqual(['th', 'jp'])
  })

  it('leaves unmatched values alone in both directions', () => {
    expect(applySelectAll(['zz'], visible(), 'unchecked', options)).toEqual(['us', 'gb', 'ae', 'zz'])
    expect(applySelectAll(['us', 'gb', 'ae', 'zz'], visible(), 'checked', options)).toEqual(['zz'])
  })

  it('returns a canonically ordered array', () => {
    const result = applySelectAll(['jp'], options, 'mixed', options)
    expect(result).toEqual(['th', 'us', 'gb', 'ae', 'jp'])
  })
})

describe('toggleValue', () => {
  it('adds a value that is not selected', () => {
    expect(toggleValue(['th'], 'jp', options)).toEqual(['th', 'jp'])
  })

  it('removes a value that is', () => {
    expect(toggleValue(['th', 'jp'], 'th', options)).toEqual(['jp'])
  })

  it('inserts in options order rather than appending', () => {
    expect(toggleValue(['jp'], 'th', options)).toEqual(['th', 'jp'])
  })

  it('removes every copy of a duplicated value', () => {
    expect(toggleValue(['jp', 'th', 'jp'], 'jp', options)).toEqual(['th'])
  })

  it('compares by === and does not match on accent alone', () => {
    const accented = [option('resume'), option('résumé')]
    expect(toggleValue(['resume'], 'résumé', accented)).toEqual(['resume', 'résumé'])
  })

  it('can toggle a value matching no option', () => {
    expect(toggleValue(['th'], 'zz', options)).toEqual(['th', 'zz'])
    expect(toggleValue(['th', 'zz'], 'zz', options)).toEqual(['th'])
  })
})

describe('unionSelection', () => {
  it('adds the match set without removing anything', () => {
    expect(unionSelection(['jp'], filterOptions(options, 'united', filter), options))
      .toEqual(['us', 'gb', 'ae', 'jp'])
  })

  it('adds nothing when every match is already selected', () => {
    expect(unionSelection(['us', 'gb', 'ae'], filterOptions(options, 'united', filter), options))
      .toEqual(['us', 'gb', 'ae'])
  })

  it('never removes, even given an empty set to add', () => {
    expect(unionSelection(['th', 'zz'], [], options)).toEqual(['th', 'zz'])
  })
})

// The regression the options-plus-subset signature exists for: given only the
// visible rows, a matched value the filter hides is indistinguishable from a
// value matching no option, and would be sorted into the unmatched tail.
describe('a matched value the filter hides keeps its options position', () => {
  const visible = () => filterOptions(options, 'japan', filter)

  it('through toggleValue', () => {
    expect(toggleValue(['us', 'zz'], 'jp', options)).toEqual(['us', 'jp', 'zz'])
  })

  it('through applySelectAll', () => {
    expect(applySelectAll(['us', 'zz'], visible(), 'unchecked', options)).toEqual(['us', 'jp', 'zz'])
  })

  it('through unionSelection', () => {
    expect(unionSelection(['us', 'zz'], visible(), options)).toEqual(['us', 'jp', 'zz'])
  })
})

describe('isSubset', () => {
  const match = (text: string, custom?: FilterCustom) =>
    filterOptions(options, text, custom ? { ...filter, customFilter: custom } : filter)
  type FilterCustom = (o: MultiSelectOption, text: string) => boolean

  it('is true for a strictly smaller set', () => {
    expect(isSubset(match('united k'), match('united'))).toBe(true)
  })

  it('is true for an equal set', () => {
    expect(isSubset(match('united'), match('united'))).toBe(true)
  })

  it('is false for a larger set', () => {
    expect(isSubset(match('united'), match('united k'))).toBe(false)
  })

  it('is false for an overlapping set', () => {
    const previous = [option('a'), option('b')]
    const next = [option('b'), option('c')]
    expect(isSubset(next, previous)).toBe(false)
  })

  it('is false for a disjoint set', () => {
    expect(isSubset([option('c')], [option('a'), option('b')])).toBe(false)
  })

  it('is true only for the empty set when the previous set was empty', () => {
    expect(isSubset([], [])).toBe(true)
    expect(isSubset([option('a')], [])).toBe(false)
  })

  it('is true for the empty set against any previous set', () => {
    expect(isSubset([], options)).toBe(true)
  })

  // The case that makes membership, rather than the edit, authoritative: a
  // deletion is not necessarily a widening.
  it('rejects a deletion whose match set is not a subset', () => {
    const labelled = [option('x', 'abc'), option('y', 'ac')]
    const previous = filterOptions(labelled, 'abc', filter)
    const next = filterOptions(labelled, 'ac', filter)
    expect(previous.map((o) => o.value)).toEqual(['x'])
    expect(next.map((o) => o.value)).toEqual(['y'])
    expect(isSubset(next, previous)).toBe(false)
  })

  it('accepts a deletion whose match set happens to be a subset', () => {
    const labelled = [option('x', 'abc'), option('y', 'abcd')]
    const previous = filterOptions(labelled, 'abc', filter)
    const next = filterOptions(labelled, 'abcd', filter)
    expect(isSubset(next, previous)).toBe(true)
  })

  // A customFilter has no monotonic relationship to the filter text at all, so
  // no edit-shaped rule could have covered it.
  it('rejects a customFilter that matches more options for a shorter string', () => {
    // Labels of varying length, so "at least as long as the filter text" is a
    // predicate whose match set genuinely grows as the text shrinks.
    const varied = [option('a', 'xx'), option('b', 'xxx'), option('c', 'xxxx'), option('d', 'xxxxx')]
    const atLeastAsLong: FilterCustom = (o, text) => o.label.length >= text.length
    const custom = { ...filter, customFilter: atLeastAsLong }
    const previous = filterOptions(varied, 'xxxx', custom)
    const next = filterOptions(varied, 'xx', custom)
    expect(previous.map((o) => o.value)).toEqual(['c', 'd'])
    expect(next.map((o) => o.value)).toEqual(['a', 'b', 'c', 'd'])
    expect(isSubset(next, previous)).toBe(false)
  })
})
