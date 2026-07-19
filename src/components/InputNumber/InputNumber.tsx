import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, KeyboardEvent } from 'react'
import { useSyncedState } from '../../hooks/useSyncedState'
import {
  applyPrecision,
  clamp,
  formatValue,
  isValidDraft,
  parseDraft,
  resolvePrecision,
  stripSign,
  toggleSign,
} from '../../lib/number'

export interface InputNumberProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step'
  > {
  value?: number | null
  defaultValue?: number | null
  onChange?: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  precision?: number
  showSpinButtons?: boolean
  repeatButtons?: boolean
  handleWheel?: boolean
  truncate?: boolean
  hint?: string
}

const REPEAT_INITIAL_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 80

const baseClassName =
  'h-11 w-full rounded-lg border border-gray-300 bg-transparent py-2 pl-3 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-3 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30'

const disabledClassName =
  'disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-40 dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-400'

const readOnlyClassName =
  'read-only:cursor-default read-only:bg-gray-50 dark:read-only:bg-gray-800/60'

const spinButtonClassName =
  'flex h-1/2 w-6 items-center justify-center text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-500 dark:hover:text-gray-300 dark:disabled:text-gray-700'

export const InputNumber = forwardRef<HTMLInputElement, InputNumberProps>(function InputNumber(
  {
    value,
    defaultValue = null,
    onChange,
    min,
    max,
    step = 1,
    precision,
    disabled = false,
    readOnly = false,
    required = false,
    showSpinButtons = true,
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
  const effectivePrecision = precision ?? resolvePrecision(step)
  const formattedValue = formatValue(committedValue, effectivePrecision)
  const [draft, setDraft] = useSyncedState(formattedValue)
  const atMax = typeof max === 'number' && committedValue !== null && committedValue >= max
  const atMin = typeof min === 'number' && committedValue !== null && committedValue <= min
  const spinButtonsDisabled = disabled || readOnly
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
  // Set right before a setDraft call that needs the cursor placed somewhere
  // specific afterward (e.g. right after a lone "-") — setting draft via
  // React state doesn't reliably control where the browser leaves the
  // cursor, so this makes it explicit.
  const pendingSelectionRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingSelectionRef.current !== null && inputElementRef.current) {
      const pos = pendingSelectionRef.current
      inputElementRef.current.setSelectionRange(pos, pos)
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
    setDraft(formatValue(next, effectivePrecision))
  }

  function commitDraft() {
    if (readOnly) return
    const parsed = parseDraft(draft)
    if (parsed === undefined || (required && parsed === null)) {
      setDraft(formattedValue)
      return
    }
    commit(
      parsed === null ? null : applyPrecision(clamp(parsed, min, max), effectivePrecision, truncate),
    )
  }

  function stepBy(direction: 1 | -1) {
    const base = parseDraft(draft) ?? committedValue ?? min ?? 0
    const next = applyPrecision(clamp(base + direction * step, min, max), effectivePrecision, truncate)
    commit(next)
  }

  function startRepeat(direction: 1 | -1) {
    if (!repeatButtons) return
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
        const next = applyPrecision(clamp(base + direction * step, min, max), effectivePrecision, truncate)
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

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    if (isValidDraft(next)) setDraft(next)
  }

  handleWheelRef.current = (event) => {
    // Opt-in and focus-gated: an unfocused field silently changing value
    // because the page scrolled past it is a common source of accidental
    // edits, so wheel stepping only applies once the user has deliberately
    // focused the field AND the consumer has opted in via handleWheel.
    if (!handleWheel || !isFocused || disabled || readOnly) return
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

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      commitDraft()
    } else if (event.key === 'Escape') {
      setDraft(formattedValue)
    } else if (event.key === 'ArrowUp' && !readOnly) {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown' && !readOnly) {
      event.preventDefault()
      stepBy(-1)
    } else if (event.key === '-' && !readOnly) {
      event.preventDefault()
      // min >= 0 means negatives aren't allowed at all — block the key
      // entirely rather than letting it toggle and get clamped away later.
      if (typeof min === 'number' && min >= 0) return
      const el = event.currentTarget
      if (el.selectionStart !== el.selectionEnd) {
        setDraft('-')
        pendingSelectionRef.current = 1
      } else {
        // Setting `draft` via React state doesn't preserve cursor position
        // on its own (browsers tend to snap a programmatically-set value's
        // cursor to the end) — shift it by one character so it stays next
        // to the same digit it was next to before the sign was added/removed.
        const cursorPos = el.selectionStart ?? 0
        const hadSign = draft.startsWith('-')
        setDraft(toggleSign(draft))
        pendingSelectionRef.current = hadSign
          ? Math.max(0, cursorPos - 1)
          : cursorPos + 1
      }
    } else if (event.key === '+' && !readOnly) {
      event.preventDefault()
      if (draft.startsWith('-')) {
        const el = event.currentTarget
        const cursorPos = el.selectionStart ?? 0
        setDraft(stripSign(draft))
        pendingSelectionRef.current = Math.max(0, cursorPos - 1)
      }
    }
  }

  return (
    <>
      <div className="relative">
        <input
          {...rest}
          ref={(node) => {
            inputElementRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-describedby={describedBy}
          value={draft}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            commitDraft()
          }}
          onKeyDown={handleKeyDown}
          className={`${baseClassName} ${showSpinButtons ? 'pr-8' : 'pr-3'} ${disabledClassName} ${readOnlyClassName} ${className ?? ''}`}
        />
        {showSpinButtons && (
          <div className="absolute inset-y-0 right-1 flex flex-col py-1">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Increase value"
              disabled={spinButtonsDisabled || atMax}
              onMouseDown={(event) => {
                event.preventDefault()
                startRepeat(1)
              }}
              onMouseUp={clearRepeat}
              onMouseLeave={clearRepeat}
              onClick={() => handleSpinClick(1)}
              className={spinButtonClassName}
            >
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                <path d="M2 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Decrease value"
              disabled={spinButtonsDisabled || atMin}
              onMouseDown={(event) => {
                event.preventDefault()
                startRepeat(-1)
              }}
              onMouseUp={clearRepeat}
              onMouseLeave={clearRepeat}
              onClick={() => handleSpinClick(-1)}
              className={spinButtonClassName}
            >
              <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden="true">
                <path d="M2 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
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
