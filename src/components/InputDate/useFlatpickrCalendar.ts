import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import flatpickr from 'flatpickr'
import { formatDateWithYearOffset, startOfDay, unshiftYearInDraft } from '../../lib/date'

// flatpickr's static formatDate accepts an extra `locale` argument at
// runtime (confirmed empirically, see src/lib/date.ts's own equivalent
// cast) that isn't in the public FlatpickrFn type — used here specifically
// for the flatpickr `formatDate` config override below, which receives a
// `Locale` (not `CustomLocale`) from flatpickr itself.
type FormatDateWithLocale = (date: Date, format: string, locale?: flatpickr.Locale) => string
const formatDateWithLocaleCast = flatpickr.formatDate as FormatDateWithLocale

export interface UseFlatpickrCalendarOptions {
  format: string
  min: Date | null
  max: Date | null
  closeOnSelection: boolean
  monthCount: number
  locale: 'en' | 'th'
  flatpickrLocale: flatpickr.CustomLocale | undefined
  // The offset added to a Gregorian year for Buddhist Era display/parse —
  // 543 when locale === 'th', 0 otherwise. The locale→offset mapping stays
  // in InputDate.tsx; this hook only consumes the resolved number.
  yearOffset: number
  committedValue: Date | null
  isOpen: boolean | undefined
  // Called when a day is picked in the calendar, with the picked date
  // normalized to the start of day. Kept latest-in-a-ref internally, so the
  // once-bound flatpickr onChange always calls the current closure.
  onPick: (date: Date) => void
  // Called (with the new open state) whenever the calendar opens or closes,
  // by user action or programmatically — same latest-in-a-ref treatment.
  onOpenChange: (isOpen: boolean) => void
}

export interface UseFlatpickrCalendarResult {
  // React-opaque host div for flatpickr's popup — must be rendered empty in
  // JSX (see the DOM-ownership escape-hatch note in CLAUDE.md and the mount
  // effect below).
  containerRef: RefObject<HTMLDivElement | null>
  // Opens/closes the calendar (no-op until the instance is mounted).
  toggle: () => void
}

// Encapsulates the entire flatpickr calendar integration for InputDate —
// instance lifecycle, prop-sync effects, the Buddhist-Era custom year-header
// control, and the value/open-state syncs — behind a small hook. All of the
// imperative, outside-React DOM manipulation flatpickr requires lives here,
// so InputDate.tsx itself only deals with its React-owned text field and the
// commit model. Behavior is identical to the previous inline implementation;
// this is purely an organizational extraction.
export function useFlatpickrCalendar({
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
  onPick,
  onOpenChange,
}: UseFlatpickrCalendarOptions): UseFlatpickrCalendarResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<flatpickr.Instance | null>(null)

  // Kept refs so the flatpickr onChange/onOpen/onClose hooks (bound once,
  // at mount) always call the latest closures instead of the ones captured
  // when the instance was created.
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
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
        if (picked) onPickRef.current(startOfDay(picked))
      },
      onOpen: () => {
        onOpenChangeRef.current(true)
      },
      onClose: () => {
        onOpenChangeRef.current(false)
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
  // (yearOffset is included for the linter; it's constant — 543 — whenever
  // locale === 'th', the only case this effect does anything, so it adds no
  // extra re-runs.)
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
      customYearInput.value = String(instance!.currentYear + yearOffset)
    }
    syncDisplay()

    function commitYear() {
      const typed = Number(customYearInput.value)
      if (Number.isFinite(typed) && customYearInput.value.trim() !== '') {
        instance!.changeYear(typed - yearOffset)
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
  }, [locale, monthCount, yearOffset])

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
  // programmatically-triggered open/close, so the consumer's open state
  // stays the single source of truth either way.
  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || isOpen === undefined) return
    if (isOpen !== instance.isOpen) {
      if (isOpen) instance.open()
      else instance.close()
    }
  }, [isOpen])

  const toggle = useCallback(() => {
    instanceRef.current?.toggle()
  }, [])

  return { containerRef, toggle }
}
