import { forwardRef, useEffect, useRef, useState } from 'react'
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

// A key the editor acts on itself. Anything else — a modifier chord, a
// composition, a named key with no meaning here — is left to the browser, and
// crucially is not preventDefault'ed: Ctrl/Cmd+C, +V, +X, +A and +Z all
// arrive with a printable `event.key`, and swallowing them would disable the
// copy and paste this control depends on.
function isTextEntry(event: KeyboardEvent<HTMLInputElement>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.nativeEvent.isComposing || event.keyCode === 229) return false
  return splitClusters(event.key).length === 1
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

  function formatValue(raw: string | null): string {
    if (raw === null) return ''
    if (!pattern) return raw
    return entryText(pattern, rawToEntry(pattern, raw), prompt)
  }

  const formattedValue = formatValue(committedValue)
  const [draft, setDraft] = useSyncedState(text !== undefined ? text : formattedValue)
  function updateDraft(next: string) {
    if (next !== draft) onTextChange?.(next)
    setDraft(next)
  }

  // Editing state for a masked field: created on focus, cleared on commit.
  // While it exists it is what the field displays, and the draft still holds
  // the last committed text.
  const [entry, setEntry] = useState<MaskEntry | null>(null)
  const editing = pattern && entry ? { pattern, entry } : null
  const displayed = editing ? entryText(editing.pattern, editing.entry, prompt) : draft

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

  // Every edit lands here, so the caret the model chose becomes the caret the
  // browser shows — converted from a position index to a text offset once, at
  // this boundary, against the text this render is about to show.
  function applyEntry(next: MaskEntry, invalid?: InvalidInputInfo) {
    if (!pattern) return
    setEntry(next)
    const offset = positionToOffset(pattern, next, prompt, next.caret.start)
    const end = next.caret.end === next.caret.start
      ? offset
      : positionToOffset(pattern, next, prompt, next.caret.end)
    pendingSelectionRef.current = { start: offset, end }
    onTextChange?.(entryText(pattern, next, prompt))
    if (invalid) onInvalidInput?.(invalid)
  }

  function commit(next: string | null) {
    const changed = next !== lastCommittedRef.current
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    updateDraft(formatValue(next))
  }

  // The three-way rule, emptiness first: a mask whose positions are all
  // optional has no required position to be missing, so testing completeness
  // first would report an untouched field complete and commit a row of
  // blanks instead of null.
  function commitEntry() {
    if (isReadOnly) return
    if (editing) {
      const state = commitState(editing.pattern, editing.entry)
      setEntry(null)
      if (state === 'complete') commit(entryToRaw(editing.pattern, editing.entry))
      else if (state === 'empty' && !isRequired) commit(null)
      else {
        updateDraft(formattedValue)
        if (state === 'incomplete') onInvalidInput?.({ reason: 'incomplete' })
      }
      return
    }
    // Unmasked: the same rule with its middle branch removed, since
    // "incomplete" has no meaning where there are no required positions.
    if (draft === '') {
      if (!isRequired) commit(null)
      else updateDraft(formattedValue)
      return
    }
    commit(draft)
  }

  function startEditing(el: HTMLInputElement, fromPointer: boolean): MaskEntry | null {
    if (!pattern || isReadOnly) return null
    const seeded = rawToEntry(pattern, committedValue ?? '')
    const offset = fromPointer ? (el.selectionStart ?? 0) : 0
    const placed = selectRange(seeded, (() => {
      const index = offsetToPosition(pattern, seeded, prompt, offset)
      return { start: index, end: index }
    })())
    setEntry(placed)
    pendingSelectionRef.current = (() => {
      const at = positionToOffset(pattern, placed, prompt, placed.caret.start)
      return { start: at, end: at }
    })()
    return placed
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitEntry()
      return
    }
    if (event.key === 'Escape') {
      setEntry(null)
      updateDraft(formattedValue)
      return
    }
    if (!editing || isDisabled || isReadOnly) return
    const { pattern: p, entry: current } = editing
    const el = event.currentTarget
    // The live selection, which the model needs and its own copy cannot know:
    // a drag or a click moved the caret without going through any of these
    // handlers.
    const selected = selectRange(current, {
      start: offsetToPosition(p, current, prompt, el.selectionStart ?? 0),
      end: offsetToPosition(p, current, prompt, el.selectionEnd ?? 0),
    })

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        applyEntry(caretLeft(p, selected))
        return
      case 'ArrowRight':
        event.preventDefault()
        applyEntry(caretRight(p, selected))
        return
      case 'Home':
        event.preventDefault()
        applyEntry(caretHome(p, selected))
        return
      case 'End':
        event.preventDefault()
        applyEntry(caretEnd(p, selected))
        return
      case 'Backspace':
        event.preventDefault()
        applyEntry(backspace(p, selected))
        return
      case 'Delete':
        event.preventDefault()
        applyEntry(deleteForward(p, selected))
        return
    }

    if (!isTextEntry(event)) return
    event.preventDefault()
    const result = typeInto(p, selected, event.key, overwriteMode)
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
    const result = applyText(editing.pattern, editing.entry, incoming, prompt, {
      start: 0,
      end: editing.pattern.positions.length,
    })
    applyEntry(result.entry, result.invalid)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!editing || isReadOnly) return
    event.preventDefault()
    const el = event.currentTarget
    const { pattern: p, entry: current } = editing
    const range = {
      start: offsetToPosition(p, current, prompt, el.selectionStart ?? 0),
      end: offsetToPosition(p, current, prompt, el.selectionEnd ?? 0),
    }
    const result = applyText(p, current, event.clipboardData.getData('text'), prompt, range)
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
        commitEntry()
      }, rest.onBlur)}
      onKeyDown={composeInputEvent(rest.onKeyDown, handleKeyDown)}
      className={`rc-scalar ${inputBaseClassName} ${inputStateClassName(isDisabled, isReadOnly)} ${className ?? ''}`}
    />
  )
})

export type { MaskPattern }
