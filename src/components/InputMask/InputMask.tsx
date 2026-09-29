import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import { afterInputEvent, composeInputEvent } from '../../lib/inputEvents'
import { useSyncedState } from '../../hooks/useSyncedState'
import { applySelection } from '../../lib/domSelection'
import { deriveInputMode, resolvePattern, resolvePromptChar, splitClusters } from '../../lib/maskPattern'
import type { MaskPattern } from '../../lib/maskPattern'
import {
  applyText,
  backspace,
  caretEnd,
  caretHome,
  caretLeft,
  caretRight,
  commitState,
  deleteForward,
  emptyEntry,
  entryText,
  entryToRaw,
  offsetToPosition,
  positionToOffset,
  rawToEntry,
  selectRange,
  typeInto,
} from '../../lib/maskField'
import type { InvalidInputInfo, MaskEntry } from '../../lib/maskField'

export type { InvalidInputInfo } from '../../lib/maskField'

export interface InputMaskProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'required' | 'readOnly' | 'disabled'
  > {
  // The raw value: the mask's literals removed, one cluster per fillable
  // position, in order, with a space where an optional position was left
  // blank. Positional on purpose — "1 23" and " 123" are different values for
  // mask "99-00", and stripping the blanks would make a controlled round trip
  // impossible. Reducing it further (dropping the blanks, say) is the
  // consumer's call, since only it knows whether they mean anything.
  //
  // Note this is the opposite of the reference API's naming, where `value` is
  // the formatted text and `rawValue` is this. The library's contract wins:
  // what `onChange` reports is what a form submits.
  value?: string | null
  defaultValue?: string | null
  onChange?: (value: string | null) => void
  // The mask pattern: `0` digit, `9` digit or space, `#` digit, sign or
  // space, `L` letter, `l` letter or space, `A` letter or digit, `a` letter,
  // digit or space. `\` escapes the next character into a literal, `>` and
  // `<` force the following letters to upper or lower case and `|` ends the
  // conversion; anything else is a literal the control renders itself.
  //
  // An empty or unreadable mask leaves an ordinary text field.
  mask?: string
  // What an unfilled position shows. Falls back to `_` when it is not exactly
  // one grapheme cluster, and when the mask itself would accept it as data —
  // a prompt the field can also hold makes a filled position indistinguishable
  // from an empty one, and copying the field then loses whatever matched.
  promptChar?: string
  // Whether typing replaces the character at the caret or inserts and pushes
  // the rest of the field along within the mask.
  overwriteMode?: boolean
  // Named to match the reference API rather than the native `required`
  // convention — see CLAUDE.md's note on this deliberate exception set.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  // Two-way binding for the text shown in the control, distinct from `value`
  // — same contract as the other scalar inputs, with one narrowing: `text` is
  // applied *through* the mask rather than written verbatim, because text the
  // mask cannot describe would leave the field in a state no raw value could
  // be derived from.
  text?: string
  onTextChange?: (text: string) => void
  // Fires when a keystroke, a paste or a commit is refused. Notification
  // only: unlike the reference API's `invalidInput`, it cannot be cancelled,
  // because keeping the invalid content would mean rendering text the mask
  // forbids. It is therefore not routed through `composeInputEvent`, and
  // calling preventDefault on anything reachable from it does nothing.
  onInvalidInput?: (info: InvalidInputInfo) => void
}

const inputBaseClassName =
  'h-11 w-full appearance-none rounded-lg border px-4 py-2.5 text-sm shadow-sm outline-none placeholder:text-gray-400 focus:ring-3 dark:text-white/90 dark:placeholder:text-white/30'

function inputStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-500 opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
  if (isReadOnly) {
    return 'cursor-default border-gray-300 bg-gray-50 text-gray-800 focus:border-[var(--rc-color-primary,#465fff)] focus:ring-[color-mix(in_srgb,var(--rc-color-primary,#465fff)_20%,transparent)] dark:border-gray-700 dark:bg-gray-800/60 dark:focus:border-[var(--rc-color-primary,#465fff)]'
  }
  return 'border-gray-300 bg-transparent text-gray-800 focus:border-[var(--rc-color-primary,#465fff)] focus:ring-[color-mix(in_srgb,var(--rc-color-primary,#465fff)_20%,transparent)] dark:border-gray-700 dark:bg-gray-900 dark:focus:border-[var(--rc-color-primary,#465fff)]'
}

