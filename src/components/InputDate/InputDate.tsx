import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import 'flatpickr/dist/flatpickr.css'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import './flatpickr-theme.css'
import { useSyncedState } from '../../hooks/useSyncedState'
import { addDays, clampDate, formatDateValue, isSameDay, parseDateDraft, startOfDay, tokenizeDateMask } from '../../lib/date'
import { useInputMask } from '../../hooks/useInputMask'
import { selectAllOnFocus } from '../../lib/domSelection'
import { useFlatpickrCalendar } from './useFlatpickrCalendar'

// The offset added to a Gregorian year to display/accept Buddhist Era (พ.ศ.)
// years — flatpickr has no built-in era concept at all, this is entirely
// this library's own addition. See src/lib/date.ts's
// formatDateWithYearOffset/unshiftYearInDraft doc comments for the
// mechanism, and useFlatpickrCalendar's custom-year-control effect for why
// the calendar popup's own year-navigation header needs separate handling.
// The locale→offset mapping lives here; the flatpickr hook only consumes the
// resolved number.
const BUDDHIST_ERA_OFFSET = 543

export interface InputDateProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'required' | 'readOnly' | 'disabled'
  > {
  value?: Date | null
  defaultValue?: Date | null
  onChange?: (value: Date | null) => void
  min?: Date | null
  max?: Date | null
  // flatpickr's own dateFormat tokens (e.g. "Y-m-d", "F j, Y") — not
  // InputNumber's .NET-style tokens. See src/lib/date.ts's parseDateDraft
  // doc comment for a caveat: alphabetic month/weekday-name tokens (F/M/D/l)
  // can't be reliably typed back in, only displayed/picked from the popup.
  format?: string
  // 'th' switches month/weekday names to Thai AND years to Buddhist Era
  // (ค.ศ. + 543) together — both the text field and the calendar popup
  // itself, including its year-navigation header. Deliberately one combined
  // prop rather than independent language/era props, matching how Thai UIs
  // conventionally pair the two. Default 'en' matches existing behavior
  // exactly (Gregorian years, English names).
  locale?: 'en' | 'th'
  // Named to match Wijmo's InputDate API (isRequired), not the native
  // HTML/React convention — same rationale as InputNumber's isRequired.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  // Wijmo-style two-way binding for the raw text shown in the control,
  // distinct from `value` — same contract as InputNumber's text/onTextChange.
  text?: string
  onTextChange?: (text: string) => void
  // Day-step per wheel notch, opt-in + focus-gated, same convention as
  // InputNumber's handleWheel.
  handleWheel?: boolean
  closeOnSelection?: boolean
  showDropdownButton?: boolean
  monthCount?: number
}

// Layout ported from references/tailadmin-react/src/components/form/date-picker.tsx:
// the border, background and focus ring live on the <input> itself, and the
// calendar icon is an overlay positioned over its right edge — not a
// bordered button in its own cell beside it. Only the palette is
// translated: the reference's `brand-*` scale and `shadow-theme-xs` become
// this project's stock `blue-*` and `shadow-sm`.
const inputBaseClassName =
  'h-11 w-full appearance-none rounded-lg border px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-gray-400 focus:ring-3 dark:text-white/90 dark:placeholder:text-white/30'

function inputStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-500 opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
  if (isReadOnly) {
    return 'cursor-default border-gray-300 bg-gray-50 text-gray-800 focus:border-blue-300 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800/60 dark:focus:border-blue-800'
  }
  return 'border-gray-300 bg-transparent text-gray-800 focus:border-blue-300 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:focus:border-blue-800'
}

