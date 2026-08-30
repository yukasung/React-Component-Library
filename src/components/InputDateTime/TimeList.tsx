import type { RefObject } from 'react'
import { listClassName, optionClassName } from './styles'

// The time half of the field's two popups, as ordinary React markup (only the
// calendar needs the DOM-ownership escape hatch). Purely presentational: the
// open state, the highlight and the click-away all live in useTimeDropdown,
// and picking an entry is the field's business, not this list's.
export interface TimeListProps {
  id: string
  listRef: RefObject<HTMLDivElement | null>
  ariaLabel: string
  maxHeight: number
  times: number[]
  labels: string[]
  disabled: boolean[]
  // Minutes of the committed value, or null — which entry reads as selected.
  selectedMinutes: number | null
  highlightedIndex: number
  onPick: (minutes: number) => void
}

export function TimeList({
  id,
  listRef,
  ariaLabel,
  maxHeight,
  times,
  labels,
  disabled,
  selectedMinutes,
  highlightedIndex,
  onPick,
}: TimeListProps) {
  return (
    <div
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      style={{ maxHeight, minWidth: '100%', width: '100%' }}
      className={listClassName}
    >
      {times.map((minutes, index) => {
        const isDisabled = disabled[index] ?? false
        const isSelected = !isDisabled && minutes === selectedMinutes
        return (
          <div
            key={minutes}
            id={`${id}-${index}`}
            role="option"
            aria-selected={isSelected}
            aria-disabled={isDisabled || undefined}
            style={isSelected ? { backgroundColor: 'var(--rc-color-primary, #465fff)', color: 'white' } : undefined}
            // Keeps focus in the text field: without this the mousedown blurs
            // the input, which commits the draft and can close the list before
            // the click that picks an entry ever lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!isDisabled) onPick(minutes)
            }}
            className={optionClassName(isSelected, index === highlightedIndex, isDisabled)}
          >
            {labels[index]}
          </div>
        )
      })}
    </div>
  )
}
