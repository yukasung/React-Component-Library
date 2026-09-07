import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { useSyncedState } from '../../hooks/useSyncedState'
import { applySelection, selectRangeAtCaret } from '../../lib/domSelection'
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
import {
  MINUTES_PER_DAY,
  buildTimeList,
  clampMinutes,
  formatTimeOfDay,
  isSameTime,
  nearestTimeIndex,
  parseTimeDraft,
  stepThroughTimes,
  timeMaskSegments,
  timeOfDayMinutes,
  withTimeOfDay,
} from '../../lib/time'
import { useTimeDropdown } from './useTimeDropdown'

// 24-hour hours:minutes. Also the fallback whenever `format` names a token
// this component can't render (see the format prop's doc comment).
const DEFAULT_FORMAT = 'H:i'
// Every format this component accepts is maskable (unlike InputDate, whose
// month/weekday-name tokens aren't), so the fallback format's segments are
// what an unusable `format` resolves to — computed once, not per render.
const DEFAULT_MASK_SEGMENTS = timeMaskSegments(DEFAULT_FORMAT)!

// Keys that move between groups, and where each moves to. Module scope so a
// keydown that falls through to the dropdown branches doesn't allocate it.
const GROUP_NAV_KEYS: Record<string, (entry: TemplateEntry) => number> = {
  ArrowLeft: (entry) => entry.active - 1,
  ArrowRight: (entry) => entry.active + 1,
  Home: () => 0,
  End: (entry) => entry.slots.length - 1,
}

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
  // Falls back to the default rather than rendering a wrong time when the
  // format names any other token (`S`/`s` for seconds in particular, which
  // this component doesn't support — it works at whole-minute granularity
  // throughout), or when it pairs `H` with `K`, which can't mean anything:
  // a 24-hour hour already says which half of the day it is.
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
  // Wijmo-style two-way binding for the raw text shown in the control,
  // distinct from `value` — same contract as InputNumber/InputDate.
  text?: string
  onTextChange?: (text: string) => void
  // Steps through the dropdown's entries per wheel notch; opt-in and
  // focus-gated, same convention as InputNumber/InputDate.
  handleWheel?: boolean
  showDropdownButton?: boolean
  // Height cap (px) for the scrollable list. A real necessity rather than a
  // nicety here: a full day at the default 15-minute step is 96 entries.
  maxDropdownHeight?: number
  dropdownIcon?: ReactNode
  dropdownAriaLabel?: string
  optionsAriaLabel?: string
}

// Same layout as InputDate — see the note on its own copy of these: the
// border, background and focus ring sit on the <input>, and the icon
// overlays its right edge rather than occupying a bordered cell beside it.
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

// No hover treatment, matching InputDate and the reference it came from —
// the icon holds one gray at rest and only changes when disabled.
const dropdownButtonClassName =
  'absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:disabled:text-gray-700'

// Mirrors the calendar popup's own surface treatment (see
// flatpickr-theme.css) so the two dropdowns in this library read as one
// design, even though only this one is rendered by React.
const listClassName =
  'absolute inset-x-0 top-full z-50 mt-2 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-white/5 dark:bg-gray-900'

