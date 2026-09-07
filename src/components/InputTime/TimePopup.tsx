import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, HTMLAttributes, RefObject } from 'react'
import { createPortal } from 'react-dom'

interface TimePopupProps extends HTMLAttributes<HTMLDivElement> {
  anchorRef: RefObject<HTMLDivElement | null>
  listRef: RefObject<HTMLDivElement | null>
  maxHeight: number
  portal: boolean
  portalZIndex: number
}

interface Placement {
  left: number
  top: number
  width: number
  maxHeight: number
  dark: boolean
  fontFamily: string
  primary: string
  visible: boolean
}

// Shared by the time-only and combined fields. Placement belongs to the popup;
// selection, focus and keyboard state remain with their existing owners.
export function TimePopup({ anchorRef, listRef, maxHeight, portal, portalZIndex, className, children, ...rest }: TimePopupProps) {
  const [placement, setPlacement] = useState<Placement | null>(null)
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const list = listRef.current
    if (!anchor || !list) return
    const update = () => {
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight
      const gap = 8
      const width = Math.min(rect.width, Math.max(0, viewportWidth - gap * 2))
      const left = Math.max(viewportLeft + gap, Math.min(rect.left, viewportLeft + viewportWidth - gap - width))
      const below = Math.max(0, viewportTop + viewportHeight - rect.bottom - gap * 2)
      const above = Math.max(0, rect.top - viewportTop - gap * 2)
      const desired = Math.max(0, Math.min(maxHeight, list.scrollHeight || maxHeight))
      const down = below >= desired || below >= above
      const height = Math.min(desired, down ? below : above)
      const top = down ? rect.bottom + gap : rect.top - gap - height
      const computed = getComputedStyle(anchor)
      const next: Placement = {
        left: portal ? left : left - rect.left,
        top: portal ? top : top - rect.top,
        width,
        maxHeight: height,
        dark: !!anchor.closest('.dark'),
        fontFamily: computed.fontFamily,
        primary: computed.getPropertyValue('--rc-color-primary').trim(),
        visible: rect.bottom >= viewportTop && rect.top <= viewportTop + viewportHeight,
      }
      setPlacement(previous => previous && Object.keys(next).every(key => previous[key as keyof Placement] === next[key as keyof Placement]) ? previous : next)
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(anchor)
    resize?.observe(list)
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
  }, [anchorRef, listRef, maxHeight, portal])

  const style: CSSProperties & { '--rc-color-primary'?: string } = {
    position: portal ? 'fixed' : 'absolute',
    left: placement?.left,
    top: placement?.top,
    right: 'auto',
    width: placement?.width,
    maxHeight: placement?.maxHeight ?? maxHeight,
    margin: 0,
    zIndex: portalZIndex,
    visibility: placement?.visible ? 'visible' : 'hidden',
    fontFamily: placement?.fontFamily,
    '--rc-color-primary': placement?.primary || undefined,
  }
  const popup = <div {...rest} ref={listRef} className={`rc-scalar ${className ?? ''}`} style={style}>{children}</div>
  // Keep class-based dark mode local to the detached list, even when the
  // application applies its theme to a subtree rather than documentElement.
  return portal ? createPortal(<div className={placement?.dark ? 'dark' : undefined}>{popup}</div>, document.body) : popup
}
