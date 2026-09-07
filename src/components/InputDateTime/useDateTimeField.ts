import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'
import type flatpickr from 'flatpickr'
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
import type { MaskSegment } from '../../lib/inputMask'
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
import { stepThroughTimes, timeOfDayMinutes, withTimeOfDay } from '../../lib/time'

// The text field's own half of InputDateTime: the commit model, the draft, and
// the fixed-width groups the value is typed as. Everything here works on the
// <input> alone — the two popups (calendar, time list) live in the component,
// and reach this through pickDate/pickTime/currentValue.
//
// The split is organizational only. This is still the copy of the group-editing
// wiring InputDate and InputTime each keep their own of (CLAUDE.md's
// "duplicated, not shared" note); it just doesn't have to sit in the same file
// as the markup.

// Keys that move between groups while the field is edited as groups, and how
// far each moves. Module scope so a keydown that falls through to the popup
// branches doesn't allocate it.
const GROUP_NAV_KEYS: Record<string, (entry: TemplateEntry) => number> = {
  ArrowLeft: (entry) => entry.active - 1,
  ArrowRight: (entry) => entry.active + 1,
  Home: () => 0,
  End: (entry) => entry.slots.length - 1,
}

export interface UseDateTimeFieldOptions {
  value: Date | null | undefined
  defaultValue: Date | null
  onChange: ((value: Date | null) => void) | undefined
  text: string | undefined
  onTextChange: ((text: string) => void) | undefined
  min: Date | null
  max: Date | null
  format: string
  // The offset added to a Gregorian year for Buddhist Era, and the flatpickr
  // locale that renders its month names — both resolved from `locale` by the
  // component, which owns that mapping.
  yearOffset: number
  flatpickrLocale: flatpickr.CustomLocale | undefined
  isRequired: boolean
  isReadOnly: boolean
  isDisabled: boolean
  handleWheel: boolean
  // The entries the time list offers, which is also what Arrow/wheel stepping
  // moves through while the caret is in a time group. Empty means no list.
  times: number[]
}

export interface UseDateTimeFieldResult {
  inputRef: RefObject<HTMLInputElement | null>
  committedValue: Date | null
  // The value the field displays, which for a required field with no value of
  // its own is the mount-time fallback rather than blank.
  displayValue: Date | null
  // What the <input>'s `value` should be: the groups while they're being
  // edited, the draft otherwise.
  displayText: string
  // The format's own shape ("____-__-__ __:__"), or undefined for a format the
  // groups can't describe.
  placeholderShape: string | undefined
  // False for a format whose text can't be read back (a month name, seconds):
  // the field takes its value from the popups only and is read-only to the
  // browser's own text entry. Not the same thing as isReadOnly.
  isTypeable: boolean
  // The value the popups and steppers work relative to — see its definition.
  currentValue: () => Date
  // Whether the caret sits in a time group (hour/minute/designator), which is
  // what decides between day-stepping and list-stepping, and which popup
  // Alt+Arrow opens.
  isTimeGroupActive: () => boolean
  stepBy: (direction: 1 | -1) => void
  commitDraft: () => void
  // Replaces one half of the value from a popup, keeping the other.
  pickDate: (day: Date) => void
  pickTime: (minutes: number) => void
  // Keydown handlers, in the order the component's own handler tries them.
  // Each reports whether it consumed the event.
  moveGroup: (event: KeyboardEvent<HTMLInputElement>) => boolean
  discardEdit: (el: HTMLInputElement) => void
  typeIntoGroups: (event: KeyboardEvent<HTMLInputElement>) => void
  // Input handlers, passed straight through to the <input>.
  handleFocus: (event: { currentTarget: HTMLInputElement }) => void
  handleBlur: () => void
  handlePointerDown: () => void
  handleClick: (event: { currentTarget: HTMLInputElement }) => void
  handleChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function useDateTimeField({
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
}: UseDateTimeFieldOptions): UseDateTimeFieldResult {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<Date | null>(defaultValue)
  const [isFocused, setIsFocused] = useState(false)
  const committedValue = isControlled ? value : internalValue
  // The format as fixed-width groups, or undefined when it can't be one (a
  // month name has no shape to type into). Cheap to recompute every render —
  // format strings are ~15 chars — so no useMemo, as in the other two.
  const maskSegments = tokenizeDateTimeMask(format)
  const isTypeable = maskSegments !== undefined
  const placeholderShape = maskSegments ? maskPlaceholder(maskSegments) : undefined
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

  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  // Only an external value change replaces the commit baseline; an unchanged
  // controlled prop must not undo a local commit awaiting parent acceptance.
  const previousControlledValueRef = useRef(value)
  if (
    isControlled &&
    (previousControlledValueRef.current === undefined || !valuesEqual(value, previousControlledValueRef.current))
  ) {
    previousControlledValueRef.current = value
    lastCommittedRef.current = value
  }
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // See handlePointerDown/handleFocus: which group the focus handler highlights
  // depends on whether a pointer put the caret somewhere first.
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
    if (inputRef.current) selectTemplateSlot(inputRef.current, seeded)
  }

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputRef.current.setSelectionRange(start, end)
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
  // groups at all (an alphabetic format).
  function activeSegment(): MaskSegment | null {
    if (!groups) return null
    const fillable = groups.segments.filter((segment) => segment.type !== 'literal')
    return fillable[groups.entry.active] ?? null
  }