// Hover is styled rather than tracked: routing it through `highlightedIndex`
// would re-render all 96 entries and force a layout read (the scroll-into-view
// effect) for every row the pointer crosses, to reach a row that is by
// definition already visible. The keyboard highlight stays real state.
function optionClassName(isSelected: boolean, isHighlighted: boolean): string {
  const base = 'cursor-pointer px-3 py-1.5 text-sm'
  if (isSelected) return `${base} font-medium`
  const hover = 'hover:bg-gray-100 dark:hover:bg-white/5'
  if (isHighlighted) return `${base} ${hover} bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90`
  return `${base} ${hover} text-gray-700 dark:text-gray-300`
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
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
    handleWheel = false,
    showDropdownButton = true,
    maxDropdownHeight = 200,
    dropdownIcon,
    dropdownAriaLabel = 'Toggle time list',
    optionsAriaLabel = 'Time options',
    // Native passthrough (it arrives via InputHTMLAttributes, not as a prop
    // of this component's own), pulled out of `rest` only so an empty field
    // can fall back to the mask's own shape — see placeholderText below.
    placeholder,
    className,
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
  // The tokenizer runs once here and its result doubles as the live-typing
  // mask, so the format is never walked twice. Cheap either way (format
  // strings are ~5 chars), which is why there's no useMemo.
  const ownSegments = timeMaskSegments(format)
  const resolvedFormat = ownSegments ? format : DEFAULT_FORMAT
  const maskSegments = ownSegments ?? DEFAULT_MASK_SEGMENTS
  // The format as an empty template ("__:__", or "__:__ __" for a 12-hour
  // format) — what a native time input shows when it has no value. It
  // follows `format` for free, being derived from the very segments the live
  // masker types into. Used two ways: as the field's placeholder at rest
  // (unless the consumer supplied their own), and as real, highlightable
  // text once an empty field is focused (see `templateVisible`).
  const maskTemplate = maskPlaceholder(maskSegments)
  const placeholderText = placeholder ?? maskTemplate
  const minMinutes = min ? timeOfDayMinutes(min) : null
  const maxMinutes = max ? timeOfDayMinutes(max) : null
  // buildTimeList already treats a null/non-positive step as "no entries",
  // so there's no separate hasStep condition to keep in sync with it —
  // an empty list *is* the "no dropdown" state.
  const times = useMemo(
    () => buildTimeList(minMinutes ?? 0, maxMinutes ?? MINUTES_PER_DAY - 1, step ?? 0),
    [minMinutes, maxMinutes, step],
  )
  // Rendered once per entry, so it would otherwise re-tokenize the format
  // 96 times on every keystroke while the list is open.
  const timeLabels = useMemo(
    () => times.map((minutes) => formatTimeOfDay(minutes, resolvedFormat)),
    [times, resolvedFormat],
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
  // Focus hands editing over to the fixed-width template
  // (src/lib/maskTemplate.ts): hour/minute/designator groups that hold their
  // slot whether or not they're filled, exactly like a native time input's
  // sub-fields. Non-null means the field is being edited that way, which is
  // whenever it has focus and typing is allowed.
  //
  // Deliberately not the draft: the groups (and their fillers) live in the
  // *rendered* value, so parseTimeDraft and the commit path only ever see a
  // finished time string. The entry becomes a draft at commit time, and only
  // once every group is filled.
  const [templateEntry, setTemplateEntry] = useState<TemplateEntry | null>(null)
  const templateVisible = templateEntry !== null
  const templateValue = templateEntry !== null ? templateText(maskSegments, templateEntry) : ''
  // The fixed position table the groups sit at: it depends only on the format,
  // so it's derived once per render rather than rebuilt at each place that
  // reads it (InputDate keeps its own copy of this for the same reason).
  const slotRanges = templateRanges(maskSegments)
  // Seeds an entry from whatever the field is displaying, so editing a time
  // that's already there starts from its groups rather than from blank ones.
  function entryFromDraft(): TemplateEntry {
    return templateFromRaw(maskSegments, draft)
  }
  // The time a required field falls back to when every group is emptied.
  function entryFromFallback(): TemplateEntry {
    return templateFromRaw(maskSegments, formatDisplay(clampMinutes(fallbackMinutes, minMinutes, maxMinutes)))
  }
  const listId = useId()
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop.
  const lastCommittedRef = useRef(committedValue)
  // Only an external value change replaces the commit baseline; an unchanged
  // controlled prop must not undo a local commit awaiting parent acceptance.
  const previousControlledValueRef = useRef(value)
  if (
    isControlled &&
    (previousControlledValueRef.current === undefined || !timesEqual(value, previousControlledValueRef.current))
  ) {
    previousControlledValueRef.current = value
    lastCommittedRef.current = value
  }
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  // See the input's own onMouseDown/onFocus: which group the focus handler
  // highlights depends on whether a pointer put the caret somewhere first.
  const focusFromPointerRef = useRef(false)

  const dropdown = useTimeDropdown({
    itemCount: times.length,
    selectedIndex: nearestTimeIndex(times, displayMinutes),
  })
  // An empty list and "no dropdown" are the same state — see `times`.
  const hasDropdown = times.length > 0

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(start, end)
      pendingSelectionRef.current = null
    }
  })

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
    const text = formatDisplay(nextMinutes)
    updateDraft(text)
    return text
  }

  function commitDraft() {
    if (isReadOnly) return
    if (templateEntry !== null) {
      // The entry turns into a draft string first and then goes through the
      // very same parse/clamp/commit path a typed string always did — so
      // min/max, the date part and the de-dupe guard all behave identically.
      // That conversion only succeeds once every group is filled: an
      // unfinished entry commits nothing, the way a native time input refuses
      // to report a half-entered time. `null` is committed only when the user
      // actually emptied the field, and only where null is allowed.
      const finalized = templateFinalizeActive(maskSegments, templateEntry)
      const asDraft = templateToDraft(maskSegments, finalized)
      const parsed = asDraft === null ? undefined : parseTimeDraft(asDraft, resolvedFormat)
      setTemplateEntry(null)
      if (typeof parsed === 'number') commit(clampMinutes(parsed, minMinutes, maxMinutes))
      else if (isTemplateEmpty(finalized) && !isRequired) commit(null)
      else updateDraft(formattedValue)
      return
    }
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
  // What the field is showing, as a draft string — the groups while they're
  // being edited (they are the live text then, and the draft still holds the
  // last committed time), the draft itself otherwise. Stepping has to read
  // this, or an Arrow key would step from a time the user has already typed
  // over.
  function draftInProgress(): string {
    if (templateEntry === null) return draft
    return templateToDraft(maskSegments, templateFinalizeActive(maskSegments, templateEntry)) ?? draft
  }

  // Re-seeds the groups after something other than typing replaced the value
  // (an Arrow step, a dropdown pick), keeping the group the user was in and
  // its highlight — dropping out of group editing instead would leave the
  // field with no highlighted group and the next keystroke nowhere to go.
  function reseedTemplate(text: string) {
    if (templateEntry === null) return
    const seeded = templateMoveTo(maskSegments, templateFromRaw(maskSegments, text), templateEntry.active)
    setTemplateEntry(seeded)
    if (inputElementRef.current) selectTemplateSlot(inputElementRef.current, seeded)
  }

  function stepBy(direction: 1 | -1) {
    if (!hasDropdown || isReadOnly) return
    const parsed = parseTimeDraft(draftInProgress(), resolvedFormat)
    const current = typeof parsed === 'number' ? parsed : displayMinutes
    const next = stepThroughTimes(times, current, direction)
    if (next === undefined) return
    reseedTemplate(commit(next))
  }

  function selectTime(minutes: number) {
    if (isReadOnly) return
    const text = commit(minutes)
    dropdown.close()
    inputElementRef.current?.focus()
    reseedTemplate(text)
  }

  // Highlights one whole hour/minute/designator group rather than the whole
  // value — a native time input's sub-field selection — and moves the entry's
  // active group to match, since that's the one the next keystroke fills.
  //
  // `from` is which group to pick: 'caret' for a pointer, whose landing offset
  // the browser decides and which is the whole point of the deferral; 'start'
  // for a keyboard tab-in or a programmatic .focus(), where there is no
  // pointer and the first group is what a native time input highlights.
  // Reading the caret in the keyboard case instead would make the result
  // depend on where each engine happens to park it.
  function selectSegment(el: HTMLInputElement, from: 'caret' | 'start') {
    selectRangeAtCaret(el, (caret) => {
      const index = templateSlotAt(maskSegments, from === 'caret' ? caret : 0)
      setTemplateEntry((prev) => (prev === null ? prev : templateMoveTo(maskSegments, prev, index)))
      const range = slotRanges[index] ?? null
      // Landing in the field can change its text (a format whose display is
      // unpadded, e.g. "2:30 PM", pads out to "02:30 PM" for editing), and
      // React writing that text puts the caret back at the end — so the range
      // is re-applied after the render as well as now.
      if (range) pendingSelectionRef.current = range
      return range
    })
  }

  // Puts the highlight back on the group the entry says is active. Applied
  // three times over, because each covers a case the others don't: straight
  // away (for an edit that changes nothing and so never re-renders), from the
  // post-render effect (once React has written the new text, which would
  // otherwise leave the caret at the end), and once more on a microtask —
  // which is the one that survives the browser's own post-input-event cursor
  // handling, the same reason applySelection exists at all.
  function selectTemplateSlot(el: HTMLInputElement, entry: TemplateEntry) {
    const range = slotRanges[entry.active]
    if (!range) return
    pendingSelectionRef.current = range
    applySelection(el, range.start, range.end)
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

  // Puts a new entry on screen: the state it renders from, the text it
  // reports, and the highlight on the group it is now in. A rejected edit
  // leaves the groups as they were (React restores the text it had already
  // rendered), so only the highlight needs putting back.
  function showTemplate(el: HTMLInputElement, next: TemplateEntry | 'reject', was: TemplateEntry) {
    if (next === 'reject') {
      selectTemplateSlot(el, was)
      return
    }
    setTemplateEntry(next)
    onTextChange?.(templateText(maskSegments, next))
    selectTemplateSlot(el, next)
  }

  // The offset-taking path, for the edits that genuinely arrive as character
  // spans: a selection dragged across groups, and the change event carrying a
  // paste or an IME commit. Typing goes through templateTypeIntoActive instead
  // — same rules, without describing a group as the characters it occupies.
  function applyTemplateEdit(
    el: HTMLInputElement,
    entry: TemplateEntry,
    edit: { start: number; removedCount: number; inserted: string },
  ) {
    const next = templateEdit(maskSegments, entry, edit)
    // Wiping the whole field at once (select-all, then delete) on a required
    // field snaps straight back to a value rather than waiting for blur, so
    // there is always something to type over — mirroring InputNumber's zero
    // and InputDate's today. Clearing groups one at a time is left alone:
    // that's a deliberate walk towards empty, and refilling the field under
    // the user would read as "this group can't be deleted". Blur still
    // refuses to leave a required field with no value at all.
    const wiped = next !== 'reject' && isRequired && templateWipedByEdit(maskSegments, next, edit)
    showTemplate(el, wiped ? entryFromFallback() : next, entry)
  }

  // Typing is handled on keydown rather than from the resulting text, because
  // padding makes that text ambiguous: a group showing "01" that gets a "0"
  // typed over it produces "0:__", which is indistinguishable from deleting
  // the "1". The key itself carries the intent, so the browser is never let
  // near the value (every handled key is preventDefault'd) and `onChange`
  // below is left for the input this can't see — a paste or an IME commit.
  function handleTemplateKey(event: KeyboardEvent<HTMLInputElement>, entry: TemplateEntry): boolean {
    const el = event.currentTarget
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? start
      // A dragged selection is a character span and can cover several groups,
      // so it goes through the offset path (which is also where the
      // required-field wipe is decided). A collapsed caret means one group,
      // and a group is the unit deletion works in.
      if (end > start) applyTemplateEdit(el, entry, { start, removedCount: end - start, inserted: '' })
      else showTemplate(el, templateClearActive(entry), entry)
      return true
    }
    if (event.key.length !== 1) return false
    event.preventDefault()
    showTemplate(el, templateTypeIntoActive(maskSegments, entry, event.key), entry)
    return true
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    if (isReadOnly || !isEditable) return
    const entry = templateEntry ?? entryFromDraft()
    // Only input the keyboard path never sees reaches here: a paste, an
    // autofill, or a soft keyboard/IME that commits text without a key. The
    // multi-character case replays the whole run through the groups, the same
    // way a pasted time is read anywhere else.
    applyTemplateEdit(el, entry, diffStrings(templateText(maskSegments, entry), el.value))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Left/Right/Home/End walk between groups, the keyboard counterpart to
    // clicking one — there is no free-roaming caret to move instead, since the
    // field is edited a group at a time.
    const navigates = event.key in GROUP_NAV_KEYS && (!dropdown.isOpen || (event.key !== 'Home' && event.key !== 'End'))
    if (templateVisible && navigates) {
      event.preventDefault()
      const next = templateMoveTo(maskSegments, templateEntry, GROUP_NAV_KEYS[event.key](templateEntry))
      setTemplateEntry(next)
      selectTemplateSlot(event.currentTarget, next)
      return
    }
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
      // Discarding an in-progress edit re-seeds the groups from the value the
      // field still holds (empty groups again, for a field that had none) —
      // the field keeps focus, so it stays in group-editing mode rather than
      // falling back to plain text.
      if (templateVisible) {
        const reset = templateFromRaw(maskSegments, formattedValue)
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
    // groups — see handleTemplateKey for why editing is driven from the key
    // rather than from the text the browser would have produced.
    if (templateVisible && !isReadOnly && isEditable) handleTemplateKey(event, templateEntry)
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
        // A non-editable field is read-only as far as the browser's own
        // text entry goes, but not read-only as a control — hence the
        // separate isReadOnly styling and the still-live dropdown.
        readOnly={isReadOnly || !isEditable}
        required={isRequired}
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
        placeholder={placeholderText}
        // The template stands in for the draft only while the draft is empty
        // and focused — a display substitution, so the draft itself stays the
        // single source of truth for everything that parses or reports it.
        value={templateVisible ? templateValue : draft}
        onChange={handleChange}
        // Whether this focus came from a pointer decides which group gets
        // highlighted, and the focus event itself can't tell — so the
        // mousedown that precedes it is what records it. Consumed (and
        // reset) by the focus handler below, so a mousedown that never
        // leads to focus can't leak into a later keyboard one.
        onMouseDown={() => {
          focusFromPointerRef.current = true
        }}
        onFocus={(event) => {
          setIsFocused(true)
          // Landing in the field highlights one part of the time instead of
          // the whole value — the hour when tabbing in, or whichever group
          // was clicked. Deferred inside the helper; a synchronous selection
          // here is overwritten by the click's own native caret positioning
          // in WebKit/Safari.
          const fromPointer = focusFromPointerRef.current
          focusFromPointerRef.current = false
          // Editing starts here: the field's text becomes a set of groups
          // seeded from whatever it was displaying. A field that can't be
          // typed into keeps its plain text (the dropdown is its only input).
          if (!isReadOnly && isEditable) {
            if (templateEntry === null) setTemplateEntry(entryFromDraft())
            selectSegment(event.currentTarget, fromPointer ? 'caret' : 'start')
          }
        }}
        onBlur={() => {
          setIsFocused(false)
          // commitDraft owns both cases: a template that's complete commits
          // like any typed time, and one that isn't (including one nothing was
          // typed into) is dropped, handing the field back to its placeholder.
          commitDraft()
        }}
        onClick={(event) => {
          // With typing disabled the field itself is just another way
          // to reach the only input method left.
          if (!isEditable && hasDropdown && !isDisabled && !isReadOnly) dropdown.open()
          // Clicking a different group of an already-focused field fires no
          // focus event, so the highlight has to be re-derived here too. A
          // plain click collapses the caret at the pointer, while a
          // drag-selection (or the highlight the focus path just applied)
          // leaves a range behind — so a non-empty selection is the signal
          // to keep out of the way.
          const el = event.currentTarget
          if (templateVisible && el.selectionStart === el.selectionEnd) selectSegment(el, 'caret')
        }}
        onKeyDown={handleKeyDown}
        // The icon overlays the input's right edge, so the text needs room
        // to stop short of it.
        className={`${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${showDropdownButton && hasDropdown ? 'pr-11' : ''} ${className ?? ''}`}
      />
      {showDropdownButton && hasDropdown && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={dropdownAriaLabel}
          disabled={isDisabled || isReadOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleDropdown}
          className={dropdownButtonClassName}
        >
          {dropdownIcon ?? <ClockIcon />}
        </button>
      )}
      {dropdown.isOpen && hasDropdown && (
        <div
          ref={dropdown.listRef}
          id={listId}
          role="listbox"
          aria-label={optionsAriaLabel}
          style={{ maxHeight: maxDropdownHeight }}
          className={listClassName}
        >
          {times.map((minutes, index) => {
            const isSelected = minutes === displayMinutes
            return (
              <div
                key={minutes}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                style={isSelected ? { backgroundColor: 'var(--rc-color-primary, #465fff)', color: 'white' } : undefined}
                // Keeps focus in the text field: without this the mousedown
                // blurs the input, which commits the draft and can close the
                // list before the click that picks an entry ever lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTime(minutes)}
                className={optionClassName(isSelected, index === dropdown.highlightedIndex)}
              >
                {timeLabels[index]}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
