// The class names InputDateTime renders with. Kept in the component's own
// folder rather than shared with InputDate/InputTime — those two hold their own
// copies on purpose (see CLAUDE.md), and this is the same arrangement, not a
// first step towards one shared stylesheet module. Split from icons.tsx because
// a file exporting both components and plain values breaks Fast Refresh.

// Layout ported from references/tailadmin-react/src/components/form/date-picker.tsx:
// the border, background and focus ring live on the <input> itself, and the
// icons are overlays positioned over its right edge — not bordered buttons in
// cells beside it.
export const inputBaseClassName =
  'h-11 w-full appearance-none rounded-lg border px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-gray-400 focus:ring-3 dark:text-white/90 dark:placeholder:text-white/30'

export function inputStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-500 opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
  if (isReadOnly) {
    return 'cursor-default border-gray-300 bg-gray-50 text-gray-800 focus:border-[var(--rc-color-primary,#465fff)] focus:ring-[color-mix(in_srgb,var(--rc-color-primary,#465fff)_20%,transparent)] dark:border-gray-700 dark:bg-gray-800/60 dark:focus:border-[var(--rc-color-primary,#465fff)]'
  }
  return 'border-gray-300 bg-transparent text-gray-800 focus:border-[var(--rc-color-primary,#465fff)] focus:ring-[color-mix(in_srgb,var(--rc-color-primary,#465fff)_20%,transparent)] dark:border-gray-700 dark:bg-gray-900 dark:focus:border-[var(--rc-color-primary,#465fff)]'
}

// The two buttons share one right-edge cluster rather than each positioning
// itself, so the gap between them can't drift apart from the padding the text
// stops at (see inputPaddingClassName below).
export const dropdownButtonsClassName = 'absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1'

// No hover treatment, matching InputDate/InputTime and the reference they came
// from — an icon holds one gray at rest and only changes when disabled.
export const dropdownButtonClassName =
  'text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:disabled:text-gray-700'

// The icons overlay the input's right edge rather than sitting beside it, so
// the text needs room to stop short of them — two icons need twice the room.
export function inputPaddingClassName(buttonCount: number): string {
  if (buttonCount >= 2) return 'pr-18'
  return buttonCount === 1 ? 'pr-11' : ''
}

// Mirrors the calendar popup's own surface treatment (flatpickr-theme.css), as
// InputTime's list does, so both popups on this one field read as one design.
export const listClassName =
  'absolute inset-x-0 top-full z-50 mt-2 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/5 dark:bg-gray-900'

// Hover is styled rather than tracked — see InputTime's copy for why the
// keyboard highlight is state and the pointer one isn't.
export function optionClassName(isSelected: boolean, isHighlighted: boolean): string {
  const base = 'cursor-pointer px-3 py-1.5 text-sm'
  if (isSelected) return `${base} bg-[var(--rc-color-primary,#465fff)] font-medium text-white`
  const hover = 'hover:bg-gray-100 dark:hover:bg-white/5'
  if (isHighlighted) return `${base} ${hover} bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90`
  return `${base} ${hover} text-gray-700 dark:text-gray-300`
}
