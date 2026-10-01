import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import type { AriaAttributes, FocusEventHandler, InputHTMLAttributes, ReactNode } from 'react'
import { afterInputEvent, composeInputEvent } from '../../lib/inputEvents'
import { filterOptions, selectAllState } from '../../lib/optionList'
import type { MultiSelectOption } from '../../lib/optionList'
import { OptionPopup } from './OptionPopup'
import { OptionRow } from './OptionRow'
import { ChevronDownIcon } from './icons'
import {
  chevronClasses,
  chevronOpenClasses,
  dropdownButtonClasses,
  fieldClasses,
  filterInputClasses,
  listboxClasses,
  rootClasses,
  selectAllCheckboxClasses,
  selectAllClasses,
  surfaceClasses,
} from './styles'
import { useMultiSelectField } from './useMultiSelectField'
import { useOptionDropdown } from './useOptionDropdown'
import type { FocusStop } from './useOptionDropdown'

export type { MultiSelectOption }

export interface MultiSelectProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'type'
    | 'required'
    | 'readOnly'
    | 'disabled'
    | 'role'
    | 'onBlur'
    | 'onFocus'
  > {
  options: readonly MultiSelectOption[]

  // Option values, in `options` order. A value matching no option is preserved
  // rather than dropped — `options` arriving after `value` is ordinary, and
  // filtering it away would destroy data on first render.
  value?: readonly string[]
  defaultValue?: readonly string[]
  onChange?: (value: readonly string[]) => void

  // Focus crossing the whole control's boundary, popup included — not each
  // internal move between the field and the popup's stops. Declared rather
  // than inherited because an exit from the listbox is a FocusEvent on an
  // element that is not the <input>.
  onFocus?: FocusEventHandler<HTMLElement>
  onBlur?: FocusEventHandler<HTMLElement>

  // Used when more than `maxHeaderItems` are checked; `{count}` is substituted.
  // Only the literal token is matched, so a culture-formatted `{count:n0}`
  // copied from elsewhere stays visible instead of silently losing the count.
  headerFormat?: string
  // Replaces the derived header entirely, the empty case included. Returns a
  // string, not a ReactNode: the header is the value of an <input>.
  headerFormatter?: (checked: readonly MultiSelectOption[]) => string
  maxHeaderItems?: number

  showFilterInput?: boolean
  filterInputPlaceholder?: string
  caseSensitiveSearch?: boolean
  // The reference API defaults this to true, which makes *typing* commit values
  // the user never checked and fires onChange per keystroke. Inverted here, and
  // when on it commits only a filter change that **narrows** the match set — a
  // union, never a removal.
  checkOnFilter?: boolean
  customFilter?: (option: MultiSelectOption, filterText: string) => boolean

  showSelectAllCheckbox?: boolean
  selectAllLabel?: string

  // Announces required state only; the consuming form validates the array.
  // The native `required` attribute is refused: the field is readOnly, which
  // bars it from constraint validation, so it would be inert rather than wrong.
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean

  showDropdownButton?: boolean
  maxDropdownHeight?: number
  portal?: boolean
  portalZIndex?: number

  dropdownAriaLabel?: string
  // Names the role="dialog" popup, which ARIA requires. Defaults to the field's
  // own aria-label when one was given, else 'Options'. A field labelled by a
  // native <label for> cannot be read by this component, so that consumer sets
  // this explicitly to get a matching name.
  popupAriaLabel?: string
  optionsAriaLabel?: string
  dropdownIcon?: ReactNode
  checkedIcon?: ReactNode

  // Declared explicitly: the field is a combobox built from an <input>, and a
  // component that redefines its roles should not leave these to passthrough.
  'aria-invalid'?: AriaAttributes['aria-invalid']
  'aria-describedby'?: string
  'aria-errormessage'?: string
  'aria-labelledby'?: string
}

// A single character, and only when no modifier claims it: `Ctrl`/`Cmd`+`A` is
// select-all, not the letter `a`, and feeding it to the filter would both open
// the popup and type a character the user never meant.
const PRINTABLE = /^.$/u

