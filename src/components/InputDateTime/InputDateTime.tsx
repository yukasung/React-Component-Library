import { forwardRef, useId, useMemo, useState } from 'react'
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import { MINUTES_PER_DAY, buildTimeList, formatTimeOfDay, nearestTimeIndex, timeOfDayMinutes } from '../../lib/time'
import { useFlatpickrCalendar } from '../InputDate/useFlatpickrCalendar'
import { useTimeDropdown } from '../InputTime/useTimeDropdown'
import { TimeList } from './TimeList'
import { CalendarIcon, ClockIcon } from './icons'
import {
  dropdownButtonClassName,
  dropdownButtonsClassName,
  inputBaseClassName,
  inputPaddingClassName,
  inputStateClassName,
} from './styles'
import { useDateTimeField } from './useDateTimeField'

// One Date, both halves — the control that pairs a calendar with a list of
// times, giving the field *two* drop-down buttons: a calendar for the day, a
// clock for the time of day. Both popups belong to one field, so opening
// either closes the other.
//
// Composition, not a third implementation: the calendar comes from InputDate's
// own useFlatpickrCalendar (including its Buddhist-Era year header), the list
// from InputTime's useTimeDropdown, and every pure rule from src/lib. This file
// owns only what the two popups and the field have to agree on; the field's own
// commit model and group editing live in useDateTimeField, its markup details
// in presentation.tsx and TimeList.tsx.
//
// See src/lib/dateTime.ts for the one thing that couldn't be borrowed (parsing
// a format that names both halves).

// Same offset InputDate applies for locale="th" — one combined
// language-and-era prop, see InputDate's own note.
const BUDDHIST_ERA_OFFSET = 543

// InputDate's default format joined to InputTime's.
const DEFAULT_FORMAT = 'Y-m-d H:i'
// How the entries in the time list are labelled when `timeFormat` isn't given.
const DEFAULT_TIME_FORMAT = 'H:i'

function sameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

export interface InputDateTimeProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'required' | 'readOnly' | 'disabled'
  > {
  // Both halves of this Date are read and written — unlike InputTime, which
  // keeps the day it was given, and InputDate, which keeps the time.
  value?: Date | null
  defaultValue?: Date | null
  onChange?: (value: Date | null) => void
  // Bounds on the whole value, clamped at minute granularity: a `max` of
  // 18:00 on a given day really does stop 18:30 that day. Also handed to the
  // calendar as its own min/max date.
  min?: Date | null
  max?: Date | null
  // flatpickr's own tokens (as in InputDate), now spanning both halves:
  // `Y y m n d j` for the date, `H h G i K` for the time. A format naming a
  // month/weekday *name* (F/M/D/l) or seconds (S/s) can't be typed into —
  // the field takes its value from the two popups instead, exactly as
  // InputDate does for its own alphabetic formats.
  format?: string
  // 'th' switches month/weekday names to Thai AND years to Buddhist Era, in
  // the field and in the calendar popup — see InputDate's own note on why
  // that is one prop rather than two.
  locale?: 'en' | 'th'
  // Named to match the reference API (isRequired/isReadOnly/isDisabled) rather
  // than the native HTML convention — see CLAUDE.md's note on this exception set.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  // Two-way binding for the raw text shown in the control, distinct from `value`.
  text?: string
  onTextChange?: (text: string) => void
  // Steps the value per wheel notch — by day or through the time list,
  // whichever group the caret is in. Opt-in and focus-gated, same convention
  // as the other three inputs.
  handleWheel?: boolean
  closeOnSelection?: boolean
  showDropdownButton?: boolean
  monthCount?: number
  // The spacing and bounds of the entries in the time list. Null or a
  // non-positive step means there's no defined spacing, so there are no
  // entries: the clock button is hidden and time stepping goes inert, leaving
  // the date half fully working. Only the time-of-day part of
  // timeMin/timeMax is read.
  timeStep?: number | null
  timeMin?: Date | null
  timeMax?: Date | null
  // How the times in the list are labelled, distinct from the field's own
  // `format`.
  timeFormat?: string
  // Height cap (px) for the scrollable list: a full day at the default
  // 15-minute step is 96 entries.
  maxDropdownHeight?: number
  dropdownIcon?: ReactNode
  dropdownAriaLabel?: string
  calendarAriaLabel?: string
  timeDropdownIcon?: ReactNode
  timeDropdownAriaLabel?: string
  optionsAriaLabel?: string
}

