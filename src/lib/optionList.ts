// Option-list rules: ordering, filtering, summarising and select-all state for
// a closed-set multiple-choice field. Named for what it holds rather than for
// the component that consumes it — naming a lib/ module after one component is
// how src/lib/inputMask.ts came to be routinely confused with the InputMask
// component, and nothing here is specific to MultiSelect.
//
// Everything in this file is pure: no React, no DOM, no dates. The component's
// wiring lives in src/components/MultiSelect/.

export interface MultiSelectOption {
  // Committed, submitted, and the row's identity. Unique within `options`.
  value: string
  // What the row and the header display.
  label: string
}

// Drops later duplicates by `value`, first wins. A duplicate is a consumer
// bug, and the alternative — two rows whose checkboxes move together — is a
// worse way to report it than one row. Every other function in this module
// expects to be handed the result, so the de-dup happens once.
export function uniqueOptions(
  options: readonly MultiSelectOption[],
): readonly MultiSelectOption[] {
  const seen = new Set<string>()
  const result: MultiSelectOption[] = []
  for (const option of options) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    result.push(option)
  }
  return result.length === options.length ? options : result
}

// The canonical committed array: de-duplicated, values matching an option in
// `options` order, then values matching none in the order they arrived.
//
// Every array this module returns and every array the component hands to
// onChange passes through here, which is what makes canonical order a property
// of the value rather than a convention each call site has to remember. Two
// consequences worth knowing:
//
//   - Selection order is deliberately discarded. A summary header ("3 items
//     selected") never shows it, so an order the user cannot see is noise in a
//     submitted payload — and canonical order means checking three rows one at
//     a time and pressing select-all produce the identical array, so a consumer
//     comparing arrays for equality gets a stable answer.
//   - Unmatched values are *preserved*, not filtered out. `options` arriving
//     after `value` is ordinary (a form hydrating from a record while the option
//     list loads), so dropping them would destroy the user's data on first
//     render — and reporting that loss would need an onChange that receiving a
//     prop is not allowed to fire.
export function normalizeSelection(
  selected: readonly string[],
  options: readonly MultiSelectOption[],
): readonly string[] {
  const position = new Map<string, number>()
  uniqueOptions(options).forEach((option, index) => {
    position.set(option.value, index)
  })

  const matched: string[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const value of selected) {
    if (seen.has(value)) continue
    seen.add(value)
    if (position.has(value)) matched.push(value)
    else unmatched.push(value)
  }

  // Non-null assertions would be the obvious spelling here; `position.get`
  // cannot miss for a value that `position.has` just accepted. The library
  // bans them in component code and there is no reason to spend one here.
  matched.sort((first, second) => (position.get(first) ?? 0) - (position.get(second) ?? 0))
  return [...matched, ...unmatched]
}

// The options behind a committed array, in committed order, with unmatched
// values given back as `{ value, label: value }`.
//
// Substituting the value for the missing label rather than skipping the entry
// is what lets the header and a consumer's headerFormatter both count every
// checked value without either having to handle an absent option. It does mean
// a header can briefly show raw ids while `options` loads, which is the
// deliberate trade for not dropping them.
export function selectedOptions(
  selected: readonly string[],
  options: readonly MultiSelectOption[],
): readonly MultiSelectOption[] {
  const byValue = new Map<string, MultiSelectOption>()
  for (const option of uniqueOptions(options)) byValue.set(option.value, option)
  return normalizeSelection(selected, options).map(
    (value) => byValue.get(value) ?? { value, label: value },
  )
}

export interface HeaderOptions {
  // Used when more than `maxHeaderItems` are checked. `{count}` is substituted.
  headerFormat: string
  // Above this many checked options the header summarises instead of listing.
  maxHeaderItems: number
}

// A literal token, not a pattern: the reference API's default format is
// '{count:n0} items selected', where `:n0` is a culture number format this
// library has no engine for and will not add one for. Matching only the exact
// '{count}' leaves a copied '{count:n0}' visibly unsubstituted, so a consumer
// sees the mistake instead of losing the count to a silent regex.
const COUNT_TOKEN = '{count}'

// The header text: nothing checked is empty (so the field's placeholder shows
// through natively), up to maxHeaderItems is the labels, and beyond that is
// headerFormat with {count} substituted.
//
// maxHeaderItems === 0 falls into the count branch from the first checked
// option, which is the useful reading of zero and is why it needs no separate
// prop. With nothing checked both branches produce '' anyway, so the empty
// test being first is a shortcut rather than a precedence rule.
export function formatHeader(
  checked: readonly MultiSelectOption[],
  { headerFormat, maxHeaderItems }: HeaderOptions,
): string {
  if (checked.length === 0) return ''
  if (checked.length <= maxHeaderItems) return checked.map((option) => option.label).join(', ')
  return headerFormat.split(COUNT_TOKEN).join(String(checked.length))
}

