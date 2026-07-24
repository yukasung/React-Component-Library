import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import 'flatpickr/dist/flatpickr.css'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import './flatpickr-theme.css'
import { useSyncedState } from '../../hooks/useSyncedState'
import { addDays, clampDate, formatDateValue, isSameDay, parseDateDraft, startOfDay, tokenizeDateMask } from '../../lib/date'
import { applyDateMask, diffStrings, isLiteralCharAt, pendingAdvanceAtCursor } from '../../lib/dateMask'
import { applySelection, selectAllOnFocus } from '../../lib/domSelection'
import { useFlatpickrCalendar } from './useFlatpickrCalendar'

// How long to wait, with no further digit typed, before an ambiguous
// day/month segment (e.g. "1" — could stay "1" or continue to "10"-"19")
// auto-advances on its own. Pairs with (doesn't replace) the explicit-
// separator force-advance already in dateMask.ts — matches the common
// pattern in native browser date inputs and masked-input libraries
// (IMask.js, Cleave.js, react-input-mask) of supporting both. Internal
// only, not exposed as a prop. Set to 1200ms (up from an initial 600ms,
// which raced ahead of typing a second digit like the "5" of "15" before
// the user could enter it) to leave comfortable room for the second digit.
const AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS = 1200

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
  hint?: string
  // Wijmo-style two-way binding for the raw text shown in the control,
  // distinct from `value` — same contract as InputNumber's text/onTextChange.
  text?: string
  onTextChange?: (text: string) => void
  // Day-step per wheel notch, opt-in + focus-gated, same convention as
  // InputNumber's handleWheel.
  handleWheel?: boolean
  // Controlled calendar-dropdown open state — extends the is-prefix
  // exception set (mirrors Wijmo's isDroppedDown).
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  closeOnSelection?: boolean
  showDropdownButton?: boolean
  monthCount?: number
}

const wrapperBaseClassName =
  'flex items-stretch overflow-hidden rounded-lg border shadow-sm focus-within:border-blue-300 focus-within:ring-3 focus-within:ring-blue-500/20'

function wrapperStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-gray-300 bg-gray-100 opacity-40 dark:border-gray-700 dark:bg-gray-800'
  }
  if (isReadOnly) {
    return 'cursor-default border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
  }
  return 'border-gray-300 bg-transparent dark:border-gray-700 dark:bg-gray-900'
}

const inputClassName =
  'h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-500 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:text-gray-400'

