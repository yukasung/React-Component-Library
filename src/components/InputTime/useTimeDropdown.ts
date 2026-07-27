import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

export interface UseTimeDropdownOptions {
  // How many entries the list currently holds — the highlight is kept
  // within this range as `min`/`max`/`step` change underneath it.
  itemCount: number
  // Index of the entry matching the committed value, or -1 when the value
  // isn't one of the listed times. Where the highlight starts from each
  // time the list opens.
  selectedIndex: number
  // Controlled open state; undefined leaves the hook to own it.
  isOpen: boolean | undefined
  onOpenChange: (isOpen: boolean) => void
}

export interface UseTimeDropdownResult {
  isOpen: boolean
  // Goes on the positioned wrapper around the field *and* the popup — a
  // click anywhere inside it (including on the dropdown button itself)
  // must not count as a click-away.
  rootRef: RefObject<HTMLDivElement | null>
  // The scrollable <ul>; used to keep the highlighted entry in view.
  listRef: RefObject<HTMLUListElement | null>
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
export function useTimeDropdown({
  itemCount,
  selectedIndex,
  isOpen,
  onOpenChange,
}: UseTimeDropdownOptions): UseTimeDropdownResult {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex)
  const resolvedOpen = isOpen ?? internalOpen

  // Kept latest-in-a-ref so the document-level listener below can be bound
  // once per open instead of re-bound on every render.
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const setOpen = useCallback(
    (next: boolean) => {
      // Internal state is tracked even while `isOpen` is controlling the
      // popup, so handing control back (isOpen -> undefined) doesn't snap
      // the list to a state the consumer never saw.
      setInternalOpen(next)
      if (next !== (isOpen ?? internalOpen)) onOpenChangeRef.current(next)
    },
    [isOpen, internalOpen],
  )

  const open = useCallback(() => setOpen(true), [setOpen])
  const close = useCallback(() => setOpen(false), [setOpen])
  const toggle = useCallback(() => setOpen(!resolvedOpen), [setOpen, resolvedOpen])

  // Opening always starts from the current value rather than from wherever
  // the highlight was left last time — reopening a list to find it pointing
  // at an entry the user rejected earlier is disorienting.
  useEffect(() => {
    if (resolvedOpen) setHighlightedIndex(selectedIndex)
    // selectedIndex deliberately excluded: this is "reset on open", not
    // "follow the value while open" (the latter would fight Arrow-key
    // navigation, which moves the highlight without committing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedOpen])

  // A shrinking list (a narrower min/max, or a coarser step) can strand the
  // highlight past the end.
  useEffect(() => {
    if (highlightedIndex >= itemCount) setHighlightedIndex(itemCount - 1)
  }, [itemCount, highlightedIndex])

  useEffect(() => {
    if (!resolvedOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setInternalOpen(false)
      onOpenChangeRef.current(false)
    }
    // mousedown rather than click: closing on the way down matches how
    // native selects and the calendar popup behave, and avoids a click that
    // started inside the list but ended outside it counting as a click-away.
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [resolvedOpen])

  // Scrolls the highlighted entry into view by setting scrollTop directly
  // rather than calling scrollIntoView: the latter scrolls the whole page
  // to reach the popup in some browsers, and isn't implemented in jsdom at
  // all, which would make every test touching the list throw.
  useEffect(() => {
    if (!resolvedOpen) return
    const list = listRef.current
    const item = list?.children[highlightedIndex] as HTMLElement | undefined
    if (!list || !item) return
    const itemBottom = item.offsetTop + item.offsetHeight
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight
  }, [resolvedOpen, highlightedIndex])

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      setHighlightedIndex((current) => {
        const next = current + direction
        if (next < 0) return 0
        if (next > itemCount - 1) return itemCount - 1
        return next
      })
    },
    [itemCount],
  )

  return {
    isOpen: resolvedOpen,
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
