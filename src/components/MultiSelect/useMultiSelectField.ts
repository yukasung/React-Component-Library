import { useState } from 'react'
import {
  applySelectAll,
  formatHeader,
  isSubset,
  normalizeSelection,
  selectedOptions,
  toggleValue,
  unionSelection,
  uniqueOptions,
} from '../../lib/optionList'
import type { MultiSelectOption, SelectAllState } from '../../lib/optionList'

// Everything that works on the *value* alone: the controlled/uncontrolled pair,
// the commit, and the header derived from it. Same split as
// InputDateTime/useDateTimeField.ts — the popup's own state lives in
// useOptionDropdown, and the component coordinates the two.
//
// This hook deliberately knows nothing about the popup. It takes the visible set
// as an argument wherever a rule needs it rather than reaching for the dropdown,
// which is what keeps "a filter never changes the value" true by construction:
// there is no path from here to the filter text.

export interface UseMultiSelectFieldOptions {
  options: readonly MultiSelectOption[]
  value?: readonly string[]
  defaultValue: readonly string[]
  onChange?: (value: readonly string[]) => void
  isDisabled: boolean
  isReadOnly: boolean
  headerFormat: string
  headerFormatter?: (checked: readonly MultiSelectOption[]) => string
  maxHeaderItems: number
}

export interface UseMultiSelectFieldResult {
  // De-duplicated by value, first wins. Everything else is derived from this
  // rather than from the raw `options` prop.
  allOptions: readonly MultiSelectOption[]
  // Canonical: options order, duplicates collapsed, unmatched values last.
  selected: readonly string[]
  // The text the field displays. Derived every render, never stored.
  header: string
  toggle: (option: MultiSelectOption) => void
  selectAll: (visible: readonly MultiSelectOption[], state: SelectAllState) => void
  // checkOnFilter's gate 2 and its commit. Returns nothing: whether it committed
  // is not something a caller should branch on.
  unionIfNarrowed: (
    nextMatches: readonly MultiSelectOption[],
    previousMatches: readonly MultiSelectOption[],
  ) => void
}

export function useMultiSelectField({
  options,
  value,
  defaultValue,
  onChange,
  isDisabled,
  isReadOnly,
  headerFormat,
  headerFormatter,
  maxHeaderItems,
}: UseMultiSelectFieldOptions): UseMultiSelectFieldResult {
  const allOptions = uniqueOptions(options)
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<readonly string[]>(() =>
    normalizeSelection(defaultValue, options),
  )

  // Normalised on *read*, not on receipt: a `value` prop may arrive in any order
  // and with duplicates, and everything downstream — the header, the hidden
  // inputs, the committed array — has to be canonical. Doing it here rather than
  // in each consumer keeps the ordering a property of the value instead of
  // something five call sites remember. It fires no onChange, so receiving a
  // prop still never commits.
  const selected = normalizeSelection(isControlled ? value : internalValue, allOptions)

  const checked = selectedOptions(selected, allOptions)
  const header = headerFormatter
    ? headerFormatter(checked)
    : formatHeader(checked, { headerFormat, maxHeaderItems })

  const commit = (next: readonly string[]) => {
    if (isDisabled || isReadOnly) return
    const normalized = normalizeSelection(next, allOptions)
    if (!isControlled) setInternalValue(normalized)
    onChange?.(normalized)
  }

  const toggle = (option: MultiSelectOption) => {
    commit(toggleValue(selected, option.value, allOptions))
  }

  const selectAll = (visible: readonly MultiSelectOption[], state: SelectAllState) => {
    if (visible.length === 0) return
    commit(applySelectAll(selected, visible, state, allOptions))
  }

  // Gate 2 of checkOnFilter. Gate 1 — that a user edited the filter — is the
  // caller's, because only the call site can tell a user edit from a
  // programmatic clear.
  //
  // Membership decides, never a property of the keystroke: "every deletion
  // widens the match set" is false (deleting the middle of "abc" gives "ac",
  // whose matches can be disjoint), and a customFilter has no monotonic
  // relationship to the text at all.
  const unionIfNarrowed = (
    nextMatches: readonly MultiSelectOption[],
    previousMatches: readonly MultiSelectOption[],
  ) => {
    if (!isSubset(nextMatches, previousMatches)) return
    const union = unionSelection(selected, nextMatches, allOptions)
    // A match set that adds nothing new must not emit a run of identical arrays
    // while a key is held down.
    if (union.length !== selected.length) commit(union)
  }

  return { allOptions, selected, header, toggle, selectAll, unionIfNarrowed }
}