export const InputDateTime = forwardRef<HTMLInputElement, InputDateTimeProps>(function InputDateTime(
  {
    value,
    defaultValue = null,
    onChange,
    text,
    onTextChange,
    min = null,
    max = null,
    format = DEFAULT_FORMAT,
    isDisabled = false,
    isReadOnly = false,
    isRequired = true,
    handleWheel = false,
    closeOnSelection = true,
    showDropdownButton = true,
    monthCount = 1,
    locale = 'en',
    timeStep = 15,
    timeMin = null,
    timeMax = null,
    timeFormat = DEFAULT_TIME_FORMAT,
    maxDropdownHeight = 200,
    dropdownIcon,
    dropdownAriaLabel = 'Toggle calendar',
    calendarAriaLabel = 'Calendar',
    timeDropdownIcon,
    timeDropdownAriaLabel = 'Toggle time list',
    optionsAriaLabel = 'Time options',
    // Native passthrough (it arrives via InputHTMLAttributes, not as a prop of
    // this component's own), pulled out of `rest` only so an empty field can
    // fall back to the format's own shape — see placeholderText below.
    placeholder,
    className,
    ...rest
  },
  ref,
) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const calendarId = useId()
  const listId = useId()
  const yearOffset = locale === 'th' ? BUDDHIST_ERA_OFFSET : 0
  const flatpickrLocale = locale === 'th' ? Thai : undefined
  const minMinutes = timeMin ? timeOfDayMinutes(timeMin) : null
  const maxMinutes = timeMax ? timeOfDayMinutes(timeMax) : null
  // buildTimeList already treats a null/non-positive step as "no entries", so
  // "no list" and "no clock button" are one state rather than two conditions
  // to keep in sync — the same arrangement InputTime uses.
  const times = useMemo(
    () => buildTimeList(minMinutes ?? 0, maxMinutes ?? MINUTES_PER_DAY - 1, timeStep ?? 0),
    [minMinutes, maxMinutes, timeStep],
  )
  const timeLabels = useMemo(() => times.map((minutes) => formatTimeOfDay(minutes, timeFormat)), [times, timeFormat])
  const hasTimeList = times.length > 0

  // The text field's own half: commit model, draft, and the fixed-width groups
  // spanning both date and time. It owns the <input> and its ref.
  const field = useDateTimeField({
    value,
    defaultValue,
    onChange,
    text,
    onTextChange,
    min,
    max,
    format,
    yearOffset,
    flatpickrLocale,
    isRequired,
    isReadOnly,
    isDisabled,
    handleWheel,
    times,
  })
  const displayMinutes = field.displayValue ? timeOfDayMinutes(field.displayValue) : null
  const disabledTimes = useMemo(() => {
    const day = field.displayValue
    if (!day) return times.map(() => false)
    const minimum = min && sameLocalDay(day, min) ? timeOfDayMinutes(min) : null
    const maximum = max && sameLocalDay(day, max) ? timeOfDayMinutes(max) : null
    return times.map((minutes) => (minimum !== null && minutes < minimum) || (maximum !== null && minutes > maximum))
  }, [field.displayValue, max, min, times])
  const disabledTimeIndices = useMemo(
    () => disabledTimes.flatMap((isDisabled, index) => (isDisabled ? [index] : [])),
    [disabledTimes],
  )

  const dropdown = useTimeDropdown({
    itemCount: times.length,
    selectedIndex: nearestTimeIndex(times, displayMinutes),
    disabledIndices: disabledTimeIndices,
  })

  // All flatpickr integration lives in this hook — see useFlatpickrCalendar.ts,
  // shared verbatim with InputDate, including the Buddhist-Era year header. It
  // hands back the picked *day* (normalized to its start), which is exactly
  // what this control wants: the time comes from the field.
  const { containerRef, toggle: toggleCalendar } = useFlatpickrCalendar({
    format,
    min,
    max,
    closeOnSelection,
    monthCount,
    locale,
    flatpickrLocale,
    yearOffset,
    committedValue: field.committedValue,
    positionElementRef: field.inputRef,
    calendarId,
    calendarAriaLabel,
    onPick: field.pickDate,
    // Internal only — neither popup's open state leaves the component; this
    // just keeps aria-expanded and the "one popup at a time" rule in step.
    onOpenChange: setIsCalendarOpen,
  })

  // Two popups on one field, so opening either closes the other rather than
  // letting them overlap each other's space below the input.
  function toggleCalendarPopup() {
    dropdown.close()
    toggleCalendar()
  }

  function toggleTimePopup() {
    if (isCalendarOpen) toggleCalendar()
    dropdown.toggle()
    // The button suppresses its own mousedown (so opening the list doesn't
    // blur the field and commit the draft), which also means it never moves
    // focus — without this, Arrow/Enter would never reach the list.
    field.inputRef.current?.focus()
  }

  function handleToggleCalendar() {
    if (isDisabled || isReadOnly) return
    toggleCalendarPopup()
  }

  function handleToggleTimeList() {
    if (isDisabled || isReadOnly || !hasTimeList) return
    toggleTimePopup()
  }

  function pickTime(minutes: number) {
    if (disabledTimes[times.indexOf(minutes)]) return
    field.pickTime(minutes)
    dropdown.close()
    field.inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Group navigation first — except Home/End, which belong to an open time
    // list (jumping to the first/last entry), as they do in InputTime.
    const listOwnsKey = dropdown.isOpen && (event.key === 'Home' || event.key === 'End')
    if (!listOwnsKey && field.moveGroup(event)) return
    // Alt+Arrow is the standard combobox gesture for showing/hiding the popup.
    // With two popups, it opens the one belonging to the group the caret is in
    // — the same rule that decides what a bare Arrow steps.
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (isDisabled || isReadOnly) return
      if (field.isTimeGroupActive()) handleToggleTimeList()
      else toggleCalendarPopup()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const isDown = event.key === 'ArrowDown'
      // While the list is showing, ArrowDown moves the highlight *down* it,
      // browsing without committing; with it closed there is nothing on screen
      // to move through, and ArrowUp means "later" — the direction it means in
      // every other control here.
      if (dropdown.isOpen) dropdown.moveHighlight(isDown ? 1 : -1)
      else if (!isReadOnly) field.stepBy(isDown ? -1 : 1)
      return
    }
    if (event.key === 'Enter') {
      if (dropdown.isOpen) {
        event.preventDefault()
        const highlighted = times[dropdown.highlightedIndex]
        if (highlighted !== undefined) pickTime(highlighted)
        else dropdown.close()
        return
      }
      field.commitDraft()
      return
    }
    if (event.key === 'Escape') {
      // Whichever popup is showing closes first — flatpickr's own Escape
      // handling never fires here, since it listens for its own (hidden) input
      // and this field's visible one is a different element. Only once both
      // are closed does Escape discard the in-progress edit, the way a native
      // combobox orders the two.
      if (dropdown.isOpen) dropdown.close()
      else if (isCalendarOpen) toggleCalendar()
      else field.discardEdit(event.currentTarget)
      return
    }
    if (listOwnsKey) {
      event.preventDefault()
      dropdown.setHighlightedIndex(event.key === 'Home' ? 0 : times.length - 1)
      return
    }
    // Everything left that could be a character or a deletion goes to the
    // groups.
    field.typeIntoGroups(event)
  }

  const showsCalendarButton = showDropdownButton
  const showsTimeButton = showDropdownButton && hasTimeList
  const buttonCount = (showsCalendarButton ? 1 : 0) + (showsTimeButton ? 1 : 0)

  return (
    <div className="rc-scalar relative" ref={dropdown.rootRef}>
      <input
        {...rest}
        ref={(node) => {
          field.inputRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        type="text"
        disabled={isDisabled}
        readOnly={isReadOnly || !field.isTypeable}
        required={isRequired}
        // Combobox with two popups: aria-controls names whichever is showing,
        // and aria-haspopup the kind that one is (the calendar is a dialog,
        // the time list a listbox).
        role="combobox"
        aria-expanded={isCalendarOpen || dropdown.isOpen}
        aria-haspopup={dropdown.isOpen ? 'listbox' : 'dialog'}
        aria-controls={dropdown.isOpen ? listId : calendarId}
        aria-activedescendant={
          dropdown.isOpen && dropdown.highlightedIndex >= 0 ? `${listId}-${dropdown.highlightedIndex}` : undefined
        }
        aria-autocomplete="none"
        placeholder={placeholder ?? field.placeholderShape}
        value={field.displayText}
        onChange={field.handleChange}
        onMouseDown={field.handlePointerDown}
        onFocus={field.handleFocus}
        onClick={(event) => {
          // With typing unavailable, the field itself is another way to reach
          // the input method that's left — the calendar, since it owns the
          // larger half of the value.
          if (!field.isTypeable) {
            if (!isDisabled && !isReadOnly) toggleCalendarPopup()
            return
          }
          field.handleClick(event)
        }}
        onBlur={field.handleBlur}
        onKeyDown={handleKeyDown}
        className={`${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${inputPaddingClassName(buttonCount)} ${className ?? ''}`}
      />
      {buttonCount > 0 && (
        <div className={dropdownButtonsClassName}>
          {showsCalendarButton && (
            <button
              type="button"
              aria-label={dropdownAriaLabel}
              aria-expanded={isCalendarOpen}
              aria-controls={calendarId}
              disabled={isDisabled || isReadOnly}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleToggleCalendar}
              className={dropdownButtonClassName}
            >
              {dropdownIcon ?? <CalendarIcon />}
            </button>
          )}
          {showsTimeButton && (
            <button
              type="button"
              // Tabbable, unlike InputTime's copy of this button: there the
              // list is one field's only popup and Alt+Arrow reaches it, but
              // here skipping it would leave a keyboard user tabbing past the
              // calendar toggle straight out of the field, with no sign the
              // time list exists at all. Both toggles on one field behave the
              // same way — InputDate's own suite pins its toggle as tabbable.
              aria-label={timeDropdownAriaLabel}
              aria-expanded={dropdown.isOpen}
              aria-controls={listId}
              disabled={isDisabled || isReadOnly}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleToggleTimeList}
              className={dropdownButtonClassName}
            >
              {timeDropdownIcon ?? <ClockIcon />}
            </button>
          )}
        </div>
      )}
      {dropdown.isOpen && hasTimeList && (
        <TimeList
          id={listId}
          listRef={dropdown.listRef}
          ariaLabel={optionsAriaLabel}
          maxHeight={maxDropdownHeight}
          times={times}
          labels={timeLabels}
          disabled={disabledTimes}
          selectedMinutes={displayMinutes}
          highlightedIndex={dropdown.highlightedIndex}
          onPick={pickTime}
        />
      )}
      {/* React-opaque host for flatpickr's popup — see the DOM-ownership
          escape-hatch note in CLAUDE.md; must stay empty in JSX. */}
      <div ref={containerRef} />
    </div>
  )
})