// Unlike the reference's icon — a `pointer-events-none` <span>, purely
// decorative there — this one opens the calendar, so it stays a real button
// and keeps its accessible name. Everything visual about it matches:
// centred on the input's right edge, no border, no cell of its own.
const dropdownButtonClassName =
  'absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:disabled:text-gray-700'

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export const InputDate = forwardRef<HTMLInputElement, InputDateProps>(function InputDate(
  {
    value,
    defaultValue = null,
    onChange,
    text,
    onTextChange,
    min = null,
    max = null,
    format = 'Y-m-d',
    isDisabled = false,
    isReadOnly = false,
    isRequired = true,
    handleWheel = false,
    closeOnSelection = true,
    showDropdownButton = true,
    monthCount = 1,
    locale = 'en',
    className,
    ...rest
  },
  ref,
) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<Date | null>(defaultValue)
  const [isFocused, setIsFocused] = useState(false)
  const [isOpenState, setIsOpenState] = useState(false)
  const committedValue = isControlled ? value : internalValue
  const yearOffset = locale === 'th' ? BUDDHIST_ERA_OFFSET : 0
  const flatpickrLocale = locale === 'th' ? Thai : undefined
  // Live-typing input mask (auto-inserts format separators, restricts each
  // digit segment to its valid range) — undefined for formats using
  // alphabetic name tokens (F/M/D/l), which opts every masking branch in
  // handleChange/handleKeyDown out automatically, since typed round-trip
  // through those tokens was already unsupported (see parseDateDraft's doc
  // comment in date.ts). Cheap to recompute every render (format strings
  // are ~10 chars), no useMemo needed.
  const maskSegments = tokenizeDateMask(format)
  // Required fields never display as blank — matches Wijmo's stated "default
  // is current date," but this is display-only, mirroring InputNumber's
  // `displayValue = isRequired && committedValue === null ? 0 : committedValue`.
  // It never forces an actual onChange the consumer didn't trigger;
  // defaultValue itself still defaults to null.
  const displayValue = isRequired && committedValue === null ? startOfDay(new Date()) : committedValue
  function formatDisplay(next: Date | null): string {
    return formatDateValue(next, format, yearOffset, flatpickrLocale)
  }
  const formattedValue = formatDisplay(displayValue)
  const [draft, setDraft] = useSyncedState(text !== undefined ? text : formattedValue)
  function updateDraft(next: string) {
    if (next !== draft) onTextChange?.(next)
    setDraft(next)
  }
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // The React half of the live-typing mask — the auto-advance timeout and
  // the cursor bookkeeping that drives src/lib/inputMask.ts. Shared with
  // InputTime; see the hook's own doc comment.
  const mask = useInputMask({ segments: maskSegments, draft, setDraft: updateDraft, inputRef: inputElementRef })

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(start, end)
      pendingSelectionRef.current = null
    }
  })

  function datesEqual(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b
    return isSameDay(a, b)
  }

  function commit(next: Date | null) {
    const changed = !datesEqual(next, lastCommittedRef.current)
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    updateDraft(formatDisplay(next))
  }

  function commitDraft() {
    if (isReadOnly) return
    mask.clearPendingAdvance()
    // No flush-before-parse needed here — confirmed empirically that
    // flatpickr's own parseDate already accepts a bare, not-yet-finalized
    // 1-2 digit day/month value exactly like a fully-flushed one (it
    // doesn't know or care about this module's internal "ambiguous, still
    // open" bookkeeping, only the literal text), so blurring or pressing
    // Enter before AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS elapses already
    // parses the same way either way.
    const parsed = parseDateDraft(draft, format, yearOffset, flatpickrLocale)
    if (parsed === undefined || (isRequired && parsed === null)) {
      updateDraft(formattedValue)
      return
    }
    commit(parsed === null ? null : clampDate(parsed, min, max))
  }

  // Day-stepping is unconditional (unlike InputNumber's step-gated Arrow
  // behavior) — Wijmo's default day-stepping isn't opt-in, there's no
  // `step` prop for InputDate at all.
  function stepBy(direction: 1 | -1) {
    const parsed = parseDateDraft(draft, format, yearOffset, flatpickrLocale)
    const base = parsed ?? committedValue ?? min ?? startOfDay(new Date())
    commit(clampDate(addDays(base, direction), min, max))
  }

  // All flatpickr integration (instance lifecycle, prop-sync effects, the
  // Buddhist-Era custom year-header control, value/open-state syncs) lives in
  // this hook — see useFlatpickrCalendar.ts. It renders nothing itself; it
  // returns the React-opaque container div ref the popup mounts into and a
  // toggle() for the dropdown button. onPick/onOpenChange are kept
  // latest-in-a-ref inside the hook, so passing plain closures here is fine.
  const { containerRef, toggle } = useFlatpickrCalendar({
    format,
    min,
    max,
    closeOnSelection,
    monthCount,
    locale,
    flatpickrLocale,
    yearOffset,
    committedValue,
    onPick: commit,
    // Internal only — the popup's open state never leaves the component;
    // this just keeps aria-expanded in step with it.
    onOpenChange: setIsOpenState,
  })

  function handleToggleDropdown() {
    if (isDisabled || isReadOnly) return
    toggle()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    // Live-typing mask (auto-inserted separators, per-segment digit ranges,
    // the ambiguous-digit auto-advance) — null means the edit was rejected
    // and the draft should stay as it is.
    const next = mask.maskChange(el, el.value)
    if (next === null) return
    if (isRequired && next.trim() === '') {
      // Required fields can't sit empty even mid-edit — snap immediately
      // (not just on blur) to today's formatted date and select it so the
      // next keystroke naturally overwrites it, matching InputNumber's
      // immediate-empty-block behavior.
      const todayText = formatDisplay(startOfDay(new Date()))
      updateDraft(todayText)
      pendingSelectionRef.current = { start: 0, end: todayText.length }
      return
    }
    updateDraft(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitDraft()
    } else if (event.key === 'Escape') {
      mask.clearPendingAdvance()
      updateDraft(formattedValue)
    } else if (event.key === 'ArrowUp' && !isReadOnly) {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown' && !isReadOnly) {
      event.preventDefault()
      stepBy(-1)
    } else if (!isReadOnly) {
      // Two-press skip-then-delete over an auto-inserted separator,
      // mirroring InputNumber's own decimal-point-skip convention — see
      // useInputMask.handleDeleteKey.
      mask.handleDeleteKey(event)
    }
  }

  // React's synthetic onWheel is attached passively, so preventDefault()
  // inside it silently fails — a real native listener with
  // { passive: false } is required, same as InputNumber's handleWheel.
  const handleWheelRef = useRef<(event: globalThis.WheelEvent) => void>(() => {})
  handleWheelRef.current = (event) => {
    if (!handleWheel || !isFocused || isDisabled || isReadOnly) return
    event.preventDefault()
    stepBy(event.deltaY < 0 ? 1 : -1)
  }

  useEffect(() => {
    const node = inputElementRef.current
    if (!node) return
    function listener(event: globalThis.WheelEvent) {
      handleWheelRef.current(event)
    }
    node.addEventListener('wheel', listener, { passive: false })
    return () => node.removeEventListener('wheel', listener)
  }, [])

  return (
    <div className="relative">
      <input
        {...rest}
        ref={(node) => {
          inputElementRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        type="text"
        disabled={isDisabled}
        readOnly={isReadOnly}
        required={isRequired}
        // Combobox-with-popup pattern (calendar dropdown), not a
        // spinbutton like InputNumber.
        role="combobox"
        aria-expanded={isOpenState}
        aria-haspopup="dialog"
        aria-autocomplete="none"
        value={draft}
        onChange={handleChange}
        onFocus={(event) => {
          setIsFocused(true)
          // Dates are usually edited as a whole value rather than
          // character-by-character — selecting everything on focus lets
          // the user just start typing to replace it. Deferred (see
          // selectAllOnFocus's own doc comment) — a synchronous
          // .select() here doesn't reliably work in WebKit/Safari.
          selectAllOnFocus(event.currentTarget)
        }}
        onBlur={() => {
          setIsFocused(false)
          commitDraft()
        }}
        onKeyDown={handleKeyDown}
        // The icon overlays the input's right edge rather than sitting
        // beside it, so the text needs room to stop short of it — the
        // reference has no such padding because its own icon is
        // decorative and its field is never long enough to reach it.
        className={`${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${showDropdownButton ? 'pr-11' : ''} ${className ?? ''}`}
      />
      {showDropdownButton && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Toggle calendar"
          disabled={isDisabled || isReadOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleDropdown}
          className={dropdownButtonClassName}
        >
          <CalendarIcon />
        </button>
      )}
      {/* React-opaque host for flatpickr's popup — see the DOM-ownership
          escape-hatch note above; must stay empty in JSX. */}
      <div ref={containerRef} className="absolute inset-x-0 bottom-0 h-0 w-0" aria-hidden="true" />
    </div>
  )
})
