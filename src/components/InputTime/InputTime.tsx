import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import { useSyncedState } from '../../hooks/useSyncedState'
import { applySelection, selectAllOnFocus } from '../../lib/domSelection'
import {
  AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS,
  applyInputMask,
  diffStrings,
  isLiteralCharAt,
  pendingAdvanceAtCursor,
} from '../../lib/inputMask'
import {
  MINUTES_PER_DAY,
  buildTimeList,
  clampMinutes,
  formatTimeOfDay,
  isSameTime,
  parseTimeDraft,
  stepThroughTimes,
  timeMaskSegments,
  timeOfDayMinutes,
  tokenizeTimeFormat,
  withTimeOfDay,
} from '../../lib/time'
import { useTimeDropdown } from './useTimeDropdown'

// 24-hour hours:minutes. Also the fallback whenever `format` names a token
// this component can't render (see the format prop's doc comment).
const DEFAULT_FORMAT = 'H:i'

export interface InputTimeProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'required' | 'readOnly' | 'disabled'
  > {
  // Only the time-of-day part of this Date is read or written; committing a
  // new time keeps the year/month/day it already had (or today's, for a
  // value that starts out null), which is what lets an InputDate and an
  // InputTime edit two halves of the same Date independently.
  value?: Date | null
  defaultValue?: Date | null
  onChange?: (value: Date | null) => void
  // Earliest/latest acceptable time — again time-of-day only, the date part
  // is ignored. Bounds both the entries offered in the dropdown and the
  // clamping applied to a typed value on commit. A range that wraps past
  // midnight (min later than max) isn't supported.
  min?: Date | null
  max?: Date | null
  // Minutes between entries in the dropdown list, and — matching how
  // InputNumber's `step` governs its spin buttons — the sole thing that
  // determines whether the dropdown exists at all. Null or a non-positive
  // value means there's no defined spacing, so there are no entries to
  // list: the dropdown button is hidden and Arrow-key/wheel stepping go
  // inert, leaving a plain typed-entry time field.
  step?: number | null
  // Time format built from the same token vocabulary as InputDate's:
  // `H` (00-23), `h` (1-12), `G` (01-12), `i` (00-59) and `K` (AM/PM).
  // A format naming any other token — `S`/`s` for seconds in particular,
  // which this component doesn't support (it works at whole-minute
  // granularity throughout) — falls back to the default rather than
  // rendering a wrong time.
  format?: string
  // Named to match InputNumber/InputDate's isRequired rather than the
  // native `required` convention — see CLAUDE.md's note on this deliberate
  // exception set.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  // Restricts input to the dropdown's own entries: false blocks typing but
  // leaves the field otherwise fully interactive (unlike isReadOnly, the
  // value still changes — via the dropdown, Arrow keys and the wheel).
  isEditable?: boolean
  hint?: string
  // Wijmo-style two-way binding for the raw text shown in the control,
  // distinct from `value` — same contract as InputNumber/InputDate.
  text?: string
  onTextChange?: (text: string) => void
  // Steps through the dropdown's entries per wheel notch; opt-in and
  // focus-gated, same convention as InputNumber/InputDate.
  handleWheel?: boolean
  // Controlled dropdown open state — extends the is-prefix exception set,
  // alongside InputDate's own isOpen.
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  closeOnSelection?: boolean
  showDropdownButton?: boolean
  // Height cap (px) for the scrollable list. A real necessity rather than a
  // nicety here: a full day at the default 15-minute step is 96 entries.
  maxDropdownHeight?: number
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

// Mirrors the calendar popup's own surface treatment (see
// flatpickr-theme.css) so the two dropdowns in this library read as one
// design, even though only this one is rendered by React.
const listClassName =
  'absolute inset-x-0 top-full z-50 mt-2 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/5 dark:bg-gray-900'

function optionClassName(isSelected: boolean, isHighlighted: boolean): string {
  const base = 'cursor-pointer px-3 py-1.5 text-sm'
  if (isSelected) return `${base} bg-blue-600 font-medium text-white`
  if (isHighlighted) return `${base} bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90`
  return `${base} text-gray-700 dark:text-gray-300`
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.75V8l2.25 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const InputTime = forwardRef<HTMLInputElement, InputTimeProps>(function InputTime(
  {
    value,
    defaultValue = null,
    onChange,
    text,
    onTextChange,
    min = null,
    max = null,
    step = 15,
    format = DEFAULT_FORMAT,
    isDisabled = false,
    isReadOnly = false,
    isRequired = true,
    isEditable = true,
    hint,
    handleWheel = false,
    isOpen,
    onOpenChange,
    closeOnSelection = true,
    showDropdownButton = true,
    maxDropdownHeight = 200,
    className,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<Date | null>(defaultValue)
  const [isFocused, setIsFocused] = useState(false)
  const committedValue = isControlled ? value : internalValue
  // A format this module can't tokenize would otherwise render as an empty
  // field with no explanation; falling back keeps the control usable and
  // makes the mistake visible (the wrong-looking format) rather than silent.
  const resolvedFormat = tokenizeTimeFormat(format) ? format : DEFAULT_FORMAT
  // Live-typing mask segments — undefined only for a format the tokenizer
  // rejected, which resolvedFormat has already ruled out, so in practice
  // this is always present. Cheap to recompute every render (format strings
  // are ~5 chars), no useMemo needed.
  const maskSegments = timeMaskSegments(resolvedFormat)
  const minMinutes = min ? timeOfDayMinutes(min) : null
  const maxMinutes = max ? timeOfDayMinutes(max) : null
  const hasStep = typeof step === 'number' && step > 0
  const times = useMemo(
    () => (hasStep ? buildTimeList(minMinutes ?? 0, maxMinutes ?? MINUTES_PER_DAY - 1, step as number) : []),
    [hasStep, minMinutes, maxMinutes, step],
  )
  // The time a required field shows before it has a value of its own.
  // Captured once at mount rather than read from the clock on every render:
  // a value that changes every minute would flow into `formattedValue` and,
  // through useSyncedState, silently overwrite whatever the user happened
  // to be typing when the minute rolled over.
  const [fallbackMinutes] = useState(() => timeOfDayMinutes(new Date()))
  // Required fields never display as blank — display-only, mirroring
  // InputNumber's zero fallback and InputDate's today fallback. It never
  // forces an onChange the consumer didn't trigger; defaultValue itself
  // still defaults to null.
  const displayMinutes =
    committedValue !== null
      ? timeOfDayMinutes(committedValue)
      : isRequired
        ? clampMinutes(fallbackMinutes, minMinutes, maxMinutes)
        : null
  function formatDisplay(next: number | null): string {
    return next === null ? '' : formatTimeOfDay(next, resolvedFormat)
  }
  const formattedValue = formatDisplay(displayMinutes)
  const [draft, setDraft] = useSyncedState(text !== undefined ? text : formattedValue)
  function updateDraft(next: string) {
    if (next !== draft) onTextChange?.(next)
    setDraft(next)
  }
  const hintId = useId()
  const listId = useId()
  const describedBy = [ariaDescribedBy, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Where the highlight lands when the list opens. Distinct from which entry
  // renders as *selected* (an exact match only): a value that isn't on the
  // grid — typed by hand, or left behind by a coarser `step` — has no exact
  // entry, and opening to nothing highlighted would make Enter a no-op and
  // leave the scroll position at the top of a 96-entry list. Falls back to
  // the nearest entry at or after the value instead.
  const highlightIndex = (() => {
    if (displayMinutes === null || times.length === 0) return -1
    const exact = times.indexOf(displayMinutes)
    if (exact !== -1) return exact
    const after = times.findIndex((minutes) => minutes >= displayMinutes)
    return after === -1 ? times.length - 1 : after
  })()
  const dropdown = useTimeDropdown({
    itemCount: times.length,
    selectedIndex: highlightIndex,
    isOpen,
    onOpenChange: (open) => onOpenChange?.(open),
  })
  const hasDropdown = hasStep && times.length > 0

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

  // Schedules the ambiguous-digit auto-advance *if* the cursor is currently
  // sitting in an ambiguous, still-open segment (an hour "1", which could
  // still become "10"-"12"); pendingAdvanceAtCursor returns null otherwise,
  // so this is a no-op when there's nothing to advance. Same contract as
  // InputDate's — callers must clearPendingAdvance() first, and the fired
  // callback re-checks focus since the user may have blurred during the wait.
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

  function timesEqual(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b
    return isSameTime(a, b)
  }

  function commit(nextMinutes: number | null) {
    // Only the time part is ever replaced — the day this value belongs to
    // is carried over from whatever it already was.
    const base = committedValue ?? lastCommittedRef.current ?? new Date()
    const next = nextMinutes === null ? null : withTimeOfDay(base, nextMinutes)
    const changed = !timesEqual(next, lastCommittedRef.current)
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    updateDraft(formatDisplay(nextMinutes))
  }

  function commitDraft() {
    if (isReadOnly) return
    clearPendingAdvance()
    const parsed = parseTimeDraft(draft, resolvedFormat)
    if (parsed === undefined || (isRequired && parsed === null)) {
      updateDraft(formattedValue)
      return
    }
    commit(parsed === null ? null : clampMinutes(parsed, minMinutes, maxMinutes))
  }

  // Stepping moves through the generated entries rather than adding raw
  // minutes, so an off-grid value snaps onto the list instead of carrying
  // its remainder forever. Gated on `step` for the same reason the dropdown
  // is: with no defined spacing there's nothing to step by.
  function stepBy(direction: 1 | -1) {
    if (!hasDropdown || isReadOnly) return
    const parsed = parseTimeDraft(draft, resolvedFormat)
    const current = typeof parsed === 'number' ? parsed : displayMinutes
    const next = stepThroughTimes(times, current, direction)
    if (next === undefined) return
    clearPendingAdvance()
    commit(next)
  }

  function selectTime(minutes: number) {
    if (isReadOnly) return
    clearPendingAdvance()
    commit(minutes)
    if (closeOnSelection) dropdown.close()
    inputElementRef.current?.focus()
  }

  function handleToggleDropdown() {
    if (isDisabled || isReadOnly || !hasDropdown) return
    dropdown.toggle()
    // The button suppresses its own mousedown (so opening the list doesn't
    // blur the field and commit the draft), which also means it never moves
    // focus anywhere — without this, opening the list with the mouse would
    // leave focus whereever it was and Arrow/Enter would never reach the
    // list at all.
    inputElementRef.current?.focus()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    const rawNext = el.value
    let next = rawNext
    let maskCursor = -1
    clearPendingAdvance()
    if (maskSegments) {
      // Live-typing mask — see src/lib/inputMask.ts, which InputDate drives
      // the same way. diffStrings recovers the single edit region from the
      // browser's own resulting value (uniformly for a keystroke,
      // Backspace/Delete, an overtyped selection, or a paste); applyInputMask
      // then either accepts it (auto-inserting the next literal separator
      // when a segment completes) or rejects it outright, restoring the
      // draft/cursor to where the rejected edit started.
      const edit = diffStrings(draft, rawNext)
      const result = applyInputMask(maskSegments, draft, edit)
      if (result === 'reject') {
        applySelection(el, edit.start, edit.start)
        scheduleAdvanceIfPending(draft, edit.start)
        return
      }
      next = result.draft
      maskCursor = result.cursor
      // Always re-applied, even when the masked text equals what the browser
      // already produced — see the same call in InputDate.handleChange for
      // why relying on the browser's own cursor placement isn't safe under
      // React's controlled-input reconciliation.
      applySelection(el, result.cursor, result.cursor)
    }
    if (isRequired && next.trim() === '') {
      // Required fields can't sit empty even mid-edit — snap immediately
      // (not just on blur) and select the result so the next keystroke
      // overwrites it, matching InputNumber/InputDate.
      const fallbackText = formatDisplay(clampMinutes(fallbackMinutes, minMinutes, maxMinutes))
      updateDraft(fallbackText)
      pendingSelectionRef.current = { start: 0, end: fallbackText.length }
      return
    }
    if (maskSegments) scheduleAdvanceIfPending(next, maskCursor)
    updateDraft(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const el = event.currentTarget
    // Alt+Arrow is the standard combobox gesture for showing/hiding the
    // list — without it there'd be no keyboard-only way to reach the
    // dropdown, since a bare Arrow steps the value instead of opening it.
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (hasDropdown && !isDisabled && !isReadOnly) dropdown.toggle()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const isDown = event.key === 'ArrowDown'
      // The two states genuinely need opposite mappings, and both are the
      // unsurprising one for their situation: while the list is showing,
      // ArrowDown must move the highlight *down* the visible (ascending)
      // list, browsing without committing; with the list closed there's
      // nothing on screen to move through, and ArrowUp means "later" — the
      // same direction it means in InputNumber, InputDate and a native
      // time input.
      if (dropdown.isOpen) dropdown.moveHighlight(isDown ? 1 : -1)
      else stepBy(isDown ? -1 : 1)
      return
    }
    if (event.key === 'Enter') {
      if (dropdown.isOpen) {
        event.preventDefault()
        const highlighted = times[dropdown.highlightedIndex]
        if (highlighted !== undefined) selectTime(highlighted)
        else dropdown.close()
        return
      }
      commitDraft()
      return
    }
    if (event.key === 'Escape') {
      if (dropdown.isOpen) {
        dropdown.close()
        return
      }
      clearPendingAdvance()
      updateDraft(formattedValue)
      return
    }
    if (dropdown.isOpen && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      dropdown.setHighlightedIndex(event.key === 'Home' ? 0 : times.length - 1)
      return
    }
    if (!maskSegments || isReadOnly || !isEditable) return
    // Two-press skip-then-delete over a separator, mirroring InputDate's
    // own handling: stepping over it lets the *next* press delete the
    // actual character natively, with no bespoke deletion logic here.
    if (event.key === 'Backspace') {
      const cursor = el.selectionStart
      if (cursor !== null && cursor === el.selectionEnd && cursor > 0 && isLiteralCharAt(draft, cursor - 1, maskSegments)) {
        event.preventDefault()
        el.setSelectionRange(cursor - 1, cursor - 1)
      }
    } else if (event.key === 'Delete') {
      const cursor = el.selectionStart
      if (cursor !== null && cursor === el.selectionEnd && isLiteralCharAt(draft, cursor, maskSegments)) {
        event.preventDefault()
        el.setSelectionRange(cursor + 1, cursor + 1)
      }
    }
  }

  // React's synthetic onWheel is attached passively, so preventDefault()
  // inside it silently fails — a real native listener with
  // { passive: false } is required, same as InputNumber/InputDate.
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
      <div className="relative" ref={dropdown.rootRef}>
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
            // A non-editable field is read-only as far as the browser's own
            // text entry goes, but not read-only as a control — hence the
            // separate isReadOnly styling and the still-live dropdown.
            readOnly={isReadOnly || !isEditable}
            required={isRequired}
            aria-describedby={describedBy}
            // Combobox-with-listbox pattern (the time list), as opposed to
            // InputDate's combobox-with-dialog calendar.
            role="combobox"
            aria-expanded={dropdown.isOpen}
            aria-haspopup="listbox"
            aria-controls={hasDropdown ? listId : undefined}
            aria-activedescendant={
              dropdown.isOpen && dropdown.highlightedIndex >= 0 ? `${listId}-${dropdown.highlightedIndex}` : undefined
            }
            aria-autocomplete="none"
            value={draft}
            onChange={handleChange}
            onFocus={(event) => {
              setIsFocused(true)
              // Times are edited as a whole value rather than
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
            onClick={() => {
              // With typing disabled the field itself is just another way
              // to reach the only input method left.
              if (!isEditable && hasDropdown && !isDisabled && !isReadOnly) dropdown.open()
            }}
            onKeyDown={handleKeyDown}
            className={inputClassName}
          />
          {showDropdownButton && hasDropdown && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle time list"
              disabled={isDisabled || isReadOnly}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleToggleDropdown}
              className={dropdownButtonClassName}
            >
              <ClockIcon />
            </button>
          )}
        </div>
        {dropdown.isOpen && hasDropdown && (
          <ul
            ref={dropdown.listRef}
            id={listId}
            role="listbox"
            aria-label="Time options"
            style={{ maxHeight: maxDropdownHeight }}
            className={listClassName}
          >
            {times.map((minutes, index) => (
              <li
                key={minutes}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={minutes === displayMinutes}
                // Keeps focus in the text field: without this the mousedown
                // blurs the input, which commits the draft and can close the
                // list before the click that picks an entry ever lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTime(minutes)}
                onMouseEnter={() => dropdown.setHighlightedIndex(index)}
                className={optionClassName(minutes === displayMinutes, index === dropdown.highlightedIndex)}
              >
                {formatTimeOfDay(minutes, resolvedFormat)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </>
  )
})
