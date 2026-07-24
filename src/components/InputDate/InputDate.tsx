import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.css'
import { Thai } from 'flatpickr/dist/l10n/th.js'
import './flatpickr-theme.css'
import { useSyncedState } from '../../hooks/useSyncedState'
import {
  addDays,
  clampDate,
  formatDateValue,
  formatDateWithYearOffset,
  isSameDay,
  parseDateDraft,
  startOfDay,
  tokenizeDateMask,
  unshiftYearInDraft,
} from '../../lib/date'
import { applyDateMask, diffStrings, isLiteralCharAt, pendingAdvanceAtCursor } from '../../lib/dateMask'
import { applySelection, selectAllOnFocus } from '../../lib/domSelection'

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
// mechanism, and the "custom year control" section below for why the
// calendar popup's own year-navigation header needs separate handling.
const BUDDHIST_ERA_OFFSET = 543

// flatpickr's static formatDate accepts an extra `locale` argument at
// runtime (confirmed empirically, see src/lib/date.ts's own equivalent
// cast) that isn't in the public FlatpickrFn type — used here specifically
// for the flatpickr `formatDate` config override below, which receives a
// `Locale` (not `CustomLocale`) from flatpickr itself.
type FormatDateWithLocale = (date: Date, format: string, locale?: flatpickr.Locale) => string
const formatDateWithLocaleCast = flatpickr.formatDate as FormatDateWithLocale

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<flatpickr.Instance | null>(null)
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

  // Kept refs so the flatpickr onChange/onOpen/onClose hooks (bound once,
  // at mount) always call the latest closures instead of the ones captured
  // when the instance was created.
  const commitRef = useRef(commit)
  commitRef.current = commit
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  // The flatpickr formatDate/parseDate config functions below are set once
  // at instance construction (see the mount effect) but need to always see
  // the *current* era, since `locale` can change on a later render — same
  // "ref updated every render, read inside a closure set up once" pattern
  // as the two refs above.
  const eraRef = useRef({ yearOffset, flatpickrLocale })
  eraRef.current = { yearOffset, flatpickrLocale }

  // React-opaque container div (see the "InputDate + flatpickr:
  // DOM-ownership escape hatch" note in CLAUDE.md) — flatpickr mutates the
  // DOM outside React's tracking (static mode wraps its bound element in a
  // new div it creates itself). Binding it directly to a JSX-managed leaf
  // React itself renders and later needs to remove throws
  // `NotFoundError: The node to be removed is not a child of this node`
  // during React's own unmount teardown (confirmed via testing, not
  // StrictMode-specific — reproduces on a single mount/unmount too).
  // Instead: render one empty div React commits and never diffs the inside
  // of, then imperatively create/append the actual bound input here.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const input = document.createElement('input')
    input.type = 'text'
    input.setAttribute('aria-hidden', 'true')
    input.tabIndex = -1
    // The zero-size containerRef div alone doesn't hide this input — an
    // <input> renders its own box (border/padding/font) regardless of its
    // parent's size unless the parent also clips overflow, and it would
    // otherwise show its own value text floating over whatever sits below
    // the wrapper. Hide the element itself, not just its container.
    Object.assign(input.style, {
      position: 'absolute',
      width: '0',
      height: '0',
      padding: '0',
      margin: '0',
      border: 'none',
      opacity: '0',
      pointerEvents: 'none',
    })
    container.appendChild(input)
    const instance = flatpickr(input, {
      static: true,
      dateFormat: format,
      minDate: min ?? undefined,
      maxDate: max ?? undefined,
      closeOnSelect: closeOnSelection,
      showMonths: monthCount,
      // flatpickr's own locale validation treats an explicitly-present
      // `locale: undefined` key as an *invalid* locale value (distinct from
      // the key being absent) — pass the "default" sentinel string instead
      // so English mounts don't trigger a spurious "invalid locale
      // undefined" error.
      locale: flatpickrLocale ?? 'default',
      // flatpickr falls back to a native OS <input type="date"> on touch
      // devices, which is Gregorian-only by spec and bypasses formatDate
      // entirely (see the formatDate override below) — forcing the JS popup
      // keeps Thai/Buddhist-Era rendering consistent everywhere rather than
      // silently reverting on mobile only. Read once at mount (locale
      // switching at runtime doesn't retroactively toggle mobile mode).
      disableMobile: locale === 'th',
      // Buddhist Era needs to reach flatpickr's own internal formatting too
      // (day-cell aria-labels via config.ariaDateFormat), not just this
      // component's own text field — config.formatDate/parseDate are real,
      // documented override hooks flatpickr threads through internally.
      // Reads eraRef (not the yearOffset/flatpickrLocale captured at mount)
      // so a later `locale` prop change is picked up without recreating the
      // instance.
      formatDate: (date, frmt, loc) => {
        const { yearOffset: currentYearOffset } = eraRef.current
        const baseFormatter = (d: Date, f: string) => formatDateWithLocaleCast(d, f, loc)
        if (currentYearOffset === 0) return baseFormatter(date, frmt)
        return formatDateWithYearOffset(date, frmt, currentYearOffset, baseFormatter) ?? baseFormatter(date, frmt)
      },
      parseDate: (dateStr, frmt) => {
        const { yearOffset: currentYearOffset } = eraRef.current
        const toParse = currentYearOffset !== 0 ? (unshiftYearInDraft(dateStr, frmt, currentYearOffset) ?? dateStr) : dateStr
        // flatpickr's own createDateParser tolerates and reports an invalid
        // Date via its own errorHandler rather than requiring this callback
        // itself to guard against unparseable input.
        return flatpickr.parseDate(toParse, frmt) as Date
      },
      onChange: (selectedDates) => {
        const picked = selectedDates[0]
        if (picked) commitRef.current(startOfDay(picked))
      },
      onOpen: () => {
        setIsOpenState(true)
        onOpenChangeRef.current?.(true)
      },
      onClose: () => {
        setIsOpenState(false)
        onOpenChangeRef.current?.(false)
      },
    })
    instanceRef.current = instance
    return () => {
      instance.destroy()
      instanceRef.current = null
    }
    // Mount once — every prop that can change afterward is synced via the
    // instance.set()/setDate() effects below instead of destroy/recreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    instanceRef.current?.set('dateFormat', format)
  }, [format])

  useEffect(() => {
    instanceRef.current?.set('minDate', min ?? undefined)
  }, [min])

  useEffect(() => {
    instanceRef.current?.set('maxDate', max ?? undefined)
  }, [max])

  useEffect(() => {
    instanceRef.current?.set('closeOnSelect', closeOnSelection)
  }, [closeOnSelection])

  useEffect(() => {
    instanceRef.current?.set('showMonths', monthCount)
  }, [monthCount])

  // Confirmed via spike (not assumed): flatpickr's own `set('locale', ...)`
  // runs both setupLocale and updateWeekdays before redraw(), so this
  // updates weekday labels *and* the day-grid's day-of-week layout
  // (firstDayOfWeek) correctly at runtime — no destroy/recreate needed.
  useEffect(() => {
    instanceRef.current?.set('locale', flatpickrLocale ?? flatpickr.l10ns.default)
  }, [flatpickrLocale])

  // Custom year-header control — see CLAUDE.md's "InputDate: Buddhist Era
  // year-header replacement" note for why flatpickr's own native year
  // spinner can't just be patched in place (its value is written directly
  // from raw Gregorian across four separate internal call sites, with no
  // hook). Hides the native spinner and drives a plain-DOM (not JSX/portal
  // — flatpickr's popup DOM lives entirely outside React's tree) input
  // wired to flatpickr's own public instance.currentYear/changeYear API.
  //
  // Depends on [locale, monthCount] deliberately, not just [locale]:
  // confirmed via testing that flatpickr's own `set('showMonths', ...)` —
  // which this component's own monthCount effect calls, including
  // redundantly on every mount — rebuilds `instance.yearElements` via
  // `buildMonths()`, but never refreshes the separately-cached
  // `instance.currentYearElement` reference (a flatpickr quirk, not
  // documented). That stale reference silently detaches from the live DOM
  // while a fresh element takes its place — using `instance.yearElements[0]`
  // (which *does* get reassigned by buildMonths) instead avoids it, and
  // re-running this whole effect whenever monthCount changes keeps the
  // custom control pointed at whatever the current live element is.
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || locale !== 'th') return
    const nativeYearInput = instance.yearElements[0]
    const previousDisplay = nativeYearInput.style.display
    nativeYearInput.style.display = 'none'

    const customYearInput = document.createElement('input')
    customYearInput.type = 'text'
    customYearInput.inputMode = 'numeric'
    customYearInput.setAttribute('aria-label', 'Year (พ.ศ.)')
    // Reuses flatpickr's own "numInput cur-year" classes rather than
    // hand-rolled CSS — inserted as a sibling of (now-hidden) currentYearElement,
    // still inside .flatpickr-current-month .numInputWrapper, so flatpickr's
    // own stylesheet (background/border/font/sizing) applies identically —
    // confirmed by reading flatpickr.css directly, not guessed.
    // rcl-year-input is a unique marker class (flatpickr's own "cur-year" is
    // reused for its styling, but also still exists on the now-hidden native
    // element, so tests/consumers need something unambiguous to target).
    customYearInput.className = 'numInput cur-year rcl-year-input'
    nativeYearInput.insertAdjacentElement('afterend', customYearInput)

    // Reflects instance.currentYear (updated by month/year navigation, or
    // by this control's own commit below) as a Buddhist year — skipped
    // while the user is actively editing it so an in-progress keystroke
    // never gets clobbered by a sync triggered from elsewhere.
    function syncDisplay() {
      if (document.activeElement === customYearInput) return
      customYearInput.value = String(instance!.currentYear + BUDDHIST_ERA_OFFSET)
    }
    syncDisplay()

    function commitYear() {
      const typed = Number(customYearInput.value)
      if (Number.isFinite(typed) && customYearInput.value.trim() !== '') {
        instance!.changeYear(typed - BUDDHIST_ERA_OFFSET)
      }
      syncDisplay()
    }

    function handleYearKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault()
        commitYear()
      }
    }

    customYearInput.addEventListener('blur', commitYear)
    customYearInput.addEventListener('keydown', handleYearKeyDown)
    // flatpickr reads these hook arrays fresh on every internal
    // triggerEvent() call (confirmed via source), so pushing onto the
    // already-parsed instance.config arrays after construction is a valid,
    // standard way to attach additional hooks post-hoc. Captured into local
    // variables (not re-read from instance.config in the cleanup below) —
    // by the time this effect's cleanup runs, the main mount effect's own
    // cleanup may already have called instance.destroy(), which tears down
    // instance.config entirely; the array objects themselves are still
    // valid to splice regardless.
    const monthChangeHooks = instance.config.onMonthChange
    const yearChangeHooks = instance.config.onYearChange
    monthChangeHooks.push(syncDisplay)
    yearChangeHooks.push(syncDisplay)

    return () => {
      nativeYearInput.style.display = previousDisplay
      customYearInput.removeEventListener('blur', commitYear)
      customYearInput.removeEventListener('keydown', handleYearKeyDown)
      customYearInput.remove()
      const monthIdx = monthChangeHooks.indexOf(syncDisplay)
      if (monthIdx !== -1) monthChangeHooks.splice(monthIdx, 1)
      const yearIdx = yearChangeHooks.indexOf(syncDisplay)
      if (yearIdx !== -1) yearChangeHooks.splice(yearIdx, 1)
    }
  }, [locale, monthCount])

  // Quiet sync (triggerChange: false) — keeps the calendar's own selected
  // day/displayed month in step with commits from the text field without
  // re-firing flatpickr's own onChange and looping back into commit().
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    if (committedValue) instance.setDate(committedValue, false)
    else instance.clear(false)
  }, [committedValue])

  // Reflects external isOpen control without a feedback loop — flatpickr's
  // own onOpen/onClose hooks (above) fire for both user- and
  // programmatically-triggered open/close, so isOpenState stays the single
  // source of truth either way.
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || isOpen === undefined) return
    if (isOpen !== instance.isOpen) {
      if (isOpen) instance.open()
      else instance.close()
    }
  }, [isOpen])

  function handleToggleDropdown() {
    if (isDisabled || isReadOnly) return
    instanceRef.current?.toggle()
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