  function isTimeGroupActive(): boolean {
    const active = activeSegment()
    return active !== null && isTimeSegment(active)
  }

  function stepBy(direction: 1 | -1) {
    const base = currentValue()
    if (isTimeGroupActive()) {
      // InputTime's rule: stepping moves through the generated entries rather
      // than adding raw minutes, so an off-grid time snaps onto the list
      // instead of carrying its remainder forever. Inert without a list, for
      // the same reason InputTime's is — no spacing means nothing to step by.
      if (times.length === 0) return
      const next = stepThroughTimes(times, timeOfDayMinutes(base), direction)
      if (next === undefined) return
      reseedTemplate(commit(clampDateTime(withTimeOfDay(base, next), min, max)))
      return
    }
    // InputDate's rule: a day per press, unconditional. Also what an
    // alphabetic, pick-only format falls back to, since it has no groups to
    // stand in.
    reseedTemplate(commit(clampDateTime(addDays(base, direction), min, max)))
  }

  // The calendar hands back a day at its start; the list hands back minutes of
  // day. Each keeps the other half of what the field already holds.
  function pickDate(day: Date) {
    reseedTemplate(commit(clampDateTime(withTimeOfDay(day, timeOfDayMinutes(currentValue())), min, max)))
  }

  function pickTime(minutes: number) {
    if (isReadOnly) return
    reseedTemplate(commit(clampDateTime(withTimeOfDay(currentValue(), minutes), min, max)))
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

  // Left/Right/Home/End walk between groups, the keyboard counterpart to
  // clicking one. Reports whether it took the key, so the component can hand
  // Home/End to an open time list instead.
  function moveGroup(event: KeyboardEvent<HTMLInputElement>): boolean {
    if (!groups || !(event.key in GROUP_NAV_KEYS)) return false
    event.preventDefault()
    const next = templateMoveTo(groups.segments, groups.entry, GROUP_NAV_KEYS[event.key](groups.entry))
    setTemplateEntry(next)
    selectTemplateSlot(event.currentTarget, next)
    return true
  }

  // Escape: discarding an in-progress edit re-seeds the groups from the value
  // the field still holds — it keeps focus, so it stays in group-editing mode
  // rather than falling back to plain text.
  function discardEdit(el: HTMLInputElement) {
    if (groups) {
      const reset = entryFromText(formattedValue)
      setTemplateEntry(reset)
      selectTemplateSlot(el, reset)
      return
    }
    updateDraft(formattedValue)
  }

  function typeIntoGroups(event: KeyboardEvent<HTMLInputElement>) {
    if (!groups || isReadOnly) return
    handleTemplateKey(event, groups.segments, groups.entry)
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

  // Whether this focus came from a pointer decides which group gets
  // highlighted, and the focus event itself can't tell — so the mousedown that
  // precedes it is what records it.
  function handlePointerDown() {
    focusFromPointerRef.current = true
  }

  function handleFocus(event: { currentTarget: HTMLInputElement }) {
    setIsFocused(true)
    const fromPointer = focusFromPointerRef.current
    focusFromPointerRef.current = false
    if (maskSegments && !isReadOnly) {
      if (templateEntry === null) setTemplateEntry(entryFromText(draft))
      selectSegment(event.currentTarget, fromPointer ? 'caret' : 'start', maskSegments)
      return
    }
    // A format the groups can't describe is still edited as plain text, so it
    // keeps select-everything-on-focus. Deferred — see selectAllOnFocus's own
    // doc comment.
    selectAllOnFocus(event.currentTarget)
  }

  function handleBlur() {
    setIsFocused(false)
    commitDraft()
  }

  // Clicking a different group of an already-focused field fires no focus
  // event, so the highlight has to be re-derived here too. A plain click
  // collapses the caret at the pointer, while a drag (or the highlight just
  // applied) leaves a range — so a non-empty selection is the signal to keep
  // out of the way.
  function handleClick(event: { currentTarget: HTMLInputElement }) {
    const el = event.currentTarget
    if (groups && el.selectionStart === el.selectionEnd) selectSegment(el, 'caret', groups.segments)
  }

  // React's synthetic onWheel is attached passively, so preventDefault() inside
  // it silently fails — a real native listener with { passive: false } is
  // required, same as the other three inputs.
  const handleWheelRef = useRef<(event: globalThis.WheelEvent) => void>(() => {})
  handleWheelRef.current = (event) => {
    if (!handleWheel || !isFocused || isDisabled || isReadOnly) return
    event.preventDefault()
    stepBy(event.deltaY < 0 ? 1 : -1)
  }

  useEffect(() => {
    const node = inputRef.current
    if (!node) return
    function listener(event: globalThis.WheelEvent) {
      handleWheelRef.current(event)
    }
    node.addEventListener('wheel', listener, { passive: false })
    return () => node.removeEventListener('wheel', listener)
  }, [])

  return {
    inputRef,
    committedValue,
    displayValue,
    displayText: groups ? templateValue : draft,
    placeholderShape,
    isTypeable,
    currentValue,
    isTimeGroupActive,
    stepBy,
    commitDraft,
    pickDate,
    pickTime,
    moveGroup,
    discardEdit,
    typeIntoGroups,
    handleFocus,
    handleBlur,
    handlePointerDown,
    handleClick,
    handleChange,
  }
}