function isTypedCharacter(event: React.KeyboardEvent): boolean {
  return (
    PRINTABLE.test(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey
  )
}

export const MultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(function MultiSelect(
  {
    options,
    value,
    defaultValue = [],
    onChange,
    onFocus,
    onBlur,
    headerFormat = '{count} items selected',
    headerFormatter,
    maxHeaderItems = 2,
    showFilterInput = false,
    filterInputPlaceholder = 'Filter',
    caseSensitiveSearch = false,
    checkOnFilter = false,
    customFilter,
    showSelectAllCheckbox = false,
    selectAllLabel = 'Select All',
    isRequired = false,
    isReadOnly = false,
    isDisabled = false,
    showDropdownButton = true,
    maxDropdownHeight = 240,
    portal = false,
    // Left undefined on purpose; resolved from --rc-z-popup, then from
    // DEFAULT_POPUP_Z_INDEX. See lib/layering.ts.
    portalZIndex,
    dropdownAriaLabel = 'Toggle options',
    popupAriaLabel,
    optionsAriaLabel = 'Options',
    dropdownIcon,
    checkedIcon,
    className = '',
    name,
    'aria-label': ariaLabel,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    'aria-errormessage': ariaErrorMessage,
    'aria-labelledby': ariaLabelledBy,
    ...rest
  },
  forwardedRef,
) {
  const generatedId = useId().replace(/:/g, '')
  const popupId = `rc-ms-${generatedId}-popup`
  const listId = `rc-ms-${generatedId}-list`

  const field = useMultiSelectField({
    options,
    value,
    defaultValue,
    onChange,
    isDisabled,
    isReadOnly,
    headerFormat,
    headerFormatter,
    maxHeaderItems,
  })

  // After the field hook, which de-duplicates `options`: the dropdown filters
  // the canonical list, not the raw prop.
  const dropdown = useOptionDropdown({
    options: field.allOptions,
    caseSensitiveSearch,
    customFilter,
    hasFilterInput: showFilterInput,
    hasSelectAll: showSelectAllCheckbox,
    isDisabled,
    isReadOnly,
  })

  const visible = dropdown.visible
  const allState = selectAllState(visible, field.selected)
  const selectAllUnavailable = visible.length === 0

  const [focusedStop, setFocusedStop] = useState<FocusStop | 'field' | null>(null)
  const fieldWrapRef = useRef<HTMLDivElement | null>(null)

  const toggleAt = (index: number) => {
    const option = visible[index]
    if (option) field.toggle(option)
  }

  const activateSelectAll = () => {
    if (selectAllUnavailable) return
    field.selectAll(visible, allState)
  }

  // Gate 1 of checkOnFilter is this call site — the user editing the filter
  // input. `dropdown.close()`'s clear never reaches here, which is what keeps a
  // close from committing anything. Gate 2 is the field hook's.
  const applyFilterText = (text: string) => {
    if (checkOnFilter) {
      const next = filterOptions(field.allOptions, text, { caseSensitiveSearch, customFilter })
      field.unionIfNarrowed(next, dropdown.renderedMatches())
    }
    dropdown.editFilter(text)
  }

  const openWith = (index: number) => {
    dropdown.open()
    dropdown.setActiveIndex(index)
  }

  const closeToField = () => {
    dropdown.close()
    dropdown.fieldRef.current?.focus()
  }

  // Focus moves into the popup whenever it is open and focus is not already
  // inside it: a dialog popup requires DOM focus inside, and
  // aria-activedescendant is only valid on the focused element.
  useEffect(() => {
    if (!dropdown.isOpen) return
    const first = dropdown.focusStops()[0]
    if (!first) return
    if (focusedStop === null || focusedStop === 'field') dropdown.focusStop(first)
    // dropdown identity changes every render; the open transition is what this
    // effect is for, and re-running it while focus is already inside is a no-op
    // by the guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdown.isOpen])

  const moveTab = (from: FocusStop, direction: 1 | -1) => {
    const next = direction === 1 ? dropdown.nextStop(from) : dropdown.previousStop(from)
    if (next) dropdown.focusStop(next)
    else closeToField()
  }

  const stopFromTarget = (target: EventTarget | null): FocusStop | 'field' | null => {
    if (!(target instanceof Node)) return null
    if (target === dropdown.fieldRef.current) return 'field'
    if (target === dropdown.filterRef.current) return 'filter'
    if (target === dropdown.selectAllRef.current) return 'selectAll'
    if (target === dropdown.listboxRef.current) return 'listbox'
    return dropdown.popupRef.current?.contains(target) ? 'listbox' : null
  }

  const activeOptionId = dropdown.activeIndex >= 0 ? `${listId}-${dropdown.activeIndex}` : undefined

  // One handler per focus stop. Which keys each one owns is the whole point of
  // the split: the filter input is a text field, so Space, Home/End and Ctrl+A
  // keep their text meaning there and Enter is the only selection gesture.
  const closesOn = (key: string, altKey: boolean) =>
    key === 'Escape' || (altKey && key === 'ArrowUp')

  const fieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDisabled || isReadOnly) return
    // No `closesOn` here: a closed field has nothing to close. Alt+ArrowDown
    // reaches the ArrowDown branch below, which is what R4.2 asks for.
    const { key } = event
    if (key === 'ArrowDown') {
      event.preventDefault()
      openWith(0)
      return
    }
    if (key === 'ArrowUp') {
      event.preventDefault()
      openWith(Math.max(0, visible.length - 1))
      return
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      openWith(0)
      return
    }
    if (showFilterInput && isTypedCharacter(event)) {
      event.preventDefault()
      applyFilterText(key)
      openWith(0)
    }
  }

  const filterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, altKey } = event
    if (closesOn(key, altKey)) {
      event.preventDefault()
      closeToField()
      return
    }
    if (key === 'Tab') {
      event.preventDefault()
      moveTab('filter', event.shiftKey ? -1 : 1)
      return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      dropdown.move(key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      toggleAt(dropdown.activeIndex)
    }
    // Everything else — printable characters, Space, Home/End, arrows left and
    // right, Backspace/Delete, Ctrl+A — is left to the text field. Space here
    // must insert a space, not toggle a row.
  }

  const selectAllKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const { key, altKey } = event
    if (closesOn(key, altKey)) {
      event.preventDefault()
      closeToField()
      return
    }
    // Enter only. Space already activates a native checkbox by synthesising a
    // click, which reaches onChange — handling it here too would toggle twice.
    if (key === 'Enter') {
      event.preventDefault()
      activateSelectAll()
      return
    }
    if (key === 'Tab') {
      event.preventDefault()
      moveTab('selectAll', event.shiftKey ? -1 : 1)
      return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      dropdown.setActiveIndex(key === 'ArrowDown' ? 0 : Math.max(0, visible.length - 1))
      dropdown.focusStop('listbox')
    }
  }

  const listKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key, altKey } = event
    if (closesOn(key, altKey)) {
      event.preventDefault()
      closeToField()
      return
    }
    if (key === 'Tab') {
      event.preventDefault()
      moveTab('listbox', event.shiftKey ? -1 : 1)
      return
    }
    if (key === 'ArrowDown') {
      event.preventDefault()
      dropdown.move(1)
      return
    }
    if (key === 'ArrowUp') {
      event.preventDefault()
      // The one break in clamping: at the first row, hand focus upward to
      // select-all when there is one. A focus transfer, not a move — the active
      // row stays where it is, so ArrowDown comes back to it.
      if (!dropdown.move(-1) && dropdown.focusStops().includes('selectAll')) {
        dropdown.focusStop('selectAll')
      }
      return
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault()
      if (visible.length === 0) return
      dropdown.setActiveIndex(key === 'Home' ? 0 : visible.length - 1)
      return
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      toggleAt(dropdown.activeIndex)
      return
    }
    if (showFilterInput && isTypedCharacter(event)) {
      event.preventDefault()
      applyFilterText(dropdown.filterText + key)
      dropdown.focusStop('filter')
    }
  }

  return (
    <div
      ref={dropdown.rootRef}
      className={`${rootClasses} ${className}`}
      onFocus={afterInputEvent(
        (event: React.FocusEvent<HTMLDivElement>) => {
          setFocusedStop(stopFromTarget(event.target))
        },
        // Boundary test before the consumer callback: entering the control is
        // reported, moving between the field and a popup stop is not.
        //
        // The test is "were we already focused", not leavesControl: on a focus
        // event relatedTarget is the element *losing* focus and is routinely
        // null, so treating null as outside — which is right for blur, where it
        // means focus went nowhere — would report an entry on every internal
        // move. The tracked stop answers it without relying on relatedTarget.
        (event) => {
          if (focusedStop === null) onFocus?.(event)
        },
      )}
      onBlur={afterInputEvent(
        (event: React.FocusEvent<HTMLDivElement>) => {
          if (dropdown.leavesControl(event.relatedTarget)) setFocusedStop(null)
        },
        (event) => {
          if (dropdown.leavesControl(event.relatedTarget)) onBlur?.(event)
        },
      )}
    >
      {name !== undefined &&
        field.selected.map((item) => (
          <input key={item} type="hidden" name={name} value={item} disabled={isDisabled} />
        ))}

      <div
        ref={fieldWrapRef}
        className={surfaceClasses({ isDisabled, isReadOnly, isFocused: focusedStop !== null })}
      >
        <input
          {...rest}
          ref={(node) => {
            dropdown.fieldRef.current = node
            if (typeof forwardedRef === 'function') forwardedRef(node)
            else if (forwardedRef) forwardedRef.current = node
          }}
          type="text"
          readOnly
          disabled={isDisabled}
          role="combobox"
          value={field.header}
          aria-expanded={dropdown.isOpen}
          aria-haspopup="dialog"
          aria-controls={dropdown.isOpen ? popupId : undefined}
          aria-autocomplete="none"
          aria-required={isRequired}
          aria-readonly={isReadOnly}
          aria-disabled={isDisabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-errormessage={ariaErrorMessage}
          aria-labelledby={ariaLabelledBy}
          className={fieldClasses({ isDisabled, isReadOnly })}
          onKeyDown={composeInputEvent(rest.onKeyDown, fieldKeyDown)}
          onClick={composeInputEvent(rest.onClick, () => dropdown.toggle())}
          onChange={() => {
            // The field is readOnly and its value is derived; nothing the
            // browser does to it is a value change. Present so React does not
            // warn about a controlled input without a handler.
          }}
        />
        {showDropdownButton && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={dropdownAriaLabel}
            disabled={isDisabled}
            className={dropdownButtonClasses}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (isDisabled || isReadOnly) return
              if (dropdown.isOpen) closeToField()
              else openWith(0)
            }}
          >
            {dropdownIcon ?? (
              <ChevronDownIcon
                className={`${chevronClasses} ${dropdown.isOpen ? chevronOpenClasses : ''}`}
              />
            )}
          </button>
        )}
      </div>

      {dropdown.isOpen && (
        <OptionPopup
          anchorRef={fieldWrapRef}
          popupRef={dropdown.popupRef}
          listRef={dropdown.listboxRef}
          maxListHeight={maxDropdownHeight}
          portal={portal}
          portalZIndex={portalZIndex}
          id={popupId}
          role="dialog"
          aria-label={popupAriaLabel ?? ariaLabel ?? 'Options'}
        >
          {showFilterInput && (
            <input
              ref={dropdown.filterRef}
              type="text"
              value={dropdown.filterText}
              placeholder={filterInputPlaceholder}
              aria-label={filterInputPlaceholder}
              aria-controls={listId}
              aria-activedescendant={focusedStop === 'filter' ? activeOptionId : undefined}
              className={filterInputClasses}
              onChange={(event) => applyFilterText(event.target.value)}
              onKeyDown={filterKeyDown}
            />
          )}

          {showSelectAllCheckbox && (
            <label className={selectAllClasses(selectAllUnavailable)}>
              <input
                ref={(node) => {
                  dropdown.selectAllRef.current = node
                  // indeterminate is a DOM property, not an attribute, so it
                  // has to be written to the node.
                  if (node) node.indeterminate = allState === 'mixed'
                }}
                type="checkbox"
                checked={allState === 'checked'}
                // aria-disabled rather than the native attribute: a natively
                // disabled control leaves the accessibility tree and the focus
                // order, so a keyboard user could not discover select-all
                // exists — and the popup's focus invariant would break.
                aria-disabled={selectAllUnavailable}
                aria-checked={allState === 'mixed' ? 'mixed' : allState === 'checked'}
                className={selectAllCheckboxClasses}
                onChange={activateSelectAll}
                onKeyDown={selectAllKeyDown}
              />
              {selectAllLabel}
            </label>
          )}

          <div
            ref={dropdown.listboxRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-multiselectable="true"
            aria-label={optionsAriaLabel}
            aria-activedescendant={focusedStop === 'listbox' ? activeOptionId : undefined}
            style={{ maxHeight: maxDropdownHeight }}
            className={listboxClasses}
            onKeyDown={listKeyDown}
          >
            {visible.map((option, index) => (
              <OptionRow
                key={option.value}
                id={`${listId}-${index}`}
                option={option}
                isSelected={field.selected.includes(option.value)}
                isActive={dropdown.activeIndex === index}
                checkedIcon={checkedIcon}
                onToggle={() => {
                  dropdown.setActiveIndex(index)
                  dropdown.focusStop('listbox')
                  toggleAt(index)
                }}
                onActivate={() => dropdown.setActiveIndex(index)}
              />
            ))}
          </div>
        </OptionPopup>
      )}
    </div>
  )
})