export const InputMask = forwardRef<HTMLInputElement, InputMaskProps>(function InputMask(
  {
    value,
    defaultValue = null,
    onChange,
    mask,
    promptChar,
    overwriteMode = false,
    isDisabled = false,
    isReadOnly = false,
    isRequired = true,
    text,
    onTextChange,
    onInvalidInput,
    // Native passthrough, pulled out of `rest` only so an empty masked field
    // can fall back to the mask's own shape.
    placeholder,
    className,
    ...rest
  },
  ref,
) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue)
  const committedValue = isControlled ? value : internalValue

  // Null is unmasked, which is a separate contract rather than a mask with no
  // positions: nothing is refused, no prompt characters appear, and the raw
  // value is the text verbatim. Narrowing this is what forces every caller
  // below to take that branch deliberately.
  const pattern = resolvePattern(mask)
  const prompt = resolvePromptChar(pattern, promptChar)
  const wholeField = pattern ? { start: 0, end: pattern.positions.length } : { start: 0, end: 0 }

  function formatValue(raw: string | null): string {
    if (raw === null) return ''
    if (!pattern) return raw
    return entryText(pattern, rawToEntry(pattern, raw), prompt)
  }

  // A `text` override is read *through* the mask rather than written
  // verbatim. "As if the user had typed it" is kept faithfully — that is
  // exactly what typing does — while the field's central invariant holds:
  // what it renders is always a valid rendering of the mask, which is the
  // only thing a raw value can be derived from. mask="00" with text="AB"
  // therefore shows the empty field, not "AB".
  function throughMask(source: string): string {
    if (!pattern) return source
    return entryText(pattern, applyText(pattern, emptyEntry(pattern), source, prompt, wholeField).entry, prompt)
  }

  const formattedValue = formatValue(committedValue)
  const baseline = text !== undefined ? throughMask(text) : formattedValue
  const [draft, setDraft] = useSyncedState(baseline)

  // Editing state for a masked field: created on focus, kept until blur.
  // While it exists it is what the field displays, and the draft holds the
  // last committed text.
  const [entry, setEntry] = useState<MaskEntry | null>(null)
  const editing = pattern && entry ? { pattern, entry } : null
  const displayed = editing ? entryText(editing.pattern, editing.entry, prompt) : draft

  // Compared against what the field is *showing*, not against the draft: the
  // draft does not move while groups are being edited, so a revert back to it
  // would look like no change at all and the consumer would be left holding
  // text the field has stopped displaying.
  function notifyText(next: string) {
    if (next !== displayed) onTextChange?.(next)
  }

  function updateDraft(next: string) {
    notifyText(next)
    setDraft(next)
  }

  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const lastCommittedRef = useRef(committedValue)

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      applySelection(inputElementRef.current, start, end)
      pendingSelectionRef.current = null
    }
  })

  // A controlled parent may change the value while the field is focused, and
  // the entry would otherwise go on showing — and then commit — what the
  // field held before. Publishing after the render commits, rather than
  // during it, keeps a suspended render from replacing the visible baseline.
  // Anything that changes what the field *should* be showing has to reach the
  // entry, or it goes on displaying — and then committing — what the field
  // held before. A controlled `value`, a `text` override and a changed `mask`
  // are three routes to one outcome, so they are handled as one: whenever the
  // baseline the field renders from moves, an open entry is re-seeded from it.
  //
  // Published after the render commits rather than during it, so a suspended
  // render cannot replace the visible baseline.
  const previousControlledValueRef = useRef(value)
  const previousBaselineRef = useRef(baseline)
  const previousMaskRef = useRef(mask)
  // Read through refs rather than listed as dependencies: both are rebuilt
  // every render, so depending on them would re-run this for a baseline that
  // has not moved.
  const seedRef = useRef<(source: string) => MaskEntry | null>(() => null)
  useLayoutEffect(() => {
    if (isControlled && value !== previousControlledValueRef.current) {
      previousControlledValueRef.current = value
      lastCommittedRef.current = value
    }
    const moved = baseline !== previousBaselineRef.current || mask !== previousMaskRef.current
    previousBaselineRef.current = baseline
    previousMaskRef.current = mask
    if (!moved) return
    setEntry((existing) => (existing ? seedRef.current(baseline) : existing))
  }, [isControlled, value, baseline, mask])

  function seedEntry(source: string): MaskEntry | null {
    if (!pattern) return null
    return applyText(pattern, emptyEntry(pattern), source, prompt, wholeField).entry
  }
  seedRef.current = seedEntry

  // Every edit lands here, so the caret the model chose becomes the caret the
  // browser shows — converted from a position index to a text offset once, at
  // this boundary, against the text this render is about to show.
  function applyEntry(next: MaskEntry, invalid?: InvalidInputInfo) {
    if (!pattern) return
    setEntry(next)
    const start = positionToOffset(pattern, next, prompt, next.caret.start)
    const end =
      next.caret.end === next.caret.start ? start : positionToOffset(pattern, next, prompt, next.caret.end)
    pendingSelectionRef.current = { start, end }
    notifyText(entryText(pattern, next, prompt))
    if (invalid) onInvalidInput?.(invalid)
  }

  function commit(next: string | null) {
    const changed = next !== lastCommittedRef.current
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    return formatValue(next)
  }

  // The three-way rule, emptiness first: a mask whose positions are all
  // optional has no required position to be missing, so testing completeness
  // first would report an untouched field complete and commit a row of
  // blanks instead of null.
  //
  // `keepEditing` is what separates Enter from blur. Enter commits and the
  // user carries on typing in the same field, so the entry is re-seeded from
  // what was just committed rather than dropped — dropping it would send the
  // next commit down the unmasked branch, where "12-34" is a value.
  function commitEntry(keepEditing: boolean) {
    if (isReadOnly) return
    if (editing) {
      const state = commitState(editing.pattern, editing.entry)
      let settledText: string
      if (state === 'complete') settledText = commit(entryToRaw(editing.pattern, editing.entry))
      else if (state === 'empty' && !isRequired) settledText = commit(null)
      else {
        settledText = formattedValue
        if (state === 'incomplete') onInvalidInput?.({ reason: 'incomplete' })
      }
      updateDraft(settledText)
      setEntry(keepEditing ? seedEntry(settledText) : null)
      return
    }
    // Unmasked: the same rule with its middle branch removed, since
    // "incomplete" has no meaning where there are no required positions.
    if (draft === '') {
      updateDraft(!isRequired ? commit(null) : formattedValue)
      return
    }
    updateDraft(commit(draft))
  }

  function revert() {
    updateDraft(baseline)
    setEntry(entry === null ? null : seedEntry(baseline))
  }

  function startEditing(el: HTMLInputElement, fromPointer: boolean) {
    if (!pattern || isReadOnly) return
    const seeded = seedEntry(draft)
    if (!seeded) return
    const offset = fromPointer ? (el.selectionStart ?? 0) : 0
    const index = offsetToPosition(pattern, seeded, prompt, offset)
    const placed = selectRange(seeded, { start: index, end: index })
    setEntry(placed)
    const at = positionToOffset(pattern, placed, prompt, index)
    pendingSelectionRef.current = { start: at, end: at }
  }

  // The live selection, which the model cannot know on its own: a click or a
  // drag moved the caret without passing through any handler here. Returned
  // unchanged when nothing actually moved, because rebuilding the range
  // empties the owed-literal queue — and then a separator typed right after
  // the caret auto-advanced past it would be refused, which is the one thing
  // that queue exists to prevent.
  function withLiveSelection(p: MaskPattern, current: MaskEntry, el: HTMLInputElement): MaskEntry {
    const start = offsetToPosition(p, current, prompt, el.selectionStart ?? 0)
    const end = offsetToPosition(p, current, prompt, el.selectionEnd ?? 0)
    if (start === current.caret.start && end === current.caret.end) return current
    return selectRange(current, { start, end })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Guards first, before any key is dispatched on. A composition's Enter is
    // the IME's, not a commit, and Ctrl+Backspace or Cmd+ArrowLeft belong to
    // the browser's own word- and line-wise editing.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (event.key === 'Enter') {
      commitEntry(true)
      return
    }
    if (event.key === 'Escape') {
      revert()
      return
    }
    if (!editing || isDisabled || isReadOnly) return
    const { pattern: p } = editing
    const el = event.currentTarget
    const current = withLiveSelection(p, editing.entry, el)

    // Shift plus a movement key is a selection gesture. The browser extends
    // the native selection better than this model can, and the next edit
    // reads whatever it produced through withLiveSelection, so the handler
    // stays out of the way rather than collapsing the caret.
    const isMovement =
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'Home' ||
      event.key === 'End'
    if (event.shiftKey && isMovement) return

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        applyEntry(caretLeft(p, current))
        return
      case 'ArrowRight':
        event.preventDefault()
        applyEntry(caretRight(p, current))
        return
      case 'Home':
        event.preventDefault()
        applyEntry(caretHome(p, current))
        return
      case 'End':
        event.preventDefault()
        applyEntry(caretEnd(p, current))
        return
      case 'Backspace':
        event.preventDefault()
        applyEntry(backspace(p, current))
        return
      case 'Delete':
        event.preventDefault()
        applyEntry(deleteForward(p, current))
        return
    }

    if (splitClusters(event.key).length !== 1) return
    event.preventDefault()
    const result = typeInto(p, current, event.key, overwriteMode)
    applyEntry(result.entry, result.invalid)
  }

  // Only what the keyboard path cannot see reaches here: an autofill, an IME
  // commit, or a paste in a browser that gave no paste event. Taken as a
  // whole-field replacement rather than diffed — a minimal diff cannot
  // recover text that shares a prefix or suffix with what it replaced.
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (isReadOnly) return
    const incoming = event.target.value
    if (!editing) {
      updateDraft(incoming)
      return
    }
    const result = applyText(editing.pattern, editing.entry, incoming, prompt, wholeField)
    applyEntry(result.entry, result.invalid)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!editing || isReadOnly) return
    event.preventDefault()
    const el = event.currentTarget
    const { pattern: p } = editing
    const current = withLiveSelection(p, editing.entry, el)
    const result = applyText(p, current, event.clipboardData.getData('text'), prompt, current.caret)
    applyEntry(result.entry, result.invalid)
  }

  const focusFromPointerRef = useRef(false)

  return (
    <input
      // Derived, and underneath the spread so a consumer's own inputMode
      // wins: a mask of `#` digits is numeric in practice but cannot derive
      // as such, and "tel" is a reasonable choice the derivation never makes.
      inputMode={deriveInputMode(pattern)}
      {...rest}
      ref={(node) => {
        inputElementRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      type="text"
      disabled={isDisabled}
      readOnly={isReadOnly}
      required={isRequired}
      // No role override: the control has no popup and no stepping, so it is
      // an ordinary textbox and neither combobox nor spinbutton applies.
      placeholder={placeholder ?? (pattern ? entryText(pattern, emptyEntry(pattern), prompt) : undefined)}
      value={displayed}
      onChange={handleChange}
      onPaste={composeInputEvent(rest.onPaste, handlePaste)}
      onMouseDown={composeInputEvent(rest.onMouseDown, () => {
        focusFromPointerRef.current = true
      })}
      onFocus={afterInputEvent((event) => {
        const fromPointer = focusFromPointerRef.current
        focusFromPointerRef.current = false
        if (entry === null) startEditing(event.currentTarget, fromPointer)
      }, rest.onFocus)}
      onClick={composeInputEvent(rest.onClick, (event) => {
        // Clicking elsewhere in an already-focused field fires no focus
        // event, so the caret has to be re-derived here too — but only for a
        // plain click, since a drag leaves a selection worth keeping.
        const el = event.currentTarget
        if (!editing || el.selectionStart !== el.selectionEnd) return
        const index = offsetToPosition(editing.pattern, editing.entry, prompt, el.selectionStart ?? 0)
        applyEntry(selectRange(editing.entry, { start: index, end: index }))
      })}
      onBlur={afterInputEvent(() => {
        commitEntry(false)
      }, rest.onBlur)}
      onKeyDown={composeInputEvent(rest.onKeyDown, handleKeyDown)}
      className={`rc-scalar ${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${className ?? ''}`}
    />
  )
})

export type { MaskPattern }
