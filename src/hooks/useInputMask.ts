import { useEffect, useRef } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import { applySelection } from '../lib/domSelection'
import {
  AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS,
  applyInputMask,
  diffStrings,
  isLiteralCharAt,
  pendingAdvanceAtCursor,
} from '../lib/inputMask'
import type { MaskSegment } from '../lib/inputMask'

export interface UseInputMaskOptions {
  // The mask for the current format, or undefined when this format can't be
  // masked at all (InputDate's alphabetic month/weekday-name tokens) — in
  // which case every method below turns into a no-op and the caller falls
  // back to plain native text editing.
  segments: MaskSegment[] | undefined
  // The live draft the component is rendering, and its setter. Passing the
  // value in (rather than the hook owning it) keeps the draft under
  // useSyncedState's control, where the external `value`/`text` resync
  // logic lives.
  draft: string
  setDraft: (next: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}

export interface UseInputMaskResult {
  // Runs a raw browser value through the mask. Returns the masked draft to
  // store, or null when the edit was rejected (the caller leaves the draft
  // untouched — the cursor has already been restored).
  maskChange: (el: HTMLInputElement, rawNext: string) => string | null
  // Backspace/Delete over an auto-inserted separator: step over it instead
  // of deleting nothing, so the *next* press deletes the actual character
  // natively. Returns true when it handled the key.
  handleDeleteKey: (event: KeyboardEvent<HTMLInputElement>) => boolean
  // Cancels a scheduled auto-advance. Callers must invoke this before any
  // commit or revert, so a timeout can't fire against a draft that no
  // longer exists.
  clearPendingAdvance: () => void
}

// The React half of the live-typing mask: the pending-advance timeout, the
// cursor restoration, and the change/keydown plumbing that drives
// src/lib/inputMask.ts. The pure half of the mask lives in that module and
// knows nothing about React; this is everything needed to run it from a
// controlled <input>, and it's shared for the same reason the engine is —
// the invariants below (clear before commit, re-check focus after the wait,
// always re-apply the cursor) are subtle enough that two copies would drift.
export function useInputMask({ segments, draft, setDraft, inputRef }: UseInputMaskOptions): UseInputMaskResult {
  // Timer for the ambiguous-digit auto-advance (see
  // AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS) — rescheduled on every keystroke,
  // cleared on blur/commit and Escape, and on unmount below.
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read inside the timeout callback, which is created once per keystroke
  // but fires more than a second later, by which time the component has
  // very likely re-rendered with a different setDraft closure.
  const setDraftRef = useRef(setDraft)
  setDraftRef.current = setDraft

  function clearPendingAdvance() {
    if (advanceTimeoutRef.current !== null) {
      clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }
  }

  useEffect(() => clearPendingAdvance, [])

  // Schedules the ambiguous-digit auto-advance *if* the cursor is currently
  // sitting in an ambiguous, still-open segment (e.g. a day "1", which could
  // still become "10"-"19"); pendingAdvanceAtCursor returns null otherwise,
  // so this is a no-op when there's nothing to advance. Cursor-scoped (not a
  // global open-segment scan) specifically so a single-digit segment the
  // user has already typed past can't schedule a spurious advance that yanks
  // the cursor back to it. The fired callback re-checks focus, since the
  // user may have blurred during the delay.
  function scheduleAdvanceIfPending(currentDraft: string, cursor: number) {
    if (!segments) return
    const pending = pendingAdvanceAtCursor(segments, currentDraft, cursor)
    if (!pending) return
    advanceTimeoutRef.current = setTimeout(() => {
      advanceTimeoutRef.current = null
      const node = inputRef.current
      if (!node || document.activeElement !== node) return
      setDraftRef.current(pending.draft)
      applySelection(node, pending.cursor, pending.cursor)
    }, AMBIGUOUS_SEGMENT_ADVANCE_DELAY_MS)
  }

  function maskChange(el: HTMLInputElement, rawNext: string): string | null {
    clearPendingAdvance()
    if (!segments) return rawNext
    // diffStrings recovers the single edit region from the browser's own
    // resulting value (works uniformly for a keystroke, Backspace/Delete, an
    // overtyped selection, or a paste, without needing to know which one
    // happened); applyInputMask then either accepts it (auto-inserting the
    // next literal separator when a segment completes) or rejects it
    // outright, restoring the draft/cursor to where the rejected edit started.
    const edit = diffStrings(draft, rawNext)
    const result = applyInputMask(segments, draft, edit)
    if (result === 'reject') {
      applySelection(el, edit.start, edit.start)
      // The draft is unchanged, but the segment being edited may still be an
      // ambiguous open one (e.g. typing an invalid 2nd day digit onto "3" is
      // rejected, leaving "3" still open) — keep its auto-advance ticking
      // rather than leaving it stuck with no way forward.
      scheduleAdvanceIfPending(draft, edit.start)
      return null
    }
    // Always re-apply the cursor here, even when the masked text happens to
    // textually equal `rawNext` (e.g. an explicit separator keystroke that
    // force-advances a segment to exactly what the browser already typed) —
    // an earlier version skipped this call in that case, reasoning the
    // browser's own native cursor placement was already right. That
    // reasoning doesn't hold: React's controlled-input reconciliation
    // doesn't know the DOM's `value` was just mutated natively by this same
    // keystroke (it only sees "state changed from the previous render"), so
    // it can still reassign `el.value` on commit — even to matching text —
    // which resets the browser's own cursor placement with nothing left to
    // correct it afterward. Always calling applySelection here (cheap: a
    // setSelectionRange plus a microtask re-apply, see its own doc comment)
    // removes that assumption entirely rather than relying on it holding in
    // every browser engine.
    applySelection(el, result.cursor, result.cursor)
    scheduleAdvanceIfPending(result.draft, result.cursor)
    return result.draft
  }

  function handleDeleteKey(event: KeyboardEvent<HTMLInputElement>): boolean {
    if (!segments) return false
    if (event.key !== 'Backspace' && event.key !== 'Delete') return false
    const el = event.currentTarget
    const cursor = el.selectionStart
    if (cursor === null || cursor !== el.selectionEnd) return false
    // Backspace looks at the character behind the cursor, Delete at the one
    // in front; everything else about the two is identical.
    const index = event.key === 'Backspace' ? cursor - 1 : cursor
    if (index < 0 || !isLiteralCharAt(draft, index, segments)) return false
    event.preventDefault()
    const next = event.key === 'Backspace' ? index : index + 1
    el.setSelectionRange(next, next)
    return true
  }

  return { maskChange, handleDeleteKey, clearPendingAdvance }
}
