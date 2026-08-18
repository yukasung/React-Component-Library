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
      style={{ maxHeight }}
      className={listClassName}
    >
      {times.map((minutes, index) => {
        const isSelected = minutes === selectedMinutes
        return (
          <div
            key={minutes}
            id={`${id}-${index}`}
            role="option"
            aria-selected={isSelected}
            // Keeps focus in the text field: without this the mousedown blurs
            // the input, which commits the draft and can close the list before
            // the click that picks an entry ever lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(minutes)}
            className={optionClassName(isSelected, index === highlightedIndex)}
          >
            {labels[index]}
          </div>
        )
      })}
    </div>
  )
}