export interface FilterOptions {
  caseSensitiveSearch: boolean
  // Replaces the default substring test entirely. Undefined means "not
  // supplied": there is no null to restore the default, because undefined
  // already means that everywhere in this library.
  customFilter?: (option: MultiSelectOption, filterText: string) => boolean
}

// Which options a filter leaves visible. An empty filter is not a query and
// returns the list unchanged.
//
// Case folding is locale-aware so it behaves for non-ASCII labels; Thai has no
// case and is unaffected either way. Note that `customFilter` receives the raw
// filter text and owns its own case handling — caseSensitiveSearch describes
// the default test, and silently pre-folding a consumer's input would take a
// decision that is theirs.
export function filterOptions(
  options: readonly MultiSelectOption[],
  filterText: string,
  { caseSensitiveSearch, customFilter }: FilterOptions,
): readonly MultiSelectOption[] {
  const unique = uniqueOptions(options)
  if (customFilter) return unique.filter((option) => customFilter(option, filterText))
  if (filterText === '') return unique
  if (caseSensitiveSearch) return unique.filter((option) => option.label.includes(filterText))
  const needle = filterText.toLocaleLowerCase()
  return unique.filter((option) => option.label.toLocaleLowerCase().includes(needle))
}

export type SelectAllState = 'checked' | 'unchecked' | 'mixed'

// Select-all's three-valued state against the *visible* rows only. An empty
// visible set reads 'unchecked', which is the state the control renders
// unavailable anyway.
export function selectAllState(
  visible: readonly MultiSelectOption[],
  selected: readonly string[],
): SelectAllState {
  if (visible.length === 0) return 'unchecked'
  const chosen = new Set(selected)
  let checkedCount = 0
  for (const option of visible) if (chosen.has(option.value)) checkedCount++
  if (checkedCount === 0) return 'unchecked'
  return checkedCount === visible.length ? 'checked' : 'mixed'
}

// Every function below takes the full `options` list as well as the subset it
// operates on, and the distinction is load-bearing rather than tidiness: the
// subset says *what to change*, `options` says *how to order the result*, and
// the two are different lists whenever a filter is applied. Given only the
// visible rows, normalizeSelection could not tell a matched value the filter is
// hiding from a value matching no option at all — it would sort every hidden
// match into the unmatched tail and silently reorder the committed array on
// each filter change.

// Check every visible row, or uncheck every visible row when all of them are
// already checked. Values outside `visible` are untouched, matched or not, so
// unchecking select-all under a filter does not empty the field.
export function applySelectAll(
  selected: readonly string[],
  visible: readonly MultiSelectOption[],
  state: SelectAllState,
  options: readonly MultiSelectOption[],
): readonly string[] {
  const visibleValues = new Set(visible.map((option) => option.value))
  if (state === 'checked') {
    return normalizeSelection(
      selected.filter((value) => !visibleValues.has(value)),
      options,
    )
  }
  return normalizeSelection([...selected, ...visibleValues], options)
}

// Add or remove one value. Compared with === rather than a locale-aware match:
// option values are consumer-controlled keys, where treating two distinct keys
// as equal because they differ only by an accent would be a defect, not a
// convenience. (InputTag matches its tags accent-insensitively because those
// are human-typed text.)
export function toggleValue(
  selected: readonly string[],
  value: string,
  options: readonly MultiSelectOption[],
): readonly string[] {
  const chosen = new Set(selected)
  if (chosen.has(value)) {
    return normalizeSelection(
      selected.filter((candidate) => candidate !== value),
      options,
    )
  }
  return normalizeSelection([...selected, value], options)
}

// Union, never a removal, whatever else is true. Kept separate from
// applySelectAll for exactly that reason: its caller must not be able to
// uncheck anything.
export function unionSelection(
  selected: readonly string[],
  add: readonly MultiSelectOption[],
  options: readonly MultiSelectOption[],
): readonly string[] {
  return normalizeSelection([...selected, ...add.map((option) => option.value)], options)
}

// Whether every option in `next` is also in `previous` — the test that decides
// whether a filter change narrowed.
//
// It is stated as a set relation because no property of the *edit* predicts the
// relation. "Every deletion widens the match set" is false: deleting the middle
// character of "abc" gives "ac", whose matches need not include "abc"'s at all,
// and replacing a selection does the same. A customFilter is an arbitrary
// predicate with no monotonic relationship to the text whatsoever and may match
// more options for a longer string. Membership answers all of those without any
// theory about editing; an equal set is a subset and commits nothing new.
export function isSubset(
  next: readonly MultiSelectOption[],
  previous: readonly MultiSelectOption[],
): boolean {
  const known = new Set(previous.map((option) => option.value))
  return next.every((option) => known.has(option.value))
}
