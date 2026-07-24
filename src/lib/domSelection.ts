// Applying a selection synchronously inside a change handler isn't reliably
// the last word: when the reformatted/masked text equals what's already on
// screen (e.g. a redundant trailing zero, a rejected keystroke restoring the
// old cursor position, or a masking no-op), there's nothing for React to
// reconcile, and *something* in the browser's own post-input-event handling
// still collapses the selection back to the end shortly after — observed
// even though this same synchronous call reliably sticks when the text does
// change. Re-applying once more on a microtask (after that settles, before
// the user's next keystroke) covers both cases. Shared by InputNumber (live
// numeric reformatting) and InputDate (live date masking), which both hit
// this exact issue for the same underlying reason.
export function applySelection(el: HTMLInputElement, start: number, end: number) {
  el.setSelectionRange(start, end)
  queueMicrotask(() => {
    if (document.activeElement === el) el.setSelectionRange(start, end)
  })
}

// Calling .select() synchronously inside a focus handler doesn't reliably
// select anything in WebKit/Safari specifically, when focus was triggered
// by a real click: confirmed empirically (via Playwright's WebKit engine,
// not just reasoned about) that a real click's own native cursor
// positioning runs *after* the focus event fires there, silently
// overwriting a synchronous .select() call — the field is left with a
// collapsed cursor at the click position instead of a full selection.
// Chromium doesn't have this ordering issue (a synchronous call sticks
// there), but deferring with a zero-delay setTimeout works consistently on
// both, since it always runs after whatever native positioning the click
// does. Shared by InputNumber and InputDate's "select the whole value on
// focus" behavior, both of which hit this the same way.
export function selectAllOnFocus(el: HTMLInputElement): void {
  setTimeout(() => {
    if (document.activeElement === el) el.select()
  }, 0)
}
