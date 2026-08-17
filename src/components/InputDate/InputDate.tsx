import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import 'flatpickr/dist/flatpickr.css'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import './flatpickr-theme.css'
import { useSyncedState } from '../../hooks/useSyncedState'
import { addDays, clampDate, formatDateValue, isSameDay, parseDateDraft, startOfDay, tokenizeDateMask } from '../../lib/date'
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

// Keys that move between groups while the field is edited as groups, and how
// far each moves. Module scope so a keydown that falls through to the other
// branches doesn't allocate it.
const GROUP_NAV_KEYS: Record<string, (entry: TemplateEntry) => number> = {
  ArrowLeft: (entry) => entry.active - 1,
  ArrowRight: (entry) => entry.active + 1,
  Home: () => 0,
  End: (entry) => entry.slots.length - 1,
}

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
  dropdownIcon?: ReactNode
  dropdownAriaLabel?: string
}

// Layout ported from references/tailadmin-react/src/components/form/date-picker.tsx:
// the border, background and focus ring live on the <input> itself, and the
// calendar icon is an overlay positioned over its right edge — not a
// bordered button in its own cell beside it. Only the palette is
// translated: the reference's `brand-*` scale is exposed through the
// --rc-color-primary theme hook, while its `shadow-theme-xs` becomes shadow-sm.
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

