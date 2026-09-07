import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
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

// Use flatpickr's enabled day cells and keyboard navigation, with a focusable
// dialog fallback when bounds leave no selectable day in the rendered months.
function focusCalendar(instance: flatpickr.Instance) {
  const calendar = instance.calendarContainer
  if (!calendar) return
  const enabled = '.flatpickr-day:not(.flatpickr-disabled):not(.hidden):not(.notAllowed)'
  const day = calendar.querySelector<HTMLElement>(`${enabled}.selected`)
    ?? calendar.querySelector<HTMLElement>(`${enabled}.today`)
    ?? calendar.querySelector<HTMLElement>(enabled)
  ;(day ?? calendar).focus()
}

// set()/setDate() rebuild day nodes. Keep focus inside an open popup only
// when the update actually removed the control the user was working in.
function updateCalendar(instance: flatpickr.Instance | null, update: (instance: flatpickr.Instance) => void) {
  if (!instance) return
  const active = document.activeElement
  const ownedFocus = instance.isOpen && instance.calendarContainer?.contains(active)
  update(instance)
  if (ownedFocus && active && !active.isConnected) focusCalendar(instance)
}

export interface UseFlatpickrCalendarOptions {
  isUnavailable: boolean
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
  positionElementRef: RefObject<HTMLInputElement | null>
  calendarId: string
  calendarAriaLabel: string
  // Called when a day is picked in the calendar, with the picked date
  // normalized to the start of day. Kept latest-in-a-ref internally, so the
  // once-bound flatpickr onChange always calls the current closure.
  onPick: (date: Date) => void
  // Called (with the new open state) whenever the calendar opens or closes,
  // by user action or programmatically — same latest-in-a-ref treatment.
  onOpenChange: (isOpen: boolean) => void
  // Finish field editing when focus leaves the popup for another control.
  onFocusLeave: () => void
}

export interface UseFlatpickrCalendarResult {
  // React-opaque host div for flatpickr's popup — must be rendered empty in
  // JSX (see the DOM-ownership escape-hatch note in CLAUDE.md and the mount
  // effect below).
  containerRef: RefObject<HTMLDivElement | null>
  // Opens/closes the calendar (no-op until the instance is mounted).
  toggle: (opener?: HTMLElement) => void
}

