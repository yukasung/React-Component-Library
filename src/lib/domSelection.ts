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
