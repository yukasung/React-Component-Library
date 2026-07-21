import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import { useSyncedState } from '../../hooks/useSyncedState'
import {
  applyPrecision,
  clamp,
  forcePositiveFormatted,
  formatValue,
  formatWithSpec,
  isValidDraft,
  parseDraft,
  parseFormattedInput,
  parseNumericFormat,
  reformatDraftLive,
  resolveFormatPrecision,
  resolvePrecision,
  stripSign,
  toggleFormattedSign,
  toggleSign,
  zeroDraftWithPrecision,
} from '../../lib/number'

export interface InputNumberProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'required' | 'readOnly' | 'disabled'
  > {
  value?: number | null
  defaultValue?: number | null
  onChange?: (value: number | null) => void
  min?: number
  max?: number
  // The amount to add/subtract per spin-button click or Arrow key press —
  // and, matching Wijmo, the sole thing that determines whether the spin
  // buttons render at all. Unset (undefined/null) means there's no defined
  // step amount, so there's nothing for the buttons (or Arrow keys, or
  // handleWheel) to increment by — they're hidden/inert until a step is
  // given. There's no separate visibility prop for this.
  step?: number | null
  precision?: number
  // .NET-style standard numeric format string (e.g. "n2", "C", "P0") —
  // see resolveFormatPrecision/formatWithSpec in src/lib/number.ts. When
  // set, this supersedes `precision` entirely for both display and the
  // decimal places used when clamping/rounding on commit.
  format?: string
  repeatButtons?: boolean
  handleWheel?: boolean
  truncate?: boolean
  // Named to match Wijmo's InputNumber API (isRequired), not the native
  // HTML/React convention (`required`) most of this component's other
  // boolean props otherwise follow — deliberate choice, see DEV-54.
  isRequired?: boolean
  // Same rationale as isRequired above — matches Wijmo's `isReadOnly`
  // naming rather than the native `readOnly` HTML/React convention.
  isReadOnly?: boolean
  // Same rationale as isRequired/isReadOnly above — matches Wijmo's
  // `isDisabled` naming rather than the native `disabled` HTML/React
  // convention.
  isDisabled?: boolean
  hint?: string
  // Wijmo-style two-way binding for the raw text shown in the control,
  // distinct from `value` (which holds the parsed number). Setting `text`
  // from outside overrides the displayed draft directly (no reformatting),
  // exactly as if the user had typed it themselves. `onTextChange` fires
  // whenever the displayed text changes for any internal reason (typing,
  // commit reformat, spin, Escape, sign toggle) — but not as an echo of a
  // `text` prop change you just set yourself, matching how external `value`
  // changes don't echo back through `onChange`.
  text?: string
  onTextChange?: (text: string) => void
}

const REPEAT_INITIAL_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 80

// The bordered "box" the user sees now lives on this wrapper, not the
// <input> itself — the -/+ spin buttons sit inside it, flanking the input,
// sharing one continuous border/rounded-corner/shadow (see the screenshot
// this layout was built from). The input becomes a borderless, transparent
// flex child; :focus-within (rather than the input's own :focus) puts the
// ring on the whole wrapper when the input inside it is focused.
const wrapperBaseClassName =
  'flex items-stretch overflow-hidden rounded-lg border shadow-sm focus-within:border-blue-300 focus-within:ring-3 focus-within:ring-blue-500/20'

function wrapperStateClassName(isDisabled: boolean, isReadOnly: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-gray-300 bg-gray-100 opacity-40 dark:border-gray-700 dark:bg-gray-800'
  }
  if (isReadOnly) {
    return 'cursor-default border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60'
  }
  return 'border-gray-300 bg-transparent dark:border-gray-700 dark:bg-gray-900'
}

const inputClassName =
  'h-11 min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-right text-sm text-gray-800 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:text-gray-500 dark:text-white/90 dark:placeholder:text-white/30 dark:disabled:text-gray-400'

const spinButtonClassName =
  'flex h-11 w-9 shrink-0 items-center justify-center border-gray-300 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent dark:border-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 dark:disabled:text-gray-700'

