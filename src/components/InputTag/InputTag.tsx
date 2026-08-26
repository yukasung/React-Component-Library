import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, CloseIcon } from './icons'

type MenuPosition = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly maxHeight: number
}

export interface InputTagProps {
  id?: string
  ariaLabel: string
  options: readonly string[]
  value?: readonly string[]
  defaultValue?: readonly string[]
  onChange?: (value: readonly string[]) => void
  placeholder?: string
  isDisabled?: boolean
  portal?: boolean
  className?: string
  removeLabel: (tag: string) => string
  addCustomTag?: {
    ariaLabel: string
    placeholder: string
  }
}

const VIEWPORT_INSET = 16
const MENU_GAP = 8
const MIN_MENU_WIDTH = 224
const MAX_MENU_HEIGHT = 240

export function InputTag({
  id,
  ariaLabel,
  options,
  value,
  defaultValue = [],
  onChange,
  placeholder = 'Select options',
  isDisabled = false,
  portal = false,
  className = '',
  removeLabel,
  addCustomTag,
}: InputTagProps) {
  const generatedId = useId()
  const controlId = id ?? `input-tag-${generatedId.replace(/:/g, '')}`
  const listboxId = `${controlId}-options`
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState<readonly string[]>(defaultValue)
  const selectedValue = isControlled ? value : internalValue
  const selectedValueKey = selectedValue.join('\u0000')
  const [customTag, setCustomTag] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const menuIsOpen = isOpen && !isDisabled

  const updateValue = (nextValue: readonly string[]) => {
    if (isDisabled) return
    if (!isControlled) setInternalValue(nextValue)
    onChange?.(nextValue)
  }

  const tagsMatch = (first: string, second: string) =>
    first.localeCompare(second, undefined, { sensitivity: 'accent' }) === 0

  const openMenu = () => {
    const selectedIndex = options.findIndex((option) =>
      selectedValue.some((tag) => tagsMatch(tag, option)),
    )
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setIsOpen(true)
  }

  const updateMenuPosition = useCallback(() => {
    if (!portal) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const triggerRect = trigger.getBoundingClientRect()
    const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_INSET * 2)
    const width = Math.min(
      Math.max(triggerRect.width, MIN_MENU_WIDTH),
      availableWidth,
    )
    const left = Math.min(
      Math.max(triggerRect.left, VIEWPORT_INSET),
      Math.max(VIEWPORT_INSET, window.innerWidth - VIEWPORT_INSET - width),
    )
    const spaceBelow = Math.max(
      0,
      window.innerHeight - triggerRect.bottom - VIEWPORT_INSET - MENU_GAP,
    )
    const spaceAbove = Math.max(
      0,
      triggerRect.top - VIEWPORT_INSET - MENU_GAP,
    )
    const naturalHeight = Math.min(menu.scrollHeight, MAX_MENU_HEIGHT)
    const opensAbove = spaceBelow < naturalHeight && spaceAbove > spaceBelow
    const maxHeight = Math.min(
      MAX_MENU_HEIGHT,
      opensAbove ? spaceAbove : spaceBelow,
    )
    const renderedHeight = Math.min(menu.scrollHeight, maxHeight)

    setMenuPosition({
      left,
      top: opensAbove
        ? triggerRect.top - MENU_GAP - renderedHeight
        : triggerRect.bottom + MENU_GAP,
      width,
      maxHeight,
    })
  }, [portal])

  useLayoutEffect(() => {
    if (!menuIsOpen) {
      setMenuPosition(null)
      return
    }
    updateMenuPosition()
  }, [menuIsOpen, options.length, selectedValueKey, updateMenuPosition])

  useLayoutEffect(() => {
    if (!menuIsOpen) return
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, menuIsOpen])

  useEffect(() => {
    if (isDisabled) setIsOpen(false)
  }, [isDisabled])

  useEffect(() => {
    if (!menuIsOpen) return

    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape, true)
    if (portal) {
      document.addEventListener('scroll', updateMenuPosition, true)
      window.addEventListener('resize', updateMenuPosition)
    }

    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape, true)
      document.removeEventListener('scroll', updateMenuPosition, true)
      window.removeEventListener('resize', updateMenuPosition)
    }
  }, [menuIsOpen, portal, updateMenuPosition])

  const toggle = (tag: string) => {
    if (isDisabled) return
    const selectedIndex = selectedValue.findIndex((item) => tagsMatch(item, tag))
    updateValue(selectedIndex >= 0
      ? selectedValue.filter((_, index) => index !== selectedIndex)
      : [...selectedValue, tag])
  }

  const addTag = () => {
    const tag = customTag.trim()
    const matchingOption = options.find((option) => tagsMatch(option, tag))
    const nextTag = matchingOption ?? tag
    const isDuplicate = selectedValue.some(
      (item) => tagsMatch(item, nextTag),
    )
    if (!tag || isDuplicate) return

    updateValue([...selectedValue, nextTag])
    setCustomTag('')
  }

  const menu = menuIsOpen ? (
    <div
      ref={menuRef}
      onPointerDown={(event) => event.stopPropagation()}
      className={
        portal
          ? 'rc-input-tag__menu rc-input-tag__menu--portal fixed z-50 overflow-y-auto rounded-lg bg-white shadow-sm dark:bg-gray-900'
          : 'rc-input-tag__menu rc-input-tag__menu--inline absolute left-0 top-full z-40 w-full max-h-select overflow-y-auto rounded-lg bg-white shadow-sm dark:bg-gray-900'
      }
      style={
        portal
          ? {
              left: menuPosition?.left,
              top: menuPosition?.top,
              width: menuPosition?.width,
              maxHeight: menuPosition?.maxHeight,
              visibility: menuPosition ? 'visible' : 'hidden',
            }
          : undefined
      }
    >
      {addCustomTag ? (
        <input
          type="text"
          aria-label={addCustomTag.ariaLabel}
          placeholder={addCustomTag.placeholder}
          value={customTag}
          onChange={(event) => setCustomTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addTag()
            }
          }}
          className="rc-input-tag__custom-input m-2 h-10 w-[calc(100%-1rem)] rounded-md border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs outline-hidden placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
        />
      ) : null}
      <div
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
        aria-multiselectable="true"
      >
        {options.map((option, index) => (
          <button
            key={option}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            id={`${listboxId}-option-${index}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={selectedValue.some((tag) => tagsMatch(tag, option))}
            onPointerMove={() => setActiveIndex(index)}
            onClick={() => toggle(option)}
            className={`rc-input-tag__option w-full cursor-pointer rounded-t border-b border-gray-200 text-left dark:border-gray-800 ${activeIndex === index ? 'rc-input-tag__option--active' : ''}`}
          >
            <span className="rc-input-tag__option-label relative flex w-full p-2 pl-2 text-sm leading-6 text-gray-800 dark:text-white/90">
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>
  ) : null

  return (
    <div ref={rootRef} className="rc-input-tag relative z-20 inline-block w-full">
      <div className="rc-input-tag__layout relative flex flex-col items-center">
        <div
          ref={triggerRef}
          id={controlId}
          role="combobox"
          tabIndex={isDisabled ? -1 : 0}
          aria-controls={listboxId}
          aria-expanded={menuIsOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-disabled={isDisabled}
          aria-activedescendant={menuIsOpen && options[activeIndex]
            ? `${listboxId}-option-${activeIndex}`
            : undefined}
          onClick={() => {
            if (isDisabled) return
            if (menuIsOpen) setIsOpen(false)
            else openMenu()
          }}
          onKeyDown={(event) => {
            if (isDisabled) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!menuIsOpen) {
                openMenu()
                return
              }
              if (options.length === 0) return
              const offset = event.key === 'ArrowDown' ? 1 : -1
              setActiveIndex((current) =>
                (current + offset + options.length) % options.length)
              return
            }
            if (menuIsOpen && (event.key === 'Home' || event.key === 'End')) {
              event.preventDefault()
              setActiveIndex(event.key === 'Home' ? 0 : Math.max(0, options.length - 1))
              return
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!menuIsOpen) openMenu()
              else if (options[activeIndex]) toggle(options[activeIndex])
            }
          }}
          className="rc-input-tag__combobox w-full"
        >
          <div
            className={`rc-input-tag__surface mb-2 flex min-h-11 w-full rounded-lg border border-gray-300 bg-transparent py-1.5 pl-3 pr-3 text-left shadow-theme-xs outline-hidden transition focus:border-brand-300 focus:shadow-focus-ring dark:border-gray-700 dark:bg-gray-900 dark:focus:border-brand-300 ${isDisabled ? 'rc-input-tag__surface--disabled cursor-not-allowed bg-gray-50 opacity-50 dark:bg-gray-800' : 'cursor-pointer'} ${className}`}
          >
            <div className="rc-input-tag__values flex flex-auto flex-wrap gap-2">
              {selectedValue.length > 0 ? (
                selectedValue.map((tag) => (
                  <div
                    key={tag}
                    className="rc-input-tag__chip group flex items-center justify-center rounded-full border-[0.7px] border-transparent bg-gray-100 py-1 pl-2.5 pr-2 text-sm text-gray-800 hover:border-gray-200 dark:bg-gray-800 dark:text-white/90 dark:hover:border-gray-800"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={removeLabel(tag)}
                      disabled={isDisabled}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(tag)
                      }}
                      className="rc-input-tag__remove cursor-pointer pl-2 text-gray-500 group-hover:text-gray-400 disabled:cursor-not-allowed dark:text-gray-400"
                    >
                      <CloseIcon className="rc-input-tag__remove-icon size-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rc-input-tag__placeholder pointer-events-none h-full w-full p-1 pr-2 text-sm text-gray-400 dark:text-gray-500">
                  {placeholder}
                </div>
              )}
            </div>
            <div className="rc-input-tag__chevron-wrap flex w-7 items-center self-start py-1 pl-1 pr-1">
              <span
                aria-hidden="true"
                className="rc-input-tag__chevron-button size-5 text-gray-700 dark:text-gray-400"
              >
                <ChevronDownIcon
                  className={`rc-input-tag__chevron-icon size-5 transition-transform ${menuIsOpen ? 'rc-input-tag__chevron-icon--open rotate-180' : ''}`}
                />
              </span>
            </div>
          </div>
        </div>
      </div>
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  )
}
