import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface UseTimeDropdownOptions {
  // How many entries the list currently holds — the highlight is kept
  // within this range as `min`/`max`/`step` change underneath it.
  itemCount: number
  // Index of the entry matching the committed value, or -1 when the value
  // isn't one of the listed times. Where the highlight starts from each
  // time the list opens.
  selectedIndex: number
  // InputDateTime can keep entries visible while making timestamp-invalid
  // ones unavailable. InputTime supplies none, so its list is unchanged.
  disabledIndices?: readonly number[]
}

export interface UseTimeDropdownResult {
  isOpen: boolean
  // Goes on the positioned wrapper around the field *and* the popup — a
  // click anywhere inside it (including on the dropdown button itself)
  // must not count as a click-away.
  rootRef: RefObject<HTMLDivElement | null>
  // The scrollable listbox; used to keep the highlighted entry in view.
  listRef: RefObject<HTMLDivElement | null>
  open: () => void
  close: () => void
  toggle: () => void
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  // Moves the highlight by one entry, clamped at both ends (rather than
  // wrapping, which loses the user's place in a 96-entry list).
  moveHighlight: (direction: 1 | -1) => void
}

// Open-state, click-away and highlight plumbing for InputTime's time list —
// the same organizational split as InputDate's useFlatpickrCalendar, minus
// everything that hook needs for a third-party library that rewrites the
// DOM. This popup is ordinary React-rendered markup, so there's no
// DOM-ownership escape hatch here and no imperative instance to keep in
// sync; the hook only owns the state the markup renders from.
export function useTimeDropdown({ itemCount, selectedIndex, disabledIndices = [] }: UseTimeDropdownOptions): UseTimeDropdownResult {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [storedIndex, setHighlightedIndex] = useState(selectedIndex)
  // Clamped on read rather than corrected by an effect: a shrinking list (a
  // narrower min/max, or a coarser step) can strand the stored index past
  // the end, and fixing that with state-that-fixes-state costs an extra
  // render pass and gives the same value two writers.
  const isDisabled = (index: number) => disabledIndices.includes(index)
  function closestEnabledIndex(index: number): number {
    const lastIndex = itemCount - 1
    const clamped = Math.max(0, Math.min(index, lastIndex))
    for (let candidate = clamped; candidate <= lastIndex; candidate++) {
      if (!isDisabled(candidate)) return candidate
    }
    for (let candidate = clamped - 1; candidate >= 0; candidate--) {
      if (!isDisabled(candidate)) return candidate
    }
    return -1
  }
  const highlightedIndex = closestEnabledIndex(storedIndex)

  // Plain functions, not useCallback — nothing consumes these as a
  // dependency or across a memo boundary, and the hook returns a fresh
  // object every render anyway, so memoizing them buys no stability and
  // only adds dep arrays to keep correct.
  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)
  const toggle = () => setIsOpen((current) => !current)

  // Opening always starts from the current value rather than from wherever
  // the highlight was left last time — reopening a list to find it pointing
  // at an entry the user rejected earlier is disorienting.
  useEffect(() => {
    if (isOpen) setHighlightedIndex(closestEnabledIndex(selectedIndex))
    // selectedIndex deliberately excluded: this is "reset on open", not
    // "follow the value while open" (the latter would fight Arrow-key
    // navigation, which moves the highlight without committing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node) || listRef.current?.contains(event.target as Node)) return
      // setIsOpen is a stable useState setter, so this listener needs no
      // latest-in-a-ref indirection to stay correct across renders.
      setIsOpen(false)
    }
    // mousedown rather than click: closing on the way down matches how
    // native selects and the calendar popup behave, and avoids a click that
    // started inside the list but ended outside it counting as a click-away.
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  // Scrolls the highlighted entry into view by setting scrollTop directly
  // rather than calling scrollIntoView: the latter scrolls the whole page
  // to reach the popup in some browsers, and isn't implemented in jsdom at
  // all, which would make every test touching the list throw.
  useEffect(() => {
    if (!isOpen) return
    const list = listRef.current
    const item = list?.children[highlightedIndex] as HTMLElement | undefined
    if (!list || !item) return
    const itemBottom = item.offsetTop + item.offsetHeight
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight
  }, [isOpen, highlightedIndex])

  function moveHighlight(direction: 1 | -1) {
    setHighlightedIndex((current) => {
      const currentIndex = closestEnabledIndex(current)
      if (currentIndex === -1) return -1
      for (let next = currentIndex + direction; next >= 0 && next < itemCount; next += direction) {
        if (!isDisabled(next)) return next
      }
      return currentIndex
    })
  }

  return {
    isOpen,
    rootRef,
    listRef,
    open,
    close,
    toggle,
    highlightedIndex,
    setHighlightedIndex,
    moveHighlight,
  }
}