// Unlike the reference's icon — a `pointer-events-none` <span>, purely
// decorative there — this one opens the calendar, so it stays a real button
// and keeps its accessible name. Everything visual about it matches, though:
// centred on the input's right edge, no border, no cell of its own, and no
// hover treatment — it holds the reference's plain gray at rest and only
// changes for the one state the reference's icon can't have, disabled.
const dropdownButtonClassName =
  'absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-400 dark:disabled:text-gray-700'

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
    dropdownIcon,
    dropdownAriaLabel = 'Toggle calendar',
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
  const [isOpenState, setIsOpenState] = useState(false)
  const calendarId = useId()
  const committedValue = isControlled ? value : internalValue
  const yearOffset = locale === 'th' ? BUDDHIST_ERA_OFFSET : 0
  const flatpickrLocale = locale === 'th' ? Thai : undefined
  // The format as fixed-width groups, or undefined when it can't be one:
  // alphabetic name tokens (F/M/D/l) spell their month out, so there is no
  // shape to type into. Cheap to recompute every render (format strings are
  // ~10 chars), no useMemo needed.
  const maskSegments = tokenizeDateMask(format)
  // …and that is also what decides whether the field can be typed into at
  // all. A date in "F j, Y" was never really typeable — flatpickr's parser
  // can't read those tokens back (see parseDateDraft's doc comment in
  // date.ts) — so rather than accepting keystrokes it will silently fail to
  // parse, the field takes its value from the calendar only, and says so by
  // being read-only to the browser's own text entry. It stays a live control
  // otherwise: the popup, Arrow-key stepping and the wheel all still work,
  // which is why this is not the same thing as `isReadOnly`.
  const isTypeable = maskSegments !== undefined
  // An empty field shows the shape the format is waiting for — "__/__/____"
  // for `d/m/Y`, "____-__-__" for `Y-m-d`, and so on — the way a native date
  // input does, and the same treatment InputTime gives its own formats. It
  // follows `format` for free, being derived from the very segments the mask
  // types into, which is also why an alphabetic format ("F j, Y", where the
  // mask doesn't apply) has no shape to show and falls back to no placeholder
  // at all rather than to a made-up one. A consumer-supplied placeholder
  // always wins.
  const placeholderText = placeholder ?? (maskSegments ? maskPlaceholder(maskSegments) : undefined)
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
  // See the input's own onMouseDown/onFocus: which group the focus handler
  // highlights depends on whether a pointer put the caret somewhere first.
  const focusFromPointerRef = useRef(false)
  // Group editing, the same model InputTime uses: day/month/year each occupy
  // their own fixed-width slot, holding fillers until typed into, so landing
  // in one highlights it whole and typing fills exactly that group. The
  // component-level half is deliberately kept here rather than shared with
  // InputTime — the two are meant to be usable one without the other — while
  // the rules themselves live in src/lib/maskTemplate.ts.
  //
  // Non-null means the field is being edited that way, which needs a format
  // the mask can describe: "F j, Y" spells its month out, so it has no
  // fixed-width shape and keeps the plain masker path instead.
  const [templateEntry, setTemplateEntry] = useState<TemplateEntry | null>(null)
  // The one narrowing of "is this field being edited as groups": both halves
  // have to hold — a format the mask can describe, and an entry (created on
  // focus, cleared on commit). Everything below takes `groups` rather than
  // re-testing the pair, which is also what keeps the segments non-optional
  // for the helpers that only ever run in this mode.
  const groups = maskSegments && templateEntry ? { segments: maskSegments, entry: templateEntry } : null
  // The text the groups are showing, and the fixed position table they sit
  // at: both depend only on the entry and the format, so they're derived once
  // per render rather than rebuilt at each of the four places that read them.
  const templateValue = groups ? templateText(groups.segments, groups.entry) : ''
  const slotRanges = maskSegments ? templateRanges(maskSegments) : []
  // Seeds an entry from whatever the field is displaying, so editing a date
  // that's already there starts from its groups rather than from blank ones.
  // Buddhist Era needs nothing special: the draft already holds the shifted
  // year, and the same digits go back out through parseDateDraft.
  function entryFromText(source: string): TemplateEntry {
    return templateFromRaw(maskSegments as MaskSegment[], source)
  }
  // What the field is showing, as a draft string — the groups while they're
  // being edited (they are the live text then, and the draft still holds the
  // last committed date), the draft itself otherwise. Whatever reads "the
  // value in front of the user" has to go through this, or an Arrow key would
  // step from a date the user has already typed over.
  function draftInProgress(): string {
    if (!groups) return draft
    return templateToDraft(groups.segments, templateFinalizeActive(groups.segments, groups.entry)) ?? draft
  }
  // Re-seeds the groups after something other than typing replaced the value
  // (an Arrow step, a calendar pick) so they keep showing what the field now
  // holds. The group the user was in is carried over and re-highlighted:
  // seeding alone would leave the highlight wherever the new text happens to
  // end, and the next digit would land in a group they never chose.
  function reseedTemplate(text: string) {
    if (!groups) return
    const seeded = templateMoveTo(groups.segments, entryFromText(text), groups.entry.active)
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
    const text = formatDisplay(next)
    updateDraft(text)
    return text
  }

  function commitDraft() {
    if (isReadOnly) return
    if (groups) {
      // The groups turn into a draft string first and then go through the very
      // same parse/clamp/commit path typed text always did. That conversion
      // only succeeds once every group is filled: an unfinished entry commits
      // nothing, the way a native date input refuses to report a half-entered
      // date. `null` is committed only when the user actually emptied the
      // field, and only where null is allowed.
      const finalized = templateFinalizeActive(groups.segments, groups.entry)
      const asDraft = templateToDraft(groups.segments, finalized)
      const parsedGroups = asDraft === null ? undefined : parseDateDraft(asDraft, format, yearOffset, flatpickrLocale)
      setTemplateEntry(null)
      if (parsedGroups instanceof Date) commit(clampDate(parsedGroups, min, max))
      else if (isTemplateEmpty(finalized) && !isRequired) commit(null)
      else updateDraft(formattedValue)
      return
    }
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
    const parsed = parseDateDraft(draftInProgress(), format, yearOffset, flatpickrLocale)
    const base = parsed ?? committedValue ?? min ?? startOfDay(new Date())
    const next = clampDate(addDays(base, direction), min, max)
    // commit formats the value already; reseeding from that text rather than
    // from the Date keeps flatpickr's formatter (the most expensive step in
    // this path) to one pass per Arrow press.
    reseedTemplate(commit(next))
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
    calendarId,
    onPick: (next: Date | null) => reseedTemplate(commit(next)),
    // Internal only — the popup's open state never leaves the component;
    // this just keeps aria-expanded in step with it.
    onOpenChange: setIsOpenState,
  })

  function handleToggleDropdown() {
    if (isDisabled || isReadOnly) return
    toggle()
  }

  // Highlights one whole day/month/year group rather than the whole value —
  // a native date input's sub-field selection — and moves the entry's active
  // group to match, since that's the one the next keystroke fills. 'caret'
  // takes the group a pointer landed in (an offset only the browser knows,
  // which is what the deferral is for); 'start' is a keyboard tab-in, where
  // the leading group is what a native date input highlights.
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

  // Puts the highlight back on the group the entry says is active, three times
  // over: straight away (for an edit that changes nothing and so never
  // re-renders), from the post-render effect (once React has written the new
  // text), and once more on a microtask — the one that survives the browser's
  // own post-input cursor handling, same reason applySelection exists.
  function selectTemplateSlot(el: HTMLInputElement, entry: TemplateEntry) {
    if (!maskSegments) return
    const range = slotRanges[entry.active]
    if (!range) return
    pendingSelectionRef.current = range
    applySelection(el, range.start, range.end)
  }

  // Puts a new entry on screen: the state it renders from, the text it
  // reports, and the highlight on the group it is now in. A rejected edit
  // leaves the groups as they were (React restores the text it had already
  // rendered), so only the highlight needs putting back.
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
  // paste or an autofill. Typing goes through templateTypeIntoActive instead —
  // same rules, without describing a group as the characters it occupies.
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
    // left alone: that's a deliberate walk towards empty, and refilling the
    // field under the user would read as "this group can't be deleted". Blur
    // still refuses to leave a required field with no value at all.
    const wiped = next !== 'reject' && isRequired && templateWipedByEdit(segments, next, edit)
    showTemplate(el, segments, wiped ? entryFromText(formatDisplay(startOfDay(new Date()))) : next, entry)
  }

  // Typing is handled on keydown rather than from the resulting text, because
  // padding makes that text ambiguous: a group showing "01" that gets a "0"
  // typed over it produces "0/__/____", indistinguishable from deleting the
  // "1". The key carries the intent, so the browser is never let near the
  // value (every handled key is preventDefault'd) and `onChange` is left for
  // the input this can't see — a paste, an autofill, an IME commit.
  function handleTemplateKey(event: KeyboardEvent<HTMLInputElement>, segments: MaskSegment[], entry: TemplateEntry) {
    const el = event.currentTarget
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? start
      // A dragged selection is a character span and can cover several groups,
      // so it goes through the offset path (which is also where the
      // required-field wipe is decided). A collapsed caret means one group,
      // and a group is the unit deletion works in.
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
      // templateEdit reads a multi-character run back through the groups
      // itself, so there is nothing to special-case on the way in.
      applyTemplateEdit(el, groups.segments, groups.entry, diffStrings(templateValue, el.value))
      return
    }
    // Nothing typed reaches here any more: a format the groups can describe is
    // edited through them, and one they can't is not typeable at all (see
    // `isTypeable`). What's left is text the field is *given* — browser
    // autofill, a form library assigning `value`, an IME commit at a field
    // that never took focus. It's taken as-is and validated where every other
    // value is, at commit; the groups' per-character rules can't be applied to
    // an alphabetic format anyway, which is the only format that gets here
    // while focused.
    const next = el.value
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
    // Left/Right/Home/End walk between groups, the keyboard counterpart to
    // clicking one — there is no free-roaming caret to move instead while the
    // field is edited a group at a time.
    if (groups && event.key in GROUP_NAV_KEYS) {
      event.preventDefault()
      const next = templateMoveTo(groups.segments, groups.entry, GROUP_NAV_KEYS[event.key](groups.entry))
      setTemplateEntry(next)
      selectTemplateSlot(event.currentTarget, next)
      return
    }
    if (event.key === 'Enter') {
      commitDraft()
    } else if (event.key === 'Escape') {
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
    } else if (event.key === 'ArrowUp' && !isReadOnly) {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown' && !isReadOnly) {
      event.preventDefault()
      stepBy(-1)
    } else if (groups && !isReadOnly) {
      // Everything left that could be a character or a deletion goes to the
      // groups — see handleTemplateKey for why editing is driven from the key
      // rather than from the text the browser would have produced.
      handleTemplateKey(event, groups.segments, groups.entry)
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
        readOnly={isReadOnly || !isTypeable}
        required={isRequired}
        // Combobox-with-popup pattern (calendar dropdown), not a
        // spinbutton like InputNumber.
        role="combobox"
        aria-expanded={isOpenState}
        aria-haspopup="dialog"
        aria-controls={calendarId}
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
            // Editing starts here: the field's text becomes a set of groups
            // seeded from whatever it was displaying, and the one landed in
            // is highlighted whole.
            if (templateEntry === null) setTemplateEntry(entryFromText(draft))
            selectSegment(event.currentTarget, fromPointer ? 'caret' : 'start', maskSegments)
            return
          }
          // A format the groups can't describe is still edited as plain text,
          // so it keeps the select-everything-on-focus behavior. Deferred (see
          // selectAllOnFocus's own doc comment) — a synchronous .select()
          // here doesn't reliably work in WebKit/Safari.
          selectAllOnFocus(event.currentTarget)
        }}
        onClick={(event) => {
          // With typing unavailable, the field itself is another way to reach
          // the only input method left.
          if (!isTypeable && !isDisabled && !isReadOnly) {
            toggle()
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
        // The icon overlays the input's right edge rather than sitting
        // beside it, so the text needs room to stop short of it — the
        // reference has no such padding because its own icon is
        // decorative and its field is never long enough to reach it.
        className={`${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${showDropdownButton ? 'pr-11' : ''} ${className ?? ''}`}
      />
      {showDropdownButton && (
        <button
          type="button"
          aria-label={dropdownAriaLabel}
          disabled={isDisabled || isReadOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggleDropdown}
          className={dropdownButtonClassName}
        >
          {dropdownIcon ?? <CalendarIcon />}
        </button>
      )}
      {/* React-opaque host for flatpickr's popup — see the DOM-ownership
          escape-hatch note above; must stay empty in JSX. */}
      <div ref={containerRef} className="absolute inset-x-0 bottom-0 h-0 w-0" />
    </div>
  )
})
