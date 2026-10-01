import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { filterOptions } from '../../lib/optionList'
import type { MultiSelectOption } from '../../lib/optionList'

// Open state, the active row, the popup's focus-stop ring and the click-away
// for MultiSelect's option list.
//
// InputTime's useTimeDropdown is the model rather than the import, and the
// reasons are in specs/components/multi-select/plan.md §0.2: its highlight is
// seeded from a single selectedIndex ("opening always starts from the current
// value"), a multiple selection has no single current value; it assumes focus
// stays on the field, because its popup is a listbox that may keep focus
// outside, while a dialog popup may not; and its item count is the whole list,
// not the filtered set that changes under the highlight here. None of the three
// can be fixed without editing a shipped control.
//
// Two of its decisions are carried over deliberately, because both are
// hard-won and neither is about time:
//   - the stored index is clamped *on read* rather than corrected by an effect.
//     A shrinking list (a narrowing filter, here) strands a stored index past
//     the end, and fixing that with state-that-fixes-state costs a render pass
//     and gives one value two writers.
//   - scrolling sets scrollTop directly instead of calling scrollIntoView. The
//     latter scrolls the whole page to reach a portalled popup in some
//     browsers, and is not implemented in jsdom at all, so every test touching
//     the list would throw.

export interface UseOptionDropdownOptions {
  // The full, de-duplicated option list. The hook derives the visible set from
  // it rather than being handed one, because the filter text it owns is what
  // decides the set — a caller computing `visible` would need the text before
  // the hook that holds it has returned.
  options: readonly MultiSelectOption[]
  caseSensitiveSearch: boolean
  customFilter?: (option: MultiSelectOption, filterText: string) => boolean
  // Which optional focus stops exist. Not whether they can take focus: that is
  // read off the node, so an aria-disabled stop still counts.
  hasFilterInput: boolean
  hasSelectAll: boolean
  isDisabled: boolean
  isReadOnly: boolean
}

// In DOM order, which is also Tab order. `field` is not a stop: it is where
// focus returns to when Tab falls off either end.
export type FocusStop = 'filter' | 'selectAll' | 'listbox'

export interface UseOptionDropdownResult {
  isOpen: boolean
  // The rows the current filter leaves visible, in options order.
  visible: readonly MultiSelectOption[]
  // Goes on the wrapper around the field *and*, when not portalled, the popup.
  rootRef: RefObject<HTMLDivElement | null>
  // The popup root, portalled or not — a pointer-down inside it is never a
  // click-away, so it has to be known separately from rootRef.
  popupRef: RefObject<HTMLDivElement | null>
  fieldRef: RefObject<HTMLInputElement | null>
  filterRef: RefObject<HTMLInputElement | null>
  selectAllRef: RefObject<HTMLInputElement | null>
  listboxRef: RefObject<HTMLDivElement | null>

  open: () => void
  close: () => void
  toggle: () => void

  filterText: string
  // The user path. `close` clears the filter without going through here, which
  // is what keeps the two distinguishable at the point the text changes — two
  // functions rather than a flag, so a caller cannot forget to set it.
  editFilter: (text: string) => void
  // The match set the field last rendered (R5.7d). Read before `editFilter`.
  renderedMatches: () => readonly MultiSelectOption[]

  // -1 when no row is visible: with nothing to point at, every rule that names
  // "the active row" has nothing to name (R9.6a).
  activeIndex: number
  setActiveIndex: (index: number) => void
  // Returns false when it could not move — the caller turns an ArrowUp that
  // could not move into the focus transfer to select-all (R9.6/R9.7a). The
  // transfer is a focus decision and does not belong in index arithmetic.
  move: (direction: 1 | -1) => boolean

  // Ordered stops that exist *and* can take focus (R9.5e).
  focusStops: () => readonly FocusStop[]
  focusStop: (stop: FocusStop) => void
  // null at the ends, which is how "Tab falls back to the field" reaches the
  // caller without this hook knowing what closing means.
  nextStop: (from: FocusStop) => FocusStop | null
  previousStop: (from: FocusStop) => FocusStop | null
  // Whether a focus event leaves the whole control — field, popup and the
  // portalled subtree together (R9.5d).
  leavesControl: (relatedTarget: EventTarget | null) => boolean
}

// A natively disabled control cannot be focused; an aria-disabled one can, and
// R6.6 deliberately uses the latter so a keyboard user can still discover that
// select-all exists.
function canTakeFocus(node: HTMLElement | null): boolean {
  return node !== null && !node.hasAttribute('disabled')
}

