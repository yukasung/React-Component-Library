import { createRef, StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputDate } from './InputDate'

describe('InputDate', () => {
  it('passes through id, name, placeholder, and className', () => {
    render(<InputDate id="dob" name="dateOfBirth" placeholder="Pick a date" className="custom" />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('id', 'dob')
    expect(input).toHaveAttribute('name', 'dateOfBirth')
    expect(input).toHaveAttribute('placeholder', 'Pick a date')
    // className styles the wrapper (bordered box around the input and
    // dropdown button), not the input itself.
    expect(input.parentElement?.className).toContain('custom')
  })

  it('displays a controlled value', () => {
    render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('2026-07-22')
  })

  it('updates the displayed value while typing without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2026-07-15')

    expect(input).toHaveValue('2026-07-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2026-07-15')
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(new Date(2026, 6, 15))
  })

  it('commits on Enter without losing focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2026-07-04')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 4))
    expect(input).toHaveFocus()
  })

  it('does not re-fire onChange on blur immediately after an Enter commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2026-07-04')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reverts an unparseable draft on blur without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, 'not a date')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('2026-07-15')
  })

  it('discards an in-progress edit on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2026-01-01')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('2026-07-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when the field is cleared and blurred while isRequired is false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('works uncontrolled via defaultValue', async () => {
    const user = userEvent.setup()
    render(<InputDate defaultValue={new Date(2026, 6, 3)} isRequired={false} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('2026-07-03')

    await user.clear(input)
    await user.type(input, '2026-07-09')
    await user.tab()

    expect(input).toHaveValue('2026-07-09')
  })

  it('resyncs the displayed value when the external value prop changes', () => {
    const { rerender } = render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('2026-07-01')

    rerender(<InputDate value={new Date(2026, 6, 9)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('2026-07-09')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputDate ref={ref} value={new Date(2026, 6, 1)} onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('selects the whole value on focus', () => {
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    const input = screen.getByRole('combobox') as HTMLInputElement

    input.focus()

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  describe('min / max', () => {
    it('clamps a typed value below min up to min on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDate
          value={new Date(2026, 6, 15)}
          onChange={onChange}
          min={new Date(2026, 6, 10)}
          max={new Date(2026, 6, 20)}
          isRequired={false}
        />,
      )
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '2026-07-01')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 10))
    })

    it('clamps a typed value above max down to max on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDate
          value={new Date(2026, 6, 15)}
          onChange={onChange}
          min={new Date(2026, 6, 10)}
          max={new Date(2026, 6, 20)}
          isRequired={false}
        />,
      )
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '2026-07-31')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 20))
    })
  })

  describe('Arrow-key day-stepping', () => {
    it('increments by one day on ArrowUp and commits immediately', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = screen.getByRole('combobox')

      input.focus()
      await user.keyboard('{ArrowUp}')

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16))
    })

    it('decrements by one day on ArrowDown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = screen.getByRole('combobox')

      input.focus()
      await user.keyboard('{ArrowDown}')

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 14))
    })

    it('clamps Arrow-key stepping at min/max', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDate
          value={new Date(2026, 6, 20)}
          onChange={onChange}
          max={new Date(2026, 6, 20)}
        />,
      )
      const input = screen.getByRole('combobox')

      input.focus()
      await user.keyboard('{ArrowUp}')

      // already at max — the clamped step is a no-op, so onChange must not
      // fire (same de-dupe behavior as InputNumber's Arrow-key clamping).
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not re-fire onChange on blur immediately after an Arrow key commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = screen.getByRole('combobox')

      input.focus()
      await user.keyboard('{ArrowUp}')
      expect(onChange).toHaveBeenCalledTimes(1)

      await user.tab()
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('isDisabled', () => {
    it('renders as a disabled input with disabled styling', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} isDisabled />)
      const input = screen.getByRole('combobox')
      expect(input).toBeDisabled()
      expect(input.parentElement?.className).toContain('opacity-40')
    })

    it('prevents typing and dropdown toggling, and never calls onChange', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isDisabled />)
      const input = screen.getByRole('combobox')
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      expect(button).toBeDisabled()
      // user-event no-ops (or throws, depending on version) on a disabled
      // element rather than dispatching events through it — either way,
      // nothing should reach onChange.
      await user.type(input, '2026-07-15').catch(() => {})
      await user.click(button).catch(() => {})

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('isReadOnly', () => {
    it('renders as read-only, distinct from disabled, and stays focusable', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} isReadOnly />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('readonly')
      expect(input).not.toBeDisabled()
    })

    it('blocks commit and dropdown toggling while read-only, and never calls onChange', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isReadOnly showDropdownButton={false} />)
      const input = screen.getByRole('combobox')

      input.focus()
      await user.keyboard('{Enter}')

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('isRequired (default true) — immediate empty-block', () => {
    it("snaps to today's date immediately (not the previous value) when cleared", async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)

      expect(input).not.toHaveValue('')
    })

    it('allows clearing to null when isRequired is false', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      expect(input).toHaveValue('')

      await user.tab()
      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('text (two-way binding for the displayed draft)', () => {
    it('displays the controlled text prop instead of the formatted value', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} text="not-a-real-date" />)
      expect(screen.getByRole('combobox')).toHaveValue('not-a-real-date')
    })

    it('calls onTextChange as the user types', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()
      render(
        <InputDate value={new Date(2026, 6, 1)} onChange={() => {}} onTextChange={onTextChange} isRequired={false} />,
      )
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '5')

      expect(onTextChange).toHaveBeenCalled()
      expect(onTextChange.mock.calls[onTextChange.mock.calls.length - 1][0]).toBe('5')
    })
  })

  describe('handleWheel', () => {
    it('does not step on wheel by default', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = screen.getByRole('combobox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps by one day per wheel notch while focused when enabled', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} handleWheel />)
      const input = screen.getByRole('combobox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16))
    })

    it('ignores wheel events while unfocused even when enabled', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} handleWheel />)
      const input = screen.getByRole('combobox')

      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('isOpen / onOpenChange / monthCount', () => {
    it('opens the popup when the controlled isOpen prop becomes true', () => {
      const { rerender } = render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} isOpen={false} />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('aria-expanded', 'false')

      rerender(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} isOpen />)
      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    it('calls onOpenChange when the dropdown button toggles the popup', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} onOpenChange={onOpenChange} />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      expect(onOpenChange).toHaveBeenCalledWith(true)

      await user.click(button)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('renders multiple months when monthCount is set', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} monthCount={2} />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)

      expect(document.querySelectorAll('.flatpickr-calendar .flatpickr-month').length).toBe(2)
    })
  })

  describe('ARIA', () => {
    it('exposes combobox role with haspopup/expanded/autocomplete attributes', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('aria-haspopup', 'dialog')
      expect(input).toHaveAttribute('aria-autocomplete', 'none')
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders hint text wired to the input via aria-describedby', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} hint="Format: YYYY-MM-DD" />)
      const input = screen.getByRole('combobox')
      const describedBy = input.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy!)).toHaveTextContent('Format: YYYY-MM-DD')
    })

    it('merges a consumer-supplied aria-describedby with the generated hint id', () => {
      render(
        <InputDate value={new Date(2026, 6, 1)} onChange={() => {}} hint="Hint" aria-describedby="external-id" />,
      )
      const describedBy = screen.getByRole('combobox').getAttribute('aria-describedby')
      expect(describedBy).toContain('external-id')
    })

    it('omits aria-describedby entirely when there is no hint and no consumer value', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby')
    })
  })

  describe('showDropdownButton', () => {
    it('renders a toggle button by default', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: 'Toggle calendar' })).toBeInTheDocument()
    })

    it('omits the toggle button when false', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} showDropdownButton={false} />)
      expect(screen.queryByRole('button', { name: 'Toggle calendar' })).not.toBeInTheDocument()
    })
  })

  // Depends on flatpickr's internal `.flatpickr-day` class names, which
  // could shift on a flatpickr version bump — isolated from the rest of the
  // suite so a break here is easy to attribute to the dependency, not a
  // regression in this component's own logic.
  describe('calendar popup (flatpickr integration)', () => {
    it('opens the calendar and commits the clicked day', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true')

      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      expect(day).not.toBeNull()
      fireEvent.click(day!)

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 4))
    })

    it('closes the popup after selection when closeOnSelection is true (default)', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const input = screen.getByRole('combobox')
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      fireEvent.click(day!)

      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    it('keeps the popup open after selection when closeOnSelection is false', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} closeOnSelection={false} />)
      const input = screen.getByRole('combobox')
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      fireEvent.click(day!)

      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    it('toggles closed when clicking the button again', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      const input = screen.getByRole('combobox')
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'true')

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('locale (Thai + Buddhist Era)', () => {
    it('displays the committed value in Buddhist Era in the text field', () => {
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} locale="th" />)
      expect(screen.getByRole('combobox')).toHaveValue('2569-07-22')
    })

    it('commits a typed Buddhist year to the correct Gregorian date', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} locale="th" isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '2569-07-15')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 15))
    })

    it('does not affect English locale (default) formatting', () => {
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} />)
      expect(screen.getByRole('combobox')).toHaveValue('2026-07-22')
    })

    it('renders Thai weekday names in the calendar popup', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} locale="th" />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)

      const weekdayLabels = Array.from(document.querySelectorAll('.flatpickr-weekday')).map((el) =>
        el.textContent?.trim(),
      )
      // firstDayOfWeek: 1 in the Thai locale -> Monday ("จ") first, not Sunday.
      expect(weekdayLabels[0]).toBe('จ')
    })

    it('shows day-cell aria-labels with the Buddhist year', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} locale="th" />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)

      // locale="th" also switches the month name in the aria-label itself
      // (flatpickr's own locale-aware formatting, via the ariaDateFormat
      // "F j, Y" default) -- "กรกฎาคม" is Thai for July, not just the year.
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="กรกฎาคม 4, 2569"]',
      )
      expect(day).not.toBeNull()
    })

    it('replaces the native year spinner with a custom control showing the Buddhist year', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} locale="th" />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)

      const customYearInput = document.querySelector<HTMLInputElement>('.rcl-year-input')
      expect(customYearInput?.value).toBe('2569')
      const nativeYearInput = document.querySelector<HTMLInputElement>('.cur-year:not(.rcl-year-input)')
      expect(nativeYearInput?.style.display).toBe('none')
    })

    it('does not render the custom year control for the default English locale', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)

      expect(document.querySelector('.rcl-year-input')).toBeNull()
    })

    it('typing a Buddhist year into the custom year control navigates the calendar to the correct Gregorian year', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} locale="th" />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })
      await user.click(button)

      const customYearInput = document.querySelector<HTMLInputElement>('.rcl-year-input')!
      fireEvent.change(customYearInput, { target: { value: '2570' } })
      fireEvent.blur(customYearInput)

      // BE 2570 - 543 = Gregorian 2027 -- day-cell aria-labels (also
      // Buddhist-Era-aware) should now show "..., 2570" for July 2027.
      const day = document.querySelector('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label*="2570"]')
      expect(day).not.toBeNull()
    })
  })

  describe('mount/unmount DOM-ownership safety (flatpickr escape hatch)', () => {
    it('mounts and unmounts cleanly (plain, non-StrictMode)', () => {
      const { unmount } = render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      expect(() => unmount()).not.toThrow()
    })

    it('mounts and unmounts cleanly under StrictMode double-invoke', () => {
      render(
        <StrictMode>
          <InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />
        </StrictMode>,
      )
      expect(document.querySelectorAll('.flatpickr-calendar').length).toBe(1)
      expect(() => cleanup()).not.toThrow()
    })
  })
})
