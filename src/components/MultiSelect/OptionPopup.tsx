import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_POPUP_Z_INDEX, readPopupZIndex } from '../../lib/layering'

// Placement, theming and layering for MultiSelect's option popup.
//
// InputTime's TimePopup is the model rather than the import (see
// specs/components/multi-select/plan.md §0.2): it applies maxHeight to the
// popup root and observes that same node for scrollHeight, while R12.4 requires
// the filter input and select-all checkbox to sit *outside* the scroll area, so
// the capped and scrolled node is the inner listbox rather than the root. That
// is a different node relationship, not a prop. The duplicated placement maths
// is the cost plan.md §0.3 names deliberately; extracting a shared popup
// primitive would edit a shipped control and is a separate, separately approved
// change.
//
// How the height works, and why nothing here measures the filter or the
// checkbox: the root is a flex column with a max-height of whatever space the
// viewport leaves, and the listbox inside it carries `flex-1 min-h-0` plus its
// own `maxDropdownHeight` cap. CSS then gives the chrome its natural height and
// the listbox the remainder, so the filter and select-all stay visible in a long
// list without a measure-subtract-remeasure pass that could oscillate.

interface OptionPopupProps extends HTMLAttributes<HTMLDivElement> {
  // The field wrapper the popup is positioned against.
  anchorRef: RefObject<HTMLDivElement | null>
  // The popup root. Owned by useOptionDropdown, which needs it to tell a
  // pointer-down inside the popup from a click-away.
  popupRef: RefObject<HTMLDivElement | null>
  // The scrollable listbox inside the popup. Required for measurement, not for
  // rendering — see the `desired` calculation below.
  listRef: RefObject<HTMLDivElement | null>
  // The listbox's own cap, so the popup never asks for more room than the list
  // is allowed to use.
  maxListHeight: number
  portal: boolean
  // Undefined leaves the layer to --rc-z-popup, then to DEFAULT_POPUP_Z_INDEX.
  portalZIndex: number | undefined
  children: ReactNode
}

interface Placement {
  left: number
  top: number
  width: number
  maxHeight: number
  dark: boolean
  fontFamily: string
  primary: string
  zIndex: string
  visible: boolean
}

const GAP = 8

export function OptionPopup({
  anchorRef,
  popupRef,
  listRef,
  maxListHeight,
  portal,
  portalZIndex,
  className,
  children,
  ...rest
}: OptionPopupProps) {
  const [placement, setPlacement] = useState<Placement | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const popup = popupRef.current
    if (!anchor || !popup) return

    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight

      const width = Math.min(rect.width, Math.max(0, viewportWidth - GAP * 2))
      const left = Math.max(
        viewportLeft + GAP,
        Math.min(rect.left, viewportLeft + viewportWidth - GAP - width),
      )
      const below = Math.max(0, viewportTop + viewportHeight - rect.bottom - GAP * 2)
      const above = Math.max(0, rect.top - viewportTop - GAP * 2)
      // The height the popup *wants*, measured so that it does not depend on the
      // height it currently has.
      //
      // `popup.scrollHeight` cannot be used, and this is the subtle part: the
      // root is a clamped flex column and the listbox inside it is
      // `flex-1 min-h-0`, so applying a max-height to the root makes flexbox
      // shrink the listbox, which makes the root's own scrollHeight smaller,
      // which the ResizeObserver below turns into a smaller max-height. The
      // popup collapses over a few frames. (TimePopup measures the scroller
      // itself, whose scrollHeight reports full content height regardless of the
      // clamp, which is why it never hits this.)
      //
      // So measure the two parts separately, both clamp-independent: the chrome
      // above the listbox via its offsetTop — the filter input and select-all
      // are `shrink-0`, so that does not move — plus the listbox's own content
      // height, capped at what the listbox is allowed to use anyway.
      const list = listRef.current
      const desired = list
        ? list.offsetTop + Math.min(list.scrollHeight, maxListHeight)
        : popup.scrollHeight
      const down = below >= desired || below >= above
      const maxHeight = Math.max(0, Math.min(desired, down ? below : above))
      const top = down ? rect.bottom + GAP : rect.top - GAP - maxHeight
      const computed = getComputedStyle(anchor)

      const next: Placement = {
        left: portal ? left : left - rect.left,
        top: portal ? top : top - rect.top,
        width,
        maxHeight,
        dark: !!anchor.closest('.dark'),
        fontFamily: computed.fontFamily,
        primary: computed.getPropertyValue('--rc-color-primary').trim(),
        zIndex: readPopupZIndex(anchor) ?? String(DEFAULT_POPUP_Z_INDEX),
        visible: rect.bottom >= viewportTop && rect.top <= viewportTop + viewportHeight,
      }
      setPlacement((previous) =>
        previous &&
        (Object.keys(next) as (keyof Placement)[]).every((key) => previous[key] === next[key])
          ? previous
          : next,
      )
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(anchor)
    // The listbox, not the popup: observing the node whose max-height this
    // effect sets is what closed the feedback loop described above.
    if (listRef.current) resize?.observe(listRef.current)
    const theme = new MutationObserver(update)
    for (let node: HTMLElement | null = anchor; node; node = node.parentElement) {
      theme.observe(node, { attributes: true, attributeFilter: ['class', 'style'] })
    }
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      resize?.disconnect()
      theme.disconnect()
    }
  }, [anchorRef, popupRef, listRef, maxListHeight, portal])

  const style: CSSProperties & { '--rc-color-primary'?: string } = {
    position: portal ? 'fixed' : 'absolute',
    left: placement?.left,
    top: placement?.top,
    right: 'auto',
    width: placement?.width,
    maxHeight: placement?.maxHeight,
    margin: 0,
    // An explicit prop wins over the application's token, which wins over ours.
    zIndex: portalZIndex ?? placement?.zIndex ?? DEFAULT_POPUP_Z_INDEX,
    visibility: placement?.visible ? 'visible' : 'hidden',
    fontFamily: placement?.fontFamily,
    '--rc-color-primary': placement?.primary || undefined,
  }

  const popup = (
    <div
      {...rest}
      ref={popupRef}
      // A pointer-down inside the popup must never read as a click-away, and
      // the portalled popup is not inside the field's wrapper.
      onMouseDown={(event) => event.stopPropagation()}
      // shadow-lg and rounded-xl rather than the field's own shadow-theme-xs /
      // rounded-lg: this matches the other popups in the library, and
      // --shadow-theme-* only defines `xs`, so a `shadow-theme-lg` would
      // silently compile to nothing.
      className={`rc-scalar flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/5 dark:bg-gray-900 ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  )

  // Keep class-based dark mode local to the detached popup, even when the
  // application applies its theme to a subtree rather than documentElement.
  return portal
    ? createPortal(<div className={placement?.dark ? 'dark' : undefined}>{popup}</div>, document.body)
    : popup
}