export function useOptionDropdown({
  options,
  caseSensitiveSearch,
  customFilter,
  hasFilterInput,
  hasSelectAll,
  isDisabled,
  isReadOnly,
}: UseOptionDropdownOptions): UseOptionDropdownResult {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)
  const filterRef = useRef<HTMLInputElement | null>(null)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [storedIndex, setStoredIndex] = useState(0)

  const visible = filterOptions(options, filterText, { caseSensitiveSearch, customFilter })
  const itemCount = visible.length

  // The last *committed* render's filtered set, which is what "the set the
  // field last rendered" means. Written in an effect rather than during render
  // so a discarded render cannot become the baseline.
  const renderedMatchesRef = useRef<readonly MultiSelectOption[]>(visible)
  useEffect(() => {
    renderedMatchesRef.current = visible
  })

  const clamp = (index: number) => (itemCount === 0 ? -1 : Math.max(0, Math.min(index, itemCount - 1)))
  const activeIndex = clamp(storedIndex)

  // Plain functions, not useCallback: nothing consumes these across a memo
  // boundary and the hook returns a fresh object every render anyway, so
  // memoizing buys no stability and only adds dep arrays to keep correct.
  const open = () => {
    if (isDisabled || isReadOnly) return
    setStoredIndex(0)
    setIsOpen(true)
  }

  // The single place the filter is cleared on close (R5.5), so no closing route
  // can forget to — and the one clear that must not look like a user edit.
  const close = () => {
    setIsOpen(false)
    setFilterText('')
  }

  const toggle = () => {
    if (isOpen) close()
    else open()
  }

  const editFilter = (text: string) => {
    setFilterText(text)
    // A narrower filter can strand the highlight past the end; clamp-on-read
    // handles that, but restarting at the first row is what the user means by
    // typing, so the reset is explicit rather than incidental.
    setStoredIndex(0)
  }

  const renderedMatches = () => renderedMatchesRef.current

  const move = (direction: 1 | -1) => {
    if (itemCount === 0) return false
    const next = activeIndex + direction
    if (next < 0 || next >= itemCount) return false
    setStoredIndex(next)
    return true
  }

  const nodeFor = (stop: FocusStop) =>
    stop === 'filter' ? filterRef.current : stop === 'selectAll' ? selectAllRef.current : listboxRef.current

  const focusStops = () => {
    const stops: FocusStop[] = []
    if (hasFilterInput) stops.push('filter')
    if (hasSelectAll) stops.push('selectAll')
    stops.push('listbox')
    return stops.filter((stop) => canTakeFocus(nodeFor(stop)))
  }

  const focusStop = (stop: FocusStop) => nodeFor(stop)?.focus()

  const step = (from: FocusStop, direction: 1 | -1) => {
    const stops = focusStops()
    const index = stops.indexOf(from)
    // A stop that is not in the ring (it lost focusability under the user) is
    // treated as being before the first one, so a Tab still lands somewhere.
    const next = index < 0 ? (direction === 1 ? 0 : -1) : index + direction
    return next >= 0 && next < stops.length ? stops[next] : null
  }

  const nextStop = (from: FocusStop) => step(from, 1)
  const previousStop = (from: FocusStop) => step(from, -1)

  const leavesControl = (relatedTarget: EventTarget | null) => {
    if (!(relatedTarget instanceof Node)) return true
    return !rootRef.current?.contains(relatedTarget) && !popupRef.current?.contains(relatedTarget)
  }

  useEffect(() => {
    if (isDisabled || isReadOnly) {
      setIsOpen(false)
      setFilterText('')
    }
  }, [isDisabled, isReadOnly])

  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return
      // Move focus out of the popup *before* unmounting it. Removing a focused
      // node does not reliably produce a blur, so without this the field keeps
      // its focus ring and the consumer's onBlur never fires — the popup simply
      // vanishes from under the focused element. Handing focus to the field
      // first lets the browser's own focus change to whatever the pointer
      // targeted produce that blur normally. InputTag does the same, for the
      // same reason, and is the precedent requirements R9.5c cites.
      //
      // This does not fight the pointer's destination: a focusable target takes
      // focus immediately afterwards and wins. When the target takes no focus,
      // the field keeping it is the correct outcome — a native select behaves
      // that way too.
      if (popupRef.current?.contains(document.activeElement)) {
        fieldRef.current?.focus()
      }
      setIsOpen(false)
      setFilterText('')
    }
    // mousedown rather than click: closing on the way down matches the native
    // select and the other popups here, and a drag that starts inside the list
    // and ends outside it does not count as a click-away.
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    const list = listboxRef.current
    const item = list?.children[activeIndex] as HTMLElement | undefined
    if (!list || !item) return
    const itemBottom = item.offsetTop + item.offsetHeight
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight
  }, [isOpen, activeIndex])

  return {
    isOpen: isOpen && !isDisabled && !isReadOnly,
    visible,
    rootRef,
    popupRef,
    fieldRef,
    filterRef,
    selectAllRef,
    listboxRef,
    open,
    close,
    toggle,
    filterText,
    editFilter,
    renderedMatches,
    activeIndex,
    setActiveIndex: setStoredIndex,
    move,
    focusStops,
    focusStop,
    nextStop,
    previousStop,
    leavesControl,
  }
}