const dropdownButtonClassName =
  'flex h-11 w-9 shrink-0 items-center justify-center border-l border-gray-300 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent dark:border-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 dark:disabled:text-gray-700'

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
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
    hint,
    handleWheel = false,
    isOpen,
    onOpenChange,
    closeOnSelection = true,
    showDropdownButton = true,
    monthCount = 1,
    locale = 'en',
    className,
    'aria-describedby': ariaDescribedBy,
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
  const hintId = useId()
  const describedBy = [ariaDescribedBy, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // Timer for the ambiguous-digit auto-advance (see
  // AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS above) — rescheduled on every
  // keystroke in handleChange, cleared on blur/commit and Escape, and on
  // unmount below.
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(start, end)
      pendingSelectionRef.current = null
    }
  })

  function clearPendingAdvance() {
    if (advanceTimeoutRef.current !== null) {
      clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }
  }

  // Schedules the ambiguous-digit auto-advance (see
  // AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS) *if* the cursor is currently sitting
  // in an ambiguous, still-open day/month segment — pendingAdvanceAtCursor
  // returns null otherwise, so this is a no-op when there's nothing to
  // advance. Cursor-scoped (not a global open-segment scan) specifically so
  // a single-digit segment the user has already typed past can't schedule a
  // spurious advance that yanks the cursor back to it. Callers must
  // clearPendingAdvance() first; the fired callback re-checks focus, since
  // the user may have blurred during the delay.
  function scheduleAdvanceIfPending(currentDraft: string, cursor: number) {
    if (!maskSegments) return
    const pending = pendingAdvanceAtCursor(maskSegments, currentDraft, cursor)
    if (!pending) return
    advanceTimeoutRef.current = setTimeout(() => {
      advanceTimeoutRef.current = null
      const node = inputElementRef.current
      if (!node || document.activeElement !== node) return
      updateDraft(pending.draft)
      applySelection(node, pending.cursor, pending.cursor)
    }, AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS)
  }

  useEffect(() => clearPendingAdvance, [])

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
    clearPendingAdvance()
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
    isOpen,
    onPick: commit,
    onOpenChange: (open) => {
      setIsOpenState(open)
      onOpenChange?.(open)
    },
  })

  function handleToggleDropdown() {
    if (isDisabled || isReadOnly) return
    toggle()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    const rawNext = el.value
    let next = rawNext
    let maskCursor = -1
    clearPendingAdvance()
    if (maskSegments) {
      // Live-typing mask — see src/lib/dateMask.ts. diffStrings recovers the
      // single edit region from the browser's own resulting value (works
      // uniformly for a keystroke, Backspace/Delete, an overtyped selection,
      // or a paste, without needing to know which one happened); applyDateMask
      // then either accepts it (auto-inserting the next literal separator
      // when a segment completes) or rejects it outright, restoring the
      // draft/cursor to where the rejected edit started.
      const edit = diffStrings(draft, rawNext)
      const result = applyDateMask(maskSegments, draft, edit)
      if (result === 'reject') {
        applySelection(el, edit.start, edit.start)
        // The draft is unchanged, but the segment being edited may still be
        // an ambiguous open one (e.g. typing an invalid 2nd day digit onto
        // "3" is rejected, leaving "3" still open) — keep its auto-advance
        // ticking rather than leaving it stuck with no way forward.
        scheduleAdvanceIfPending(draft, edit.start)
        return
      }
      next = result.draft
      maskCursor = result.cursor
      // Always re-apply the cursor here, even when `next` happens to
      // textually equal `rawNext` (e.g. an explicit separator keystroke
      // that force-advances a segment to exactly what the browser already
      // typed) — an earlier version skipped this call in that case,
      // reasoning the browser's own native cursor placement was already
      // right. That reasoning doesn't hold: React's controlled-input
      // reconciliation doesn't know the DOM's `value` was just mutated
      // natively by this same keystroke (it only sees "state changed from
      // the previous render"), so it can still reassign `el.value` on
      // commit — even to matching text — which resets the browser's own
      // cursor placement with nothing left to correct it afterward. Always
      // calling `applySelection` here (cheap: a `setSelectionRange` plus a
      // microtask re-apply, see its own doc comment) removes that
      // assumption entirely instead of relying on it holding in every
      // browser engine.
      applySelection(el, result.cursor, result.cursor)
    }
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
    // An ambiguous day/month digit (e.g. "1" — could stay "1" or continue to
    // "10"-"19") pairs the explicit-separator force-advance above with a
    // short-pause auto-advance: if nothing else is typed within
    // AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS, finalize the segment the cursor is
    // in as-is. Scoped to the cursor's own segment (see
    // pendingAdvanceAtCursor) so a single-digit segment already typed past
    // never schedules an advance that would drag the cursor back to it.
    if (maskSegments) scheduleAdvanceIfPending(next, maskCursor)
    updateDraft(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const el = event.currentTarget
    if (event.key === 'Enter') {
      commitDraft()
    } else if (event.key === 'Escape') {
      clearPendingAdvance()
      updateDraft(formattedValue)
    } else if (event.key === 'ArrowUp' && !isReadOnly) {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown' && !isReadOnly) {
      event.preventDefault()
      stepBy(-1)
    } else if (event.key === 'Backspace' && !isReadOnly && maskSegments) {
      // Two-press skip-then-delete, mirroring InputNumber's own
      // decimal-point-skip convention: stepping over a separator instead of
      // deleting nothing lets the *next* Backspace delete the actual digit
      // natively, rather than requiring bespoke "smart" deletion logic here.
      const cursor = el.selectionStart
      if (cursor !== null && cursor === el.selectionEnd && cursor > 0 && isLiteralCharAt(draft, cursor - 1, maskSegments)) {
        event.preventDefault()
        el.setSelectionRange(cursor - 1, cursor - 1)
      }
    } else if (event.key === 'Delete' && !isReadOnly && maskSegments) {
      const cursor = el.selectionStart
      if (cursor !== null && cursor === el.selectionEnd && isLiteralCharAt(draft, cursor, maskSegments)) {
        event.preventDefault()
        el.setSelectionRange(cursor + 1, cursor + 1)
      }
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
    <>
      <div className="relative">
        <div
          className={`${wrapperBaseClassName} ${wrapperStateClassName(isDisabled, isReadOnly)} ${className ?? ''}`}
        >
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
            aria-describedby={describedBy}
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
            className={inputClassName}
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
        </div>
        {/* React-opaque host for flatpickr's popup — see the DOM-ownership
            escape-hatch note above; must stay empty in JSX. */}
        <div ref={containerRef} className="absolute inset-x-0 bottom-0 h-0 w-0" aria-hidden="true" />
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </>
  )
})
