// Portalled surfaces are appended to <body>, so they leave the field's own
// stacking context and compete with the host application's overlays instead of
// with the field's neighbours. A modal at a higher z-index paints straight over
// a popup that only outranks its siblings, which reads as a dead control: the
// list is open and focusable, just underneath.
//
// Applications express their own layer order through --rc-z-popup, set on the
// field or any ancestor, the same way --rc-color-primary already crosses the
// portal boundary. The default only has to clear a typical application overlay
// for consumers that set nothing.
export const DEFAULT_POPUP_Z_INDEX = 100000

// Reads the layer an application assigned to portalled popups. Returns null
// when unset so callers can fall back to their own default, and tolerates a
// non-numeric value by passing the string through to CSS unchanged.
export function readPopupZIndex(anchor: Element): string | null {
  const value = getComputedStyle(anchor).getPropertyValue('--rc-z-popup').trim()
  return value === '' ? null : value
}
