import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import { useSyncedState } from '../../hooks/useSyncedState'
import { addDays, formatDateValue } from '../../lib/date'
import {
  clampDateTime,
  isSameDateTime,
  isTimeSegment,
  parseDateTimeDraft,
  startOfMinute,
  tokenizeDateTimeMask,
} from '../../lib/dateTime'
import { applySelection, selectAllOnFocus, selectRangeAtCaret } from '../../lib/domSelection'
import { diffStrings, maskPlaceholder } from '../../lib/inputMask'
import {
  isTemplateEmpty,
  templateClearActive,
  templateEdit,
  templateFinalizeActive,
  templateFromRaw,
  templateMoveTo,
  templateRanges,
  templateSlotAt,
  templateText,
  templateToDraft,
  templateTypeIntoActive,
  templateWipedByEdit,
} from '../../lib/maskTemplate'
import type { TemplateEntry } from '../../lib/maskTemplate'
import type { MaskSegment } from '../../lib/inputMask'
import {
  MINUTES_PER_DAY,
  buildTimeList,
  formatTimeOfDay,
  nearestTimeIndex,
  stepThroughTimes,
  timeOfDayMinutes,
  withTimeOfDay,
} from '../../lib/time'
import { useFlatpickrCalendar } from '../InputDate/useFlatpickrCalendar'
import { useTimeDropdown } from '../InputTime/useTimeDropdown'

// One Date, both halves — Wijmo's InputDateTime, which extends its InputDate
// with an inner InputTime and gives the control *two* drop-down buttons: a
// calendar for the day and a list of times for the time of day.
//
// Composition, not a third implementation: the calendar comes from InputDate's
// own useFlatpickrCalendar (including its Buddhist-Era year header), the list
// from InputTime's useTimeDropdown, and every pure rule from src/lib. What is
// deliberately duplicated is the React wiring around the fixed-width groups —
// see CLAUDE.md's note on InputDate/InputTime keeping their own copies so
// either component stays usable on its own; this is the third copy of that
// same shape, for the same reason.
//
// See src/lib/dateTime.ts for the one thing that genuinely couldn't be
// borrowed (parsing a format that names both halves).

// Same offset InputDate applies for locale="th" — one combined
// language-and-era prop, see InputDate's own note.
const BUDDHIST_ERA_OFFSET = 543

// InputDate's default format joined to InputTime's.
const DEFAULT_FORMAT = 'Y-m-d H:i'
// How the entries in the time list are labelled when `timeFormat` isn't given
// (Wijmo's own timeFormat default is likewise a short time pattern).
const DEFAULT_TIME_FORMAT = 'H:i'

