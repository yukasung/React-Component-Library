// Class strings for MultiSelect, kept out of the markup so the component file
// reads as structure and behaviour. Same split as InputDateTime/styles.ts.
//
// Two rules about this file, both of which fail silently if broken:
//
//   - Every class here has to be reachable by
//     scripts/generate-scalar-styles.mjs, which scans a fixed list of files —
//     this one included. A class that moves into a file not on that list is
//     never compiled, and the control renders unstyled while every test passes.
//   - Arbitrary-value classes are written out in full, never interpolated.
//     Tailwind scans this file as *text*, so a `border-[${PRIMARY}]` template
//     would be read literally, match no utility, and compile to nothing.

// The field's own <input>. `truncate` is load-bearing: text-overflow initially
// computes to `clip`, so a long header would be cut without an ellipsis.
export function fieldClasses({
  isDisabled,
  isReadOnly,
}: {
  isDisabled: boolean
  isReadOnly: boolean
}): string {
  return [
    'h-11 w-full truncate bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-hidden',
    'placeholder:text-gray-400 dark:text-white/90 dark:placeholder:text-white/30',
    isDisabled ? 'cursor-not-allowed text-gray-500 dark:text-gray-400' : '',
    isReadOnly && !isDisabled ? 'cursor-default' : '',
    !isDisabled && !isReadOnly ? 'cursor-pointer' : '',
  ].join(' ')
}

// The bordered wrapper that carries the focus ring.
//
// `isFocused` is component state, not a `focus-within:` variant: a portalled
// popup is not inside this wrapper's DOM subtree, so `:focus-within` would drop
// the ring exactly when `portal` is true. A React portal forwards events through
// the React tree; it does not change the DOM tree, which is what CSS resolves
// against.
export function surfaceClasses({
  isDisabled,
  isReadOnly,
  isFocused,
}: {
  isDisabled: boolean
  isReadOnly: boolean
  isFocused: boolean
}): string {
  return [
    'relative flex w-full items-center rounded-lg border text-sm shadow-theme-xs transition',
    isDisabled
      ? 'cursor-not-allowed border-gray-300 bg-gray-100 opacity-40 dark:border-gray-700 dark:bg-gray-800'
      : isReadOnly
        ? 'cursor-default border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
        : 'border-gray-300 bg-transparent dark:border-gray-700 dark:bg-gray-900',
    isFocused && !isDisabled
      ? 'border-[var(--rc-color-primary,#465fff)] ring-3 ring-[color-mix(in_srgb,var(--rc-color-primary,#465fff)_20%,transparent)]'
      : '',
  ].join(' ')
}

export const dropdownButtonClasses =
  'flex shrink-0 items-center px-3 text-gray-500 disabled:cursor-not-allowed dark:text-gray-400'

export const filterInputClasses =
  'm-2 h-10 shrink-0 rounded-md border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-hidden placeholder:text-gray-400 focus:border-[var(--rc-color-primary,#465fff)] dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30'

export function selectAllClasses(isUnavailable: boolean): string {
  return `flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2 text-sm text-gray-800 dark:border-gray-800 dark:text-white/90 ${
    isUnavailable ? 'opacity-40' : 'cursor-pointer'
  }`
}

export const selectAllCheckboxClasses = 'size-4 accent-[var(--rc-color-primary,#465fff)]'

// min-h-0 plus flex-1 is what lets the popup's flex column give this element the
// space left over after the filter input and select-all, so those stay visible
// while only the rows scroll.
export const listboxClasses = 'min-h-0 flex-1 overflow-y-auto outline-hidden'

export function optionRowClasses(isActive: boolean): string {
  return `flex cursor-pointer items-start gap-2 px-4 py-2 text-sm text-gray-800 dark:text-white/90 ${
    isActive ? 'bg-gray-100 dark:bg-gray-800' : ''
  }`
}

export function optionCheckClasses(isSelected: boolean): string {
  return `mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
    isSelected
      ? 'border-[var(--rc-color-primary,#465fff)] bg-[var(--rc-color-primary,#465fff)] text-white'
      : 'border-gray-300 dark:border-gray-600'
  }`
}

export const optionLabelClasses = 'break-words'

export const chevronClasses = 'size-5 transition-transform'
export const chevronOpenClasses = 'rotate-180'
export const checkIconClasses = 'size-3'
export const rootClasses = 'rc-scalar relative w-full'
