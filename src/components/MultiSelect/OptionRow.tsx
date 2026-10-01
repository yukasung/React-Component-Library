import type { ReactNode } from 'react'
import type { MultiSelectOption } from '../../lib/optionList'
import { CheckIcon } from './icons'
import {
  checkIconClasses,
  optionCheckClasses,
  optionLabelClasses,
  optionRowClasses,
} from './styles'

// One row of the option list. Purely rendered — it owns no state and makes no
// decisions; `isActive` and `isSelected` are told to it.

interface OptionRowProps {
  id: string
  option: MultiSelectOption
  isSelected: boolean
  isActive: boolean
  checkedIcon?: ReactNode
  onToggle: () => void
  // Pointer movement makes a row active without selecting it, so hovering and
  // Arrow keys agree about where the user is.
  onActivate: () => void
}

export function OptionRow({
  id,
  option,
  isSelected,
  isActive,
  checkedIcon,
  onToggle,
  onActivate,
}: OptionRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      className={optionRowClasses(isActive)}
      // Keep focus on the listbox: a mousedown on the row would otherwise move
      // it and break aria-activedescendant's "focus owns the active descendant"
      // requirement.
      onMouseDown={(event) => event.preventDefault()}
      onPointerMove={onActivate}
      onClick={onToggle}
    >
      {/* The checkbox is decorative: the row's own aria-selected is what carries
          the state, so announcing a second control here would double it. */}
      <span aria-hidden="true" className={optionCheckClasses(isSelected)}>
        {isSelected ? (checkedIcon ?? <CheckIcon className={checkIconClasses} />) : null}
      </span>
      <span className={optionLabelClasses}>{option.label}</span>
    </div>
  )
}