// Keys that move between groups while the field is edited as groups, and how
// far each moves. Module scope so a keydown that falls through to the other
// branches doesn't allocate it.
const GROUP_NAV_KEYS: Record<string, (entry: TemplateEntry) => number> = {
  ArrowLeft: (entry) => entry.active - 1,
  ArrowRight: (entry) => entry.active + 1,
  Home: () => 0,
  End: (entry) => entry.slots.length - 1,
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
  // Named to match Wijmo's API (isRequired/isReadOnly/isDisabled) rather than
  // the native HTML convention — see CLAUDE.md's note on this exception set.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  // Wijmo-style two-way binding for the raw text shown in the control.
  text?: string
  onTextChange?: (text: string) => void
  // Steps the value per wheel notch — by day or through the time list,
  // whichever group the caret is in. Opt-in and focus-gated, same convention
  // as the other three inputs.
  handleWheel?: boolean
  closeOnSelection?: boolean
  showDropdownButton?: boolean
  monthCount?: number
  // Wijmo's timeStep/timeMin/timeMax: the spacing and bounds of the entries
  // in the time list. Null or a non-positive step means there's no defined
  // spacing, so there are no entries: the clock button is hidden and time
  // stepping goes inert, leaving the date half fully working. Only the
  // time-of-day part of timeMin/timeMax is read.
  timeStep?: number | null
  timeMin?: Date | null
  timeMax?: Date | null
  // How the times in the list are labelled, distinct from the field's own
  // `format` — Wijmo draws the same distinction with its timeFormat.
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

// Same layout as InputDate/InputTime — see the note on InputDate's copy: the
// border, background and focus ring sit on the <input>, and the icons overlay
// its right edge rather than occupying bordered cells beside it.
const inputBaseClassName =
  'h-11 w-full appearance-none rounded-lg border px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-gray-400 focus:ring-3 dark:text-white/90 dark:placeholder:text-white/30'

function inputStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
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
// stops at (see the input's own pr-* below).
const dropdownButtonsClassName = 'absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1'

// No hover treatment, matching InputDate/InputTime and the reference they came
// from — an icon holds one gray at rest and only changes when disabled.
const dropdownButtonClassName =
  'text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:disabled:text-gray-700'

// Mirrors the calendar popup's own surface treatment (flatpickr-theme.css), as
// InputTime's list does, so both popups on this one field read as one design.
const listClassName =
  'absolute inset-x-0 top-full z-50 mt-2 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/5 dark:bg-gray-900'

// Hover is styled rather than tracked — see InputTime's copy for why the
// keyboard highlight is state and the pointer one isn't.
function optionClassName(isSelected: boolean, isHighlighted: boolean): string {
  const base = 'cursor-pointer px-3 py-1.5 text-sm'
  if (isSelected) return `${base} bg-[var(--rc-color-primary,#465fff)] font-medium text-white`
  const hover = 'hover:bg-gray-100 dark:hover:bg-white/5'
  if (isHighlighted) return `${base} ${hover} bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90`
  return `${base} ${hover} text-gray-700 dark:text-gray-300`
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.75V8l2.25 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<Date | null>(defaultValue)
  const [isFocused, setIsFocused] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const calendarId = useId()
  const listId = useId()
  const committedValue = isControlled ? value : internalValue
  const yearOffset = locale === 'th' ? BUDDHIST_ERA_OFFSET : 0
  const flatpickrLocale = locale === 'th' ? Thai : undefined
  // The format as fixed-width groups, or undefined when it can't be one (a
  // month name has no shape to type into). Cheap to recompute every render —
  // format strings are ~15 chars — so no useMemo, as in the other two.
  const maskSegments = tokenizeDateTimeMask(format)
  // …and that is also what decides whether the field can be typed into at all:
  // a format whose text can't be read back takes its value from the two popups
  // only, and says so by being read-only to the browser's own text entry. It
  // stays a live control otherwise, which is why this is not `isReadOnly`.
  const isTypeable = maskSegments !== undefined
  const placeholderText = placeholder ?? (maskSegments ? maskPlaceholder(maskSegments) : undefined)
  // The value a required field shows before it has one of its own. Captured
  // once at mount rather than read from the clock each render: this one has a
  // minute in it, and a value that changes every minute would flow through
  // useSyncedState and overwrite whatever was being typed when it rolled over
  // (InputTime captures its own fallback for exactly this reason; InputDate
  // can get away without, its fallback only changing at midnight).
  const [fallbackValue] = useState(() => startOfMinute(new Date()))
  // Display-only, and never an onChange the consumer didn't trigger —
  // mirroring InputNumber's zero, InputDate's today and InputTime's now.
  const displayValue = isRequired && committedValue === null ? fallbackValue : committedValue
  function formatDisplay(next: Date | null): string {
    return formatDateValue(next, format, yearOffset, flatpickrLocale)
  }
  const formattedValue = formatDisplay(displayValue)
  const [draft, setDraft] = useSyncedState(text !== undefined ? text : formattedValue)
  function updateDraft(next: string) {
    if (next !== draft) onTextChange?.(next)
    setDraft(next)
  }
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
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // See the input's own onMouseDown/onFocus: which group the focus handler
  // highlights depends on whether a pointer put the caret somewhere first.
  const focusFromPointerRef = useRef(false)
  // Group editing, as in InputDate and InputTime — here the groups simply span
  // both halves, so the year and the minutes are walked with the same keys.
  const [templateEntry, setTemplateEntry] = useState<TemplateEntry | null>(null)
  // Both halves of "is this field being edited as groups" in one place: a
  // format the mask can describe, and an entry (created on focus, cleared on
  // commit).
  const groups = maskSegments && templateEntry ? { segments: maskSegments, entry: templateEntry } : null
  const templateValue = groups ? templateText(groups.segments, groups.entry) : ''
  const slotRanges = maskSegments ? templateRanges(maskSegments) : []

  const dropdown = useTimeDropdown({
    itemCount: times.length,
    selectedIndex: nearestTimeIndex(times, displayValue ? timeOfDayMinutes(displayValue) : null),
  })

  function entryFromText(source: string): TemplateEntry {
    return templateFromRaw(maskSegments as MaskSegment[], source)
  }

  // What the field is showing, as a draft string — the groups while they're
  // being edited (they are the live text then, and the draft still holds the
  // last committed value), the draft itself otherwise. Whatever reads "the
  // value in front of the user" goes through this, or an Arrow key would step
  // from a value the user has already typed over.
  function draftInProgress(): string {
    if (!groups) return draft
    return templateToDraft(groups.segments, templateFinalizeActive(groups.segments, groups.entry)) ?? draft
  }

  // The value both popups and the steppers work relative to: what's on screen
  // if it parses, else the last committed value, else the mount fallback. It's
  // what keeps a calendar pick from resetting the time (and a time pick from
  // resetting the day) — each replaces only its own half of this.
  function currentValue(): Date {
    const parsed = parseDateTimeDraft(draftInProgress(), format, yearOffset)
    if (parsed instanceof Date) return parsed
    return displayValue ?? fallbackValue
  }

  // Re-seeds the groups after something other than typing replaced the value
  // (an Arrow step, a calendar pick, a time pick), carrying the group the user
  // was in and its highlight — seeding alone would leave the highlight
  // wherever the new text happens to end.
  function reseedTemplate(next: string) {
    if (!groups) return
    const seeded = templateMoveTo(groups.segments, entryFromText(next), groups.entry.active)
    setTemplateEntry(seeded)
    if (inputElementRef.current) selectTemplateSlot(inputElementRef.current, seeded)
  }

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(start, end)
      pendingSelectionRef.current = null
    }
  })

  function valuesEqual(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b
    return isSameDateTime(a, b)
  }

  function commit(next: Date | null) {
    const changed = !valuesEqual(next, lastCommittedRef.current)
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    const nextText = formatDisplay(next)
    updateDraft(nextText)
    return nextText
  }

  function commitDraft() {
    if (isReadOnly) return
    if (groups) {
      // The groups turn into a draft string first and then go through the very
      // same parse/clamp/commit path typed text always did. That conversion
      // only succeeds once every group is filled: an unfinished entry commits
      // nothing, the way a native date/time input refuses to report a
      // half-entered value.
      const finalized = templateFinalizeActive(groups.segments, groups.entry)
      const asDraft = templateToDraft(groups.segments, finalized)
      const parsedGroups = asDraft === null ? undefined : parseDateTimeDraft(asDraft, format, yearOffset)
      setTemplateEntry(null)
      if (parsedGroups instanceof Date) commit(clampDateTime(parsedGroups, min, max))
      else if (isTemplateEmpty(finalized) && !isRequired) commit(null)
      else updateDraft(formattedValue)
      return
    }
    const parsed = parseDateTimeDraft(draft, format, yearOffset)
    if (parsed === undefined || (isRequired && parsed === null)) {
      updateDraft(formattedValue)
      return
    }
    commit(parsed === null ? null : clampDateTime(parsed, min, max))
  }

  // Which half the caret is in, or null when the field isn't being edited as
  // groups at all (an alphabetic format). What an Arrow key does follows from
  // this: the two parent controls step differently, and both behaviors are
  // wanted here — the one that applies is the one the user is standing in.
  function activeSegment(): MaskSegment | null {
    if (!groups) return null
    const fillable = groups.segments.filter((segment) => segment.type !== 'literal')
    return fillable[groups.entry.active] ?? null
  }

  function stepBy(direction: 1 | -1) {
    const base = currentValue()
    const active = activeSegment()
    if (active && isTimeSegment(active)) {
      // InputTime's rule: stepping moves through the generated entries rather
      // than adding raw minutes, so an off-grid time snaps onto the list
      // instead of carrying its remainder forever. Inert without a list, for
      // the same reason InputTime's is — no spacing means nothing to step by.
      if (!hasTimeList) return
      const next = stepThroughTimes(times, timeOfDayMinutes(base), direction)
      if (next === undefined) return
      reseedTemplate(commit(clampDateTime(withTimeOfDay(base, next), min, max)))
      return
    }
    // InputDate's rule: a day per press, unconditional (there is no `step`
    // prop for the date half in Wijmo either). Also what an alphabetic,
    // pick-only format falls back to, since it has no groups to stand in.
    reseedTemplate(commit(clampDateTime(addDays(base, direction), min, max)))
  }

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
    committedValue,
    calendarId,
    calendarAriaLabel,
    onPick: (day: Date) => {
      const next = clampDateTime(withTimeOfDay(day, timeOfDayMinutes(currentValue())), min, max)
      reseedTemplate(commit(next))
    },
    // Internal only — neither popup's open state leaves the component; this
    // just keeps aria-expanded and the "one popup at a time" rule in step.
    onOpenChange: setIsCalendarOpen,
  })

  function openCalendar() {
    dropdown.close()
    toggleCalendar()
  }

  function handleToggleCalendar() {
    if (isDisabled || isReadOnly) return
    openCalendar()
  }

  function handleToggleTimeList() {
    if (isDisabled || isReadOnly || !hasTimeList) return
    // Two popups on one field, so opening either closes the other rather than
    // letting them overlap each other's space below the input.
    if (isCalendarOpen) toggleCalendar()
    dropdown.toggle()
    // The button suppresses its own mousedown (so opening the list doesn't
    // blur the field and commit the draft), which also means it never moves
    // focus — without this, Arrow/Enter would never reach the list.
    inputElementRef.current?.focus()
  }

  function selectTime(minutes: number) {
    if (isReadOnly) return
    const next = clampDateTime(withTimeOfDay(currentValue(), minutes), min, max)
    const nextText = commit(next)
    dropdown.close()
    inputElementRef.current?.focus()
    reseedTemplate(nextText)
  }

  // Highlights one whole group rather than the whole value — a native
  // date/time input's sub-field selection — and moves the entry's active group
  // to match, since that's the one the next keystroke fills. 'caret' takes the
  // group a pointer landed in (an offset only the browser knows, which is what
  // the deferral is for); 'start' is a keyboard tab-in.
  function selectSegment(el: HTMLInputElement, from: 'caret' | 'start', segments: MaskSegment[]) {
    selectRangeAtCaret(el, (caret) => {
      const index = templateSlotAt(segments, from === 'caret' ? caret : 0)
      setTemplateEntry((prev) => (prev === null ? prev : templateMoveTo(segments, prev, index)))
      const range = slotRanges[index] ?? null
      // Landing in the field can change its text (an unpadded format pads out
      // for editing), and React writing that text puts the caret back at the
      // end — so the range is re-applied after the render as well as now.
      if (range) pendingSelectionRef.current = range
      return range
    })
  }

  // Puts the highlight back on the group the entry says is active — see
  // InputDate's copy for why it is applied three times over.
  function selectTemplateSlot(el: HTMLInputElement, entry: TemplateEntry) {
    if (!maskSegments) return
    const range = slotRanges[entry.active]
    if (!range) return
    pendingSelectionRef.current = range
    applySelection(el, range.start, range.end)
  }

  // Puts a new entry on screen: the state it renders from, the text it
  // reports, and the highlight on the group it is now in. A rejected edit
  // leaves the groups as they were, so only the highlight needs putting back.
  function showTemplate(
    el: HTMLInputElement,
    segments: MaskSegment[],
    next: TemplateEntry | 'reject',
    was: TemplateEntry,
  ) {
    if (next === 'reject') {
      selectTemplateSlot(el, was)
      return
    }
    setTemplateEntry(next)
    onTextChange?.(templateText(segments, next))
    selectTemplateSlot(el, next)
  }

  // The offset-taking path, for the edits that genuinely arrive as character
  // spans: a selection dragged across groups, and the change event carrying a
  // paste or an autofill.
  function applyTemplateEdit(
    el: HTMLInputElement,
    segments: MaskSegment[],
    entry: TemplateEntry,
    edit: { start: number; removedCount: number; inserted: string },
  ) {
    const next = templateEdit(segments, entry, edit)
    // Wiping the whole field at once (select-all, then delete) on a required
    // field snaps straight back to a value rather than waiting for blur, so
    // there is always something to type over. Clearing groups one at a time is
    // left alone — see InputDate's copy of this note.
    const wiped = next !== 'reject' && isRequired && templateWipedByEdit(segments, next, edit)
    showTemplate(el, segments, wiped ? entryFromText(formatDisplay(fallbackValue)) : next, entry)
  }

  // Typing is handled on keydown rather than from the resulting text, because
  // padding makes that text ambiguous — see InputDate/InputTime's copies.
  function handleTemplateKey(event: KeyboardEvent<HTMLInputElement>, segments: MaskSegment[], entry: TemplateEntry) {
    const el = event.currentTarget
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? start
      if (end > start) applyTemplateEdit(el, segments, entry, { start, removedCount: end - start, inserted: '' })
      else showTemplate(el, segments, templateClearActive(entry), entry)
      return
    }
    if (event.key.length !== 1) return
    event.preventDefault()
    showTemplate(el, segments, templateTypeIntoActive(segments, entry, event.key), entry)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    if (groups) {
      if (isReadOnly) return
      // Only input the keyboard path never sees reaches here: a paste, an
      // autofill, or a soft keyboard/IME that commits text without a key.
      applyTemplateEdit(el, groups.segments, groups.entry, diffStrings(templateValue, el.value))
      return
    }
    // Nothing typed reaches here any more: a format the groups can describe is
    // edited through them, and one they can't is not typeable at all. What's
    // left is text the field is *given*, taken as-is and validated at commit.
    const next = el.value
    if (isRequired && next.trim() === '') {
      const fallbackText = formatDisplay(fallbackValue)
      updateDraft(fallbackText)
      pendingSelectionRef.current = { start: 0, end: fallbackText.length }
      return
    }
    updateDraft(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Left/Right/Home/End walk between groups, the keyboard counterpart to
    // clicking one. While the list is open Home/End belong to it instead
    // (jumping to the first/last time), as they do in InputTime.
    const navigates =
      event.key in GROUP_NAV_KEYS && (!dropdown.isOpen || (event.key !== 'Home' && event.key !== 'End'))
    if (groups && navigates) {
      event.preventDefault()
      const next = templateMoveTo(groups.segments, groups.entry, GROUP_NAV_KEYS[event.key](groups.entry))
      setTemplateEntry(next)
      selectTemplateSlot(event.currentTarget, next)
      return
    }
    // Alt+Arrow is the standard combobox gesture for showing/hiding the popup.
    // With two popups, it opens the one belonging to the group the caret is in
    // — the same rule that decides what a bare Arrow steps.
    if (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (isDisabled || isReadOnly) return
      const active = activeSegment()
      if (active && isTimeSegment(active)) handleToggleTimeList()
      else openCalendar()
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
      else if (!isReadOnly) stepBy(isDown ? -1 : 1)
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
      // Discarding an in-progress edit re-seeds the groups from the value the
      // field still holds — it keeps focus, so it stays in group-editing mode
      // rather than falling back to plain text.
      if (groups) {
        const reset = entryFromText(formattedValue)
        setTemplateEntry(reset)
        selectTemplateSlot(event.currentTarget, reset)
        return
      }
      updateDraft(formattedValue)
      return
    }
    if (dropdown.isOpen && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      dropdown.setHighlightedIndex(event.key === 'Home' ? 0 : times.length - 1)
      return
    }
    // Everything left that could be a character or a deletion goes to the
    // groups.
    if (groups && !isReadOnly) handleTemplateKey(event, groups.segments, groups.entry)
  }

  // React's synthetic onWheel is attached passively, so preventDefault()
  // inside it silently fails — a real native listener with { passive: false }
  // is required, same as the other three inputs.
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

  const showsCalendarButton = showDropdownButton
  const showsTimeButton = showDropdownButton && hasTimeList
  const buttonCount = (showsCalendarButton ? 1 : 0) + (showsTimeButton ? 1 : 0)

  return (
    <div className="relative" ref={dropdown.rootRef}>
      <input
        {...rest}
        ref={(node) => {
          inputElementRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        type="text"
        disabled={isDisabled}
        readOnly={isReadOnly || !isTypeable}
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
        placeholder={placeholderText}
        // The groups stand in for the draft while the field is being edited —
        // a display substitution, so the draft itself stays the single source
        // of truth for everything that parses or reports it.
        value={groups ? templateValue : draft}
        onChange={handleChange}
        // Whether this focus came from a pointer decides which group gets
        // highlighted, and the focus event itself can't tell — so the
        // mousedown that precedes it is what records it.
        onMouseDown={() => {
          focusFromPointerRef.current = true
        }}
        onFocus={(event) => {
          setIsFocused(true)
          const fromPointer = focusFromPointerRef.current
          focusFromPointerRef.current = false
          if (maskSegments && !isReadOnly) {
            if (templateEntry === null) setTemplateEntry(entryFromText(draft))
            selectSegment(event.currentTarget, fromPointer ? 'caret' : 'start', maskSegments)
            return
          }
          // A format the groups can't describe is still edited as plain text,
          // so it keeps select-everything-on-focus. Deferred — see
          // selectAllOnFocus's own doc comment.
          selectAllOnFocus(event.currentTarget)
        }}
        onClick={(event) => {
          // With typing unavailable, the field itself is another way to reach
          // the input method that's left — the calendar, since it owns the
          // larger half of the value.
          if (!isTypeable && !isDisabled && !isReadOnly) {
            openCalendar()
            return
          }
          // Clicking a different group of an already-focused field fires no
          // focus event, so the highlight has to be re-derived here too. A
          // plain click collapses the caret at the pointer, while a drag (or
          // the highlight just applied) leaves a range — so a non-empty
          // selection is the signal to keep out of the way.
          const el = event.currentTarget
          if (groups && el.selectionStart === el.selectionEnd) selectSegment(el, 'caret', groups.segments)
        }}
        onBlur={() => {
          setIsFocused(false)
          commitDraft()
        }}
        onKeyDown={handleKeyDown}
        // The icons overlay the input's right edge rather than sitting beside
        // it, so the text needs room to stop short of them — two icons need
        // twice the room.
        className={`${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${buttonCount === 2 ? 'pr-18' : buttonCount === 1 ? 'pr-11' : ''} ${className ?? ''}`}
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
              tabIndex={-1}
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
        <div
          ref={dropdown.listRef}
          id={listId}
          role="listbox"
          aria-label={optionsAriaLabel}
          style={{ maxHeight: maxDropdownHeight }}
          className={listClassName}
        >
          {times.map((minutes, index) => (
            <div
              key={minutes}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={displayValue !== null && minutes === timeOfDayMinutes(displayValue)}
              // Keeps focus in the text field: without this the mousedown
              // blurs the input, which commits the draft and can close the
              // list before the click that picks an entry ever lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectTime(minutes)}
              className={optionClassName(
                displayValue !== null && minutes === timeOfDayMinutes(displayValue),
                index === dropdown.highlightedIndex,
              )}
            >
              {timeLabels[index]}
            </div>
          ))}
        </div>
      )}
      {/* React-opaque host for flatpickr's popup — see the DOM-ownership
          escape-hatch note in CLAUDE.md; must stay empty in JSX. */}
      <div ref={containerRef} className="absolute inset-x-0 bottom-0 h-0 w-0" />
    </div>
  )
})