// Encapsulates the entire flatpickr calendar integration for InputDate —
// instance lifecycle, prop-sync effects, the Buddhist-Era custom year-header
// control, and the value/open-state syncs — behind a small hook. All of the
// imperative, outside-React DOM manipulation flatpickr requires lives here,
// so InputDate.tsx itself only deals with its React-owned text field and the
// commit model, including the focus handoff to and from the visible field.
export function useFlatpickrCalendar({
  isUnavailable,
  format,
  min,
  max,
  closeOnSelection,
  monthCount,
  locale,
  flatpickrLocale,
  yearOffset,
  committedValue,
  positionElementRef,
  calendarId,
  calendarAriaLabel,
  onPick,
  onOpenChange,
  onFocusLeave,
}: UseFlatpickrCalendarOptions): UseFlatpickrCalendarResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<flatpickr.Instance | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const unavailableRef = useRef(isUnavailable)
  const committedValueRef = useRef(committedValue)

  useLayoutEffect(() => {
    // Only committed props govern native events, not a suspended render.
    unavailableRef.current = isUnavailable
    committedValueRef.current = committedValue
    // The visible field preserves disabled versus read-only semantics;
    // either state disables its private OS-picker launcher.
    if (instanceRef.current?.mobileInput) {
      instanceRef.current.mobileInput.disabled = isUnavailable
    }
  }, [isUnavailable, committedValue])

  const restoreOpener = useCallback(() => {
    const opener = openerRef.current
    if (opener?.isConnected && !opener.matches(':disabled')) opener.focus()
    else positionElementRef.current?.focus()
  }, [positionElementRef])

  // Kept refs so the flatpickr onChange/onOpen/onClose hooks (bound once,
  // at mount) always call the latest closures instead of the ones captured
  // when the instance was created.
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onFocusLeaveRef = useRef(onFocusLeave)
  onFocusLeaveRef.current = onFocusLeave
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
      positionElement: positionElementRef.current ?? undefined,
      static: false,
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
      // instance. A native mobile instance still exchanges Gregorian values
      // with the OS after a locale switch; only the React field uses the era.
      formatDate: (date, frmt, loc) => {
        const currentYearOffset = instanceRef.current?.isMobile ? 0 : eraRef.current.yearOffset
        const baseFormatter = (d: Date, f: string) => formatDateWithLocaleCast(d, f, loc)
        if (currentYearOffset === 0) return baseFormatter(date, frmt)
        return formatDateWithYearOffset(date, frmt, currentYearOffset, baseFormatter) ?? baseFormatter(date, frmt)
      },
      parseDate: (dateStr, frmt) => {
        const currentYearOffset = instanceRef.current?.isMobile ? 0 : eraRef.current.yearOffset
        const toParse = currentYearOffset !== 0 ? (unshiftYearInDraft(dateStr, frmt, currentYearOffset) ?? dateStr) : dateStr
        // flatpickr's own createDateParser tolerates and reports an invalid
        // Date via its own errorHandler rather than requiring this callback
        // itself to guard against unparseable input.
        return flatpickr.parseDate(toParse, frmt) as Date
      },
      onChange: (selectedDates, _text, calendar) => {
        // An OS picker can deliver a selection after the field becomes
        // unavailable. Restore the authoritative value without notifying React.
        if (unavailableRef.current) {
          const value = committedValueRef.current
          if (value) calendar.setDate(value, false)
          else calendar.clear(false)
          return
        }
        const picked = selectedDates[0]
        if (picked) onPickRef.current(startOfDay(picked))
        if (calendar.isOpen) focusCalendar(calendar)
      },
      onOpen: (_dates, _text, calendar) => {
        onOpenChangeRef.current(true)
        if (!calendar.isMobile) focusCalendar(calendar)
      },
      onClose: () => {
        onOpenChangeRef.current(false)
        // flatpickr's selection path focuses its hidden input before close.
        // Outside pointer/focus dismissal must keep its destination instead.
        if (document.activeElement === input) restoreOpener()
      },
    })
    if (instance.mobileInput) {
      // Flatpickr creates a second input without copying the proxy's styles
      // or tabindex. It is an OS-picker launcher, not another form field.
      // Keep it rendered for programmatic click(), but out of layout/Tab/AT.
      instance.mobileInput.style.cssText = input.style.cssText
      instance.mobileInput.tabIndex = -1
      instance.mobileInput.setAttribute('aria-hidden', 'true')
      instance.mobileInput.disabled = unavailableRef.current
    }
    // Native mobile instances have an input instead of a JavaScript calendar.
    if (instance.calendarContainer) {
      instance.calendarContainer.classList.add('rc-scalar')
      instance.calendarContainer.id = calendarId
      instance.calendarContainer.setAttribute('role', 'dialog')
    }
    instanceRef.current = instance
    function handleCalendarKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        // Native Tab continues from the visible opener in document order.
        // Only stop flatpickr's hidden-input redirect; keep Tab's default.
        if (event.key === 'Escape') event.preventDefault()
        event.stopPropagation()
        instance.close()
        restoreOpener()
      } else if (event.key === ' ' && event.target instanceof HTMLElement
        && event.target.matches('.flatpickr-day:not(.flatpickr-disabled):not(.hidden):not(.notAllowed)')) {
        event.preventDefault()
        event.stopPropagation()
        event.target.click()
      } else if (event.target === instance.calendarContainer
        && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        // No enabled day: flatpickr would otherwise send focus to its input.
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // The text draft remains editable while focus moves into the calendar.
    // Track the whole field, including a button returned to by Escape/Tab,
    // so a later exit cannot strand that deferred commit.
    const fieldRoot = container.parentElement
    let deferredFieldExit = false
    const owns = (node: EventTarget | null) => node instanceof Node && (
      fieldRoot?.contains(node) || instance.calendarContainer?.contains(node)
    )
    function finishDeferredExit() {
      if (!deferredFieldExit) return
      deferredFieldExit = false
      instance.close()
      onFocusLeaveRef.current()
    }
    function handleCalendarFocusOut(event: FocusEvent) {
      const target = event.relatedTarget
      if (event.target === positionElementRef.current && target instanceof Node
        && instance.calendarContainer?.contains(target)) deferredFieldExit = true
      if (target === input || owns(target)) return
      instance.close()
      finishDeferredExit()
    }
    function handleOutsidePointer(event: PointerEvent) {
      if (!owns(event.target)) finishDeferredExit()
    }
    fieldRoot?.addEventListener('focusout', handleCalendarFocusOut)
    document.addEventListener('pointerdown', handleOutsidePointer)
    instance.calendarContainer?.addEventListener('focusout', handleCalendarFocusOut)
    instance.calendarContainer?.addEventListener('keydown', handleCalendarKeyDown, true)
    return () => {
      fieldRoot?.removeEventListener('focusout', handleCalendarFocusOut)
      document.removeEventListener('pointerdown', handleOutsidePointer)
      instance.calendarContainer?.removeEventListener('focusout', handleCalendarFocusOut)
      instance.calendarContainer?.removeEventListener('keydown', handleCalendarKeyDown, true)
      instance.destroy()
      instanceRef.current = null
    }
    // Mount once — every prop that can change afterward is synced via the
    // instance.set()/setDate() effects below instead of destroy/recreate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instance = instanceRef.current
    const calendar = instance?.calendarContainer
    const anchor = positionElementRef.current
    if (!instance || !calendar || !anchor) return
    // Body portals no longer inherit the field's local theme. Copy only the
    // tokens this calendar consumes; leave placement and DOM ownership intact.
    const syncTheme = () => {
      const computed = getComputedStyle(anchor)
      calendar.toggleAttribute('data-rc-dark', !!anchor.closest('.dark'))
      const primary = computed.getPropertyValue('--rc-color-primary').trim()
      if (primary) calendar.style.setProperty('--rc-color-primary', primary)
      else calendar.style.removeProperty('--rc-color-primary')
      calendar.style.fontFamily = computed.fontFamily
    }
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    for (let node: HTMLElement | null = anchor; node; node = node.parentElement) {
      observer.observe(node, { attributes: true, attributeFilter: ['class', 'style'] })
    }
    const openHooks = instance.config.onOpen
    openHooks.push(syncTheme)
    window.addEventListener('resize', syncTheme)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncTheme)
      const index = openHooks.indexOf(syncTheme)
      if (index !== -1) openHooks.splice(index, 1)
    }
  }, [positionElementRef])

  useEffect(() => {
    updateCalendar(instanceRef.current, (instance) => instance.set('dateFormat', format))
  }, [format])

  useEffect(() => {
    updateCalendar(instanceRef.current, (instance) => instance.set('minDate', min ?? undefined))
  }, [min])

  useEffect(() => {
    updateCalendar(instanceRef.current, (instance) => instance.set('maxDate', max ?? undefined))
  }, [max])

  useEffect(() => {
    instanceRef.current?.set('closeOnSelect', closeOnSelection)
  }, [closeOnSelection])

  useEffect(() => {
    const instance = instanceRef.current
    // set('showMonths') rebuilds month navigation even in native mobile mode,
    // where flatpickr never created that DOM.
    if (instance?.calendarContainer) updateCalendar(instance, (calendar) => calendar.set('showMonths', monthCount))
  }, [monthCount])

  useEffect(() => {
    instanceRef.current?.calendarContainer?.setAttribute('aria-label', calendarAriaLabel)
  }, [calendarAriaLabel])

  // Confirmed via spike (not assumed): flatpickr's own `set('locale', ...)`
  // runs both setupLocale and updateWeekdays before redraw(), so this
  // updates weekday labels *and* the day-grid's day-of-week layout
  // (firstDayOfWeek) correctly at runtime — no destroy/recreate needed.
  useEffect(() => {
    updateCalendar(instanceRef.current, (instance) => instance.set('locale', flatpickrLocale ?? flatpickr.l10ns.default))
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
    if (!instance?.calendarContainer || locale !== 'th') return
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
      // The custom text editor owns its caret and year commit. Escape/Tab
      // are handled at the calendar's capture boundary above.
      event.stopPropagation()
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
      const ownedFocus = document.activeElement === customYearInput
      customYearInput.remove()
      if (ownedFocus && instance.isOpen) focusCalendar(instance)
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
    updateCalendar(instance, (calendar) => {
      if (committedValue) calendar.setDate(committedValue, false)
      else calendar.clear(false)
    })
  }, [committedValue])

  useEffect(() => {
    const instance = instanceRef.current
    if (!isUnavailable || !instance?.isOpen) return
    const ownedFocus = instance.calendarContainer?.contains(document.activeElement)
    instance.close()
    if (ownedFocus) restoreOpener()
  }, [isUnavailable, restoreOpener])

  const toggle = useCallback((opener?: HTMLElement) => {
    const instance = instanceRef.current
    if (!instance || unavailableRef.current) return
    if (!instance.isOpen) {
      openerRef.current = opener ?? (document.activeElement instanceof HTMLElement
        && document.activeElement !== document.body ? document.activeElement : positionElementRef.current)
      instance.open()
    } else {
      const ownedFocus = instance.calendarContainer?.contains(document.activeElement)
      instance.close()
      if (ownedFocus) restoreOpener()
    }
  }, [positionElementRef, restoreOpener])

  return { containerRef, toggle }
}