// The increase/decrease buttons are identical apart from which edge they
// border, their icon, and the callbacks they're wired to — pulled out so
// the two usages below don't duplicate the mousedown/mouseup/click wiring.
function SpinButton({
  ariaLabel,
  disabled,
  onStart,
  onEnd,
  onClick,
  borderSide,
  path,
}: {
  ariaLabel: string
  disabled: boolean
  onStart: () => void
  onEnd: () => void
  onClick: () => void
  borderSide: 'border-l' | 'border-r'
  path: string
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault()
        onStart()
      }}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onClick={onClick}
      className={`${spinButtonClassName} ${borderSide}`}
    >
      <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
        <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export const InputNumber = forwardRef<HTMLInputElement, InputNumberProps>(function InputNumber(
  {
    value,
    defaultValue = null,
    onChange,
    text,
    onTextChange,
    min,
    max,
    step,
    precision,
    format,
    isDisabled = false,
    isReadOnly = false,
    isRequired = true,
    repeatButtons = true,
    handleWheel = false,
    truncate = false,
    hint,
    className,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<number | null>(defaultValue)
  const [isFocused, setIsFocused] = useState(false)
  const committedValue = isControlled ? value : internalValue
  // `format`, when set, supersedes `precision` entirely — see the prop doc
  // comment above. resolveFormatPrecision maps the format spec to the
  // decimal-places count used for clamping/rounding on commit.
  const formatSpec = format ? parseNumericFormat(format) : undefined
  const effectivePrecision = formatSpec ? resolveFormatPrecision(formatSpec) : (precision ?? resolvePrecision(step ?? undefined))
  // Matches Wijmo: step is the sole condition for the spinner (buttons,
  // Arrow keys, handleWheel) — there's no separate visibility prop. No step
  // means no defined increment amount, so there's nothing to step by.
  const hasStep = typeof step === 'number'
  // Required fields never display as blank — a null committed value (e.g.
  // before the user's first interaction, or a controlled consumer passing
  // null anyway) still shows "0" rather than an empty field. The underlying
  // committed value itself isn't force-changed to 0 by this alone; it's a
  // display-only fallback that becomes real once the user commits.
  const displayValue = isRequired && committedValue === null ? 0 : committedValue
  function formatDisplay(next: number | null): string {
    if (next === null) return ''
    return formatSpec ? formatWithSpec(next, formatSpec) : formatValue(next, effectivePrecision)
  }
  function parseDraftValue(raw: string): number | null | undefined {
    return formatSpec ? parseFormattedInput(raw, formatSpec) : parseDraft(raw)
  }
  // Live keystroke-level min/max enforcement — unlike clamping (which only
  // happens at commit and silently rewrites the value), this rejects the
  // keystroke outright so an out-of-range number can never appear on screen
  // at all. Only applies once a keystroke produces a complete, parseable
  // number; an in-progress draft like "-" or "1." isn't out of bounds yet,
  // it just isn't a number yet, so it's left alone.
  function exceedsBounds(parsedValue: number | null | undefined): boolean {
    return typeof parsedValue === 'number' && clamp(parsedValue, min, max) !== parsedValue
  }
  // Shared by every commit path that adds/rounds a raw number (typed
  // draft, spin/repeat step, Arrow key) — clamps to min/max, then rounds
  // to effectivePrecision (or truncates, per the truncate prop).
  function clampToPrecision(raw: number): number {
    return applyPrecision(clamp(raw, min, max), effectivePrecision, truncate)
  }
  const formattedValue = formatDisplay(displayValue)
  // When `text` is controlled, it takes priority over the value-derived
  // formattedValue as the thing useSyncedState resyncs `draft` to — this
  // covers both the initial mount (draft starts as the given text, not a
  // reformat of `value`) and every later render where `text` changes,
  // including a render where both `value` and `text` change together
  // (`text`, being the more literal, direct control over what's displayed,
  // wins). Falls back to formattedValue once `text` goes back to
  // uncontrolled (undefined). Doesn't call onTextChange itself — see
  // updateDraft below — an external prop catching draft up to what the
  // consumer just set shouldn't echo back as a change notification, same as
  // an external `value` change doesn't echo back through `onChange`.
  const [draft, setDraft] = useSyncedState(text !== undefined ? text : formattedValue)
  // Routes every internally-originated draft change (typing, commit
  // reformat, spin, Escape, sign toggle, ...) through onTextChange — see the
  // prop doc comment. Every setDraft call below this point should go
  // through updateDraft instead, except the external-text-resync above.
  function updateDraft(next: string) {
    if (next !== draft) onTextChange?.(next)
    setDraft(next)
  }
  // aria-valuenow/aria-valuetext track what's currently on screen, not just
  // the last committed value — a screen reader user editing this spinbutton
  // expects the announced value to match what they're actively typing, the
  // same way the visible text does. draftNumericValue is undefined for a
  // draft that isn't (yet) a complete number (e.g. "-" or "1."); aria-valuenow
  // is omitted in that case rather than showing a stale or misleading number.
  const draftNumericValue = parseDraftValue(draft)
  const atMax = typeof max === 'number' && committedValue !== null && committedValue >= max
  const atMin = typeof min === 'number' && committedValue !== null && committedValue <= min
  const spinButtonsDisabled = isDisabled || isReadOnly
  const hintId = useId()
  const describedBy = [ariaDescribedBy, hint ? hintId : undefined].filter(Boolean).join(' ') || undefined
  const repeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasRepeatedRef = useRef(false)
  // Tracks the most recently committed value synchronously, independent of
  // whether a controlled parent re-renders with the new `value` prop — the
  // repeat interval below needs this to detect "already clamped" without
  // waiting on a render that may never come (e.g. a controlled consumer
  // that doesn't feed the value back).
  const lastCommittedRef = useRef(committedValue)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  // React attaches its synthetic `onWheel` as a passive native listener, so
  // `event.preventDefault()` inside it silently fails and the page scrolls
  // instead of the value stepping — a real native listener with
  // `{ passive: false }` is required. Attached once on mount; always reads
  // the latest logic via this ref so it never goes stale like a normal
  // closure would.
  const handleWheelRef = useRef<(event: globalThis.WheelEvent) => void>(() => {})
  // Set right before a setDraft call that needs the cursor (or a selection
  // range) placed somewhere specific afterward — setting draft via React
  // state doesn't reliably control where the browser leaves the cursor, so
  // this makes it explicit. A collapsed cursor is `{ start: pos, end: pos }`.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  function setCursor(pos: number) {
    pendingSelectionRef.current = { start: pos, end: pos }
  }

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const { start, end } = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(start, end)
      pendingSelectionRef.current = null
    }
  })

  function clearRepeat() {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current)
      repeatTimeoutRef.current = null
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current)
      repeatIntervalRef.current = null
    }
  }

  useEffect(() => clearRepeat, [])

  function commit(next: number | null) {
    // Skip onChange/setInternalValue when nothing actually changed — without
    // this, e.g. Enter (which already commits) immediately followed by blur
    // (which always re-parses and re-commits the draft) fires onChange
    // twice with the identical value, which is wasted work at best and a
    // duplicated side effect at worst for consumers whose onChange does
    // more than just store the value.
    const changed = next !== lastCommittedRef.current
    lastCommittedRef.current = next
    if (changed) {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    }
    updateDraft(formatDisplay(next))
  }

  function commitDraft() {
    if (isReadOnly) return
    const parsed = parseDraftValue(draft)
    if (parsed === undefined || (isRequired && parsed === null)) {
      updateDraft(formattedValue)
      return
    }
    commit(parsed === null ? null : clampToPrecision(parsed))
  }

  function stepBy(direction: 1 | -1) {
    if (!hasStep) return
    const base = parseDraftValue(draft) ?? committedValue ?? min ?? 0
    commit(clampToPrecision(base + direction * (step ?? 0)))
  }

  function startRepeat(direction: 1 | -1) {
    if (!repeatButtons || !hasStep) return
    hasRepeatedRef.current = false
    repeatTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => {
        // Deliberately reads lastCommittedRef instead of calling stepBy():
        // this closure is created once (at mousedown) and reused for every
        // tick, so it can never see a fresher `draft`/`committedValue` from
        // later renders — stepBy() would recompute the same stale base on
        // every tick instead of progressing.
        const current = lastCommittedRef.current
        const base = current ?? min ?? 0
        const next = clampToPrecision(base + direction * (step ?? 0))
        if (current !== null && next === current) {
          // Already clamped at the boundary — further ticks would be no-ops.
          clearRepeat()
          return
        }
        hasRepeatedRef.current = true
        commit(next)
      }, REPEAT_INTERVAL_MS)
    }, REPEAT_INITIAL_DELAY_MS)
  }

  function handleSpinClick(direction: 1 | -1) {
    // While repeatButtons is holding the button down, the interval already
    // stepped the value — the trailing click event (which always fires
    // after mouseup) shouldn't add one more step on top of that.
    if (!hasRepeatedRef.current) stepBy(direction)
  }

  // Applying a selection synchronously inside the change handler isn't
  // reliably the last word: when the reformatted text equals the draft
  // already on screen (e.g. a redundant trailing zero, or snapping an
  // already-"0.00" field back to "0.00"), there's nothing for React to
  // reconcile, and *something* in the browser's own post-input-event
  // handling still collapses the selection back to the end shortly after —
  // observed even though this same synchronous call reliably sticks when
  // the text does change. Re-applying once more on a microtask (after that
  // settles, before the user's next keystroke) covers both cases.
  function applySelection(el: HTMLInputElement, start: number, end: number) {
    el.setSelectionRange(start, end)
    queueMicrotask(() => {
      if (document.activeElement === el) el.setSelectionRange(start, end)
    })
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const el = event.target
    const next = el.value
    if (formatSpec) {
      // format re-renders the draft with its own decorations (commas, "$",
      // "%", ...) after every keystroke, not just on commit — reformatDraftLive
      // strips those back to plain content, re-applies formatWithSpec, and
      // maps the cursor to the same position relative to the surrounding
      // digits so it doesn't jump to the end as decorations shift around.
      const cursorIndex = el.selectionStart ?? next.length
      const result = reformatDraftLive(next, cursorIndex, formatSpec)
      if (!result) return
      if (isRequired && result.text === '') {
        // Same immediate-empty-block behavior as the unformatted path below,
        // just snapping to this format's own "zero" representation (e.g.
        // "$0.00" instead of a bare "0") and selecting all of it.
        const zeroText = formatDisplay(0)
        updateDraft(zeroText)
        applySelection(el, 0, zeroText.length)
        pendingSelectionRef.current = { start: 0, end: zeroText.length }
        return
      }
      if (exceedsBounds(parseFormattedInput(result.text, formatSpec))) return
      updateDraft(result.text)
      applySelection(el, result.cursorIndex, result.cursorIndex)
      setCursor(result.cursorIndex)
      return
    }
    if (!isValidDraft(next)) return
    if (isRequired && next.trim() === '') {
      // Required fields can't sit empty even mid-edit — snap to "0"
      // immediately (not just on blur) and select it so the next keystroke
      // naturally overwrites it, matching Wijmo's live-blocking behavior
      // rather than allowing a blank flash until commit.
      updateDraft('0')
      pendingSelectionRef.current = { start: 0, end: 1 }
      return
    }
    if (exceedsBounds(parseDraft(next))) return
    updateDraft(next)
  }

  handleWheelRef.current = (event) => {
    // Opt-in and focus-gated: an unfocused field silently changing value
    // because the page scrolled past it is a common source of accidental
    // edits, so wheel stepping only applies once the user has deliberately
    // focused the field AND the consumer has opted in via handleWheel. Also
    // requires a step (see stepBy) — nothing to increment by otherwise.
    if (!handleWheel || !hasStep || !isFocused || isDisabled || isReadOnly) return
    event.preventDefault()
    stepBy(event.deltaY < 0 ? 1 : -1)
  }

  useEffect(() => {
    const node = inputElementRef.current
    if (!node) return
    function listener(event: globalThis.WheelEvent) {
      handleWheelRef.current(event)
    }
    node.addEventListener('wheel', listener, { passive: false })
    return () => node.removeEventListener('wheel', listener)
  }, [])

  // The -/+/. special-key branches below (sign toggle anywhere in the draft,
  // jump-to-existing-dot, dot-on-empty) are all designed around a plain
  // unformatted draft string. They're deliberately skipped when formatSpec
  // is set — the decorations formatWithSpec adds (currency symbol, group
  // separators, parens for negative currency, "%") don't have one universal
  // position/meaning to special-case correctly across every specifier, so
  // format falls through to plain native text editing plus the
  // reformatDraftLive pass in handleChange instead.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitDraft()
    } else if (event.key === 'Escape') {
      updateDraft(formattedValue)
    } else if (event.key === 'ArrowUp' && !isReadOnly && hasStep) {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown' && !isReadOnly && hasStep) {
      event.preventDefault()
      stepBy(-1)
    } else if (event.key === 'Backspace' && !isReadOnly && formatSpec) {
      const el = event.currentTarget
      const cursor = el.selectionStart
      // Negative currency wraps the whole value in parentheses instead of a
      // leading "-" (see formatCurrencySpec) — there's no single sign
      // character to delete, so Backspace-ing just one boundary paren would
      // leave unbalanced, unparseable content that reformatDraftLive rejects
      // outright, silently stranding the draft with no way to un-negate it.
      // Deleting right after the opening "(" or right at the very end (after
      // the closing ")") instead strips both parens together, restoring the
      // positive form in one step — same "treat it as a unit" approach as
      // the decimal-point handling right below.
      if (
        formatSpec.specifier === 'C' &&
        cursor !== null &&
        cursor === el.selectionEnd &&
        draft.startsWith('(') &&
        draft.endsWith(')') &&
        (cursor === 1 || cursor === draft.length)
      ) {
        event.preventDefault()
        const unwrapped = draft.slice(1, -1)
        if (exceedsBounds(parseFormattedInput(unwrapped, formatSpec))) return
        updateDraft(unwrapped)
        setCursor(cursor === 1 ? 0 : unwrapped.length)
        return
      }
      // Deleting the decimal point itself (not just a digit) would merge
      // the integer and fractional digit groups into one bigger integer
      // once reformatted (e.g. "1,999.00" -> delete "." -> "199900" ->
      // reformats to "$199,900.00") — a jarring, almost certainly
      // unintended jump. A collapsed cursor sitting right after the dot
      // instead just steps over it, same as the "." jump-to-dot handling
      // below; a second Backspace from there deletes the actual digit.
      if (cursor !== null && cursor === el.selectionEnd && draft[cursor - 1] === '.') {
        event.preventDefault()
        el.setSelectionRange(cursor - 1, cursor - 1)
      }
    } else if (event.key === '-' && !isReadOnly) {
      event.preventDefault()
      // min >= 0 means negatives aren't allowed at all — block the key
      // entirely rather than letting it toggle and get clamped away later.
      if (typeof min === 'number' && min >= 0) return
      const el = event.currentTarget
      if (el.selectionStart !== el.selectionEnd) {
        updateDraft('-')
        setCursor(1)
        return
      }
      const cursorPos = el.selectionStart ?? 0
      if (formatSpec) {
        // Toggling a zero value under Currency or Percent would produce
        // "($0)"/"-0%" — a negative zero that's numerically meaningless
        // (0 === -0) and, especially wrapped in parens, reads as a
        // strange, unhelpful transitional state. Start fresh with a bare
        // "-" instead, same as an empty draft: if the user commits
        // without typing an actual digit after it, commitDraft's
        // "-" -> null -> required-revert path already snaps it back to
        // the formatted zero on blur/Enter.
        const currentValue = parseFormattedInput(draft, formatSpec)
        const isZero =
          (formatSpec.specifier === 'C' || formatSpec.specifier === 'P') && currentValue === 0
        // Re-parses and reformats the whole value instead of flipping a
        // single "-" character — under a format, decorations (currency
        // parens, "$", "%", ...) mean there's no one universal cursor
        // position a literal "-" keystroke could be inserted at, so this
        // works as a toggle from anywhere in the draft instead, matching
        // the plain (non-format) behavior below.
        const result = isZero ? undefined : toggleFormattedSign(draft, cursorPos, formatSpec)
        if (!result) {
          // Draft isn't (yet) a complete number to toggle — e.g. still
          // empty, or (for currency) exactly zero. Start fresh with a
          // bare "-" instead, same as the selected-text case above.
          updateDraft('-')
          setCursor(1)
          return
        }
        if (exceedsBounds(result.value)) return
        updateDraft(result.text)
        setCursor(result.cursorIndex)
        return
      }
      // Setting `draft` via React state doesn't preserve cursor position
      // on its own (browsers tend to snap a programmatically-set value's
      // cursor to the end) — shift it by one character so it stays next
      // to the same digit it was next to before the sign was added/removed.
      const hadSign = draft.startsWith('-')
      const toggled = toggleSign(draft)
      if (exceedsBounds(parseDraft(toggled))) return
      updateDraft(toggled)
      setCursor(hadSign ? Math.max(0, cursorPos - 1) : cursorPos + 1)
    } else if (event.key === '+' && !isReadOnly) {
      event.preventDefault()
      const el = event.currentTarget
      const cursorPos = el.selectionStart ?? 0
      if (formatSpec) {
        const result = forcePositiveFormatted(draft, cursorPos, formatSpec)
        if (!result) return
        if (exceedsBounds(result.value)) return
        updateDraft(result.text)
        setCursor(result.cursorIndex)
        return
      }
      if (draft.startsWith('-')) {
        const stripped = stripSign(draft)
        if (exceedsBounds(parseDraft(stripped))) return
        updateDraft(stripped)
        setCursor(Math.max(0, cursorPos - 1))
      }
    } else if (event.key === '.' && !isReadOnly && !formatSpec) {
      const dotIndex = draft.indexOf('.')
      if (dotIndex !== -1) {
        // Already has a decimal point — jump the cursor there instead of
        // inserting a second one or clearing anything, even if some of the
        // draft is currently selected. No draft change happens here, so
        // there's no re-render to hang the usual pendingSelectionRef effect
        // off of — set the selection synchronously instead.
        event.preventDefault()
        event.currentTarget.setSelectionRange(dotIndex + 1, dotIndex + 1)
      } else if (effectivePrecision === 0) {
        // Integer-only (precision explicitly 0) — a decimal point is never
        // meaningful, so block it outright rather than letting it in and
        // rounding it away on commit.
        event.preventDefault()
      } else if (draft === '') {
        event.preventDefault()
        updateDraft(zeroDraftWithPrecision(effectivePrecision))
        setCursor(2)
      }
      // else: no existing dot, precision allows decimals, draft non-empty —
      // this is an ordinary decimal point insertion, handled by the normal
      // handleChange -> isValidDraft path same as any other digit.
    } else if (event.key === '.' && !isReadOnly && formatSpec) {
      // format's own decimal point is a decoration character too, and
      // formatWithSpec always includes it once any digits have been entered
      // for a specifier with nonzero precision — so the same "jump to the
      // existing dot instead of inserting a second one" rule applies here.
      // Letting a second "." through would get rejected by reformatDraftLive
      // as invalid (two decimal points), and that rejection's cursor
      // side-effect (snapping to the end) would corrupt every keystroke
      // typed after it.
      const dotIndex = draft.indexOf('.')
      event.preventDefault()
      if (dotIndex !== -1) {
        event.currentTarget.setSelectionRange(dotIndex + 1, dotIndex + 1)
      }
      // else: this format's precision is 0 (e.g. "p0", "D", "X") — no
      // decimal point is ever meaningful, so the keystroke is swallowed.
    }
  }

  return (
    <>
      <div
        className={`${wrapperBaseClassName} ${wrapperStateClassName(isDisabled, isReadOnly)} ${className ?? ''}`}
      >
        {hasStep && (
          <SpinButton
            ariaLabel="Decrease value"
            disabled={spinButtonsDisabled || atMin}
            onStart={() => startRepeat(-1)}
            onEnd={clearRepeat}
            onClick={() => handleSpinClick(-1)}
            borderSide="border-r"
            path="M2 6h8"
          />
        )}
        <input
          {...rest}
          ref={(node) => {
            inputElementRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          type="text"
          inputMode="decimal"
          disabled={isDisabled}
          readOnly={isReadOnly}
          required={isRequired}
          aria-describedby={describedBy}
          // ARIA spinbutton pattern (https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/)
          // — this control has increment/decrement affordances (spin
          // buttons, Arrow keys), so it's announced as a spinbutton rather
          // than a generic textbox. Tracks the live draft (see
          // draftNumericValue above), not just the last committed value, so
          // a screen reader announces whatever's currently on screen.
          role="spinbutton"
          aria-valuenow={typeof draftNumericValue === 'number' ? draftNumericValue : undefined}
          aria-valuetext={draft === '' ? undefined : draft}
          aria-valuemin={min}
          aria-valuemax={max}
          value={draft}
          onChange={handleChange}
          onFocus={(event) => {
            setIsFocused(true)
            // Formatted fields (currency, percent, ...) are usually edited
            // as a whole value rather than character-by-character —
            // selecting everything on focus lets the user just start
            // typing to replace it, instead of having to select-all
            // themselves first.
            if (formatSpec) event.currentTarget.select()
          }}
          onBlur={() => {
            setIsFocused(false)
            commitDraft()
          }}
          onKeyDown={handleKeyDown}
          className={inputClassName}
        />
        {hasStep && (
          <SpinButton
            ariaLabel="Increase value"
            disabled={spinButtonsDisabled || atMax}
            onStart={() => startRepeat(1)}
            onEnd={clearRepeat}
            onClick={() => handleSpinClick(1)}
            borderSide="border-l"
            path="M6 2v8M2 6h8"
          />
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </>
  )
})
