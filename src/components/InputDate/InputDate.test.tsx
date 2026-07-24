import { createRef, StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    // The live-typing mask (see the "typed-digit masking" describe block
    // below) rejects non-digit characters for this numeric-only default
    // format, so "not a date" would never actually land in the draft at
    // all — an incomplete year is the realistic way to leave the field in
    // an unparseable state under masking.
    await user.type(input, '202')
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
    // selectAllOnFocus (src/lib/domSelection.ts) defers via a zero-delay
    // setTimeout -- required for WebKit/Safari, where a synchronous
    // .select() in the focus handler gets silently overwritten by the
    // browser's own native click-cursor-positioning (confirmed empirically,
    // not just reasoned about) -- so the selection isn't applied until that
    // timer fires.
    vi.useFakeTimers()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    const input = screen.getByRole('combobox') as HTMLInputElement

    input.focus()
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    vi.useRealTimers()
  })

  it('does not select on focus if the field is blurred before the deferred timer fires', () => {
    vi.useFakeTimers()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    const input = screen.getByRole('combobox') as HTMLInputElement

    input.focus()
    input.blur()
    act(() => {
      vi.advanceTimersByTime(0)
    })

    // No selection left behind on an unfocused field.
    expect(input.selectionStart).toBe(input.selectionEnd)
    vi.useRealTimers()
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

  describe('typed-digit masking', () => {
    function typeChar(input: HTMLInputElement, char: string) {
      fireEvent.change(input, { target: { value: input.value + char } })
    }

    it('auto-inserts the separator after completing a 4-digit year', () => {
      render(<InputDate defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      for (const digit of ['2', '0', '2', '6']) typeChar(input, digit)

      expect(input).toHaveValue('2026-')
      expect(input.selectionStart).toBe(5)
    })

    it('auto-advances a day leading digit 4-9 as a complete 1-digit value, past the trailing separator', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '4')

      expect(input).toHaveValue('4/')
      expect(input.selectionStart).toBe(2)
    })

    it('keeps a day leading digit 0-3 open, then completes on a valid 2nd digit', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '3')
      expect(input).toHaveValue('3')
      expect(input.selectionStart).toBe(1)

      typeChar(input, '1')
      expect(input).toHaveValue('31/')
      expect(input.selectionStart).toBe(3)
    })

    it('rejects a 2nd day digit that would exceed 31, leaving the draft and cursor unchanged', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '3')
      typeChar(input, '5')

      expect(input).toHaveValue('3')
      expect(input.selectionStart).toBe(1)
    })

    it('still commits correctly once a rejected digit is followed by a valid one', async () => {
      const onChange = vi.fn()
      render(<InputDate value={null} onChange={onChange} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '3')
      typeChar(input, '5') // rejected
      typeChar(input, '1') // "31" -- valid, auto-advances past "/"
      for (const digit of ['0', '7', '2', '0', '2', '6']) typeChar(input, digit)
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 31))
    })

    it('auto-advances a month leading digit 2-9 as a complete 1-digit value', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="m/d/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '2')

      expect(input).toHaveValue('2/')
      expect(input.selectionStart).toBe(2)
    })

    it('rejects a 2nd month digit that would exceed 12', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="m/d/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '1')
      typeChar(input, '3')

      expect(input).toHaveValue('1')
      expect(input.selectionStart).toBe(1)
    })

    it('force-advances an explicit early separator on a not-yet-full segment', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      // "1" alone stays open (day 10-19 is still a possible continuation),
      // unlike "4"-"9" which auto-advance immediately on their own.
      typeChar(input, '1')
      expect(input).toHaveValue('1')

      typeChar(input, '/')
      expect(input).toHaveValue('1/')
      expect(input.selectionStart).toBe(2)
    })

    it('places the cursor at the start of the next segment after a digit following an explicit separator', () => {
      // Regression case: "3" (day, force-advanced via an explicit "/") then
      // "2" (month, auto-advances on its own) — the "/" step's masked
      // result happens to textually equal what the browser already typed,
      // which previously caused the cursor correction for *that* step to
      // be skipped. Harmless on its own, but left the DOM's cursor
      // dependent on an assumption about the browser's own post-keystroke
      // placement that isn't guaranteed to hold across engines.
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '3')
      typeChar(input, '/')
      typeChar(input, '2')

      expect(input).toHaveValue('3/2/')
      expect(input.selectionStart).toBe(4)
    })

    describe('unpadded tokens (n/j)', () => {
      it('masks n/j identically to m/d while typing (no forced zero-padding)', () => {
        render(<InputDate defaultValue={null} isRequired={false} format="j/n/Y" />)
        const input = screen.getByRole('combobox') as HTMLInputElement

        typeChar(input, '5') // day 4-9 auto-advances as a complete 1-digit value
        expect(input).toHaveValue('5/')
        typeChar(input, '7') // month 2-9 auto-advances the same way
        expect(input).toHaveValue('5/7/')
      })

      it('requires an explicit separator to advance past an ambiguous leading digit, same as m/d', () => {
        render(<InputDate defaultValue={null} isRequired={false} format="j/n/Y" />)
        const input = screen.getByRole('combobox') as HTMLInputElement

        // "1" is genuinely ambiguous (could become "1" or continue to
        // "10"-"19") -- confirmed with the user that requiring an explicit
        // "/" (rather than an auto-advance timeout) is the intended
        // behavior here, matching the padded tokens exactly.
        typeChar(input, '1')
        expect(input).toHaveValue('1')

        typeChar(input, '/')
        expect(input).toHaveValue('1/')
      })

      it('combines two digits typed back-to-back into the same segment without an explicit separator', () => {
        render(<InputDate defaultValue={null} isRequired={false} format="j/n/Y" />)
        const input = screen.getByRole('combobox') as HTMLInputElement

        // Without an explicit "/" in between, "1" then "7" forms day "17",
        // not day "1" + month "7" -- this is what the explicit-separator
        // requirement above exists to disambiguate.
        typeChar(input, '1')
        typeChar(input, '7')
        expect(input).toHaveValue('17/')
      })

      it('commits and re-displays an unpadded value without leading zeros', async () => {
        const onChange = vi.fn()
        render(<InputDate value={null} onChange={onChange} isRequired={false} format="j/n/Y" />)
        const input = screen.getByRole('combobox') as HTMLInputElement

        typeChar(input, '5') // day, auto-advances
        typeChar(input, '7') // month, auto-advances
        for (const digit of ['2', '0', '2', '6']) typeChar(input, digit)
        fireEvent.blur(input)

        expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 5))
        expect(input).toHaveValue('5/7/2026')
      })
    })

    it('two-press Backspace steps over a separator before deleting the digit before it', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '4') // -> "4/"
      expect(input).toHaveValue('4/')
      input.setSelectionRange(2, 2)

      fireEvent.keyDown(input, { key: 'Backspace' })
      expect(input).toHaveValue('4/') // first press: value unchanged
      expect(input.selectionStart).toBe(1)

      fireEvent.keyDown(input, { key: 'Backspace' })
      fireEvent.change(input, { target: { value: '/' } })
      expect(input).toHaveValue('/')
    })

    it('Delete steps over a separator before deleting the digit after it', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      fireEvent.change(input, { target: { value: '31/07/2026' } })
      input.setSelectionRange(2, 2) // right before the first "/"

      fireEvent.keyDown(input, { key: 'Delete' })
      expect(input).toHaveValue('31/07/2026') // first press: value unchanged
      expect(input.selectionStart).toBe(3)

      fireEvent.keyDown(input, { key: 'Delete' })
      // Second press proceeds "natively" (no preventDefault) -- simulate
      // what a real forward-delete of the "0" in "07" would produce.
      fireEvent.change(input, { target: { value: '31/7/2026' } })
      expect(input).toHaveValue('31/7/2026')
    })

    it('rebuilds a full date from a single-event paste', () => {
      const onChange = vi.fn()
      render(<InputDate value={null} onChange={onChange} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      fireEvent.change(input, { target: { value: '22/07/2026' } })
      expect(input).toHaveValue('22/07/2026')
    })

    it('is a no-op for a format using alphabetic name tokens', async () => {
      const user = userEvent.setup()
      render(<InputDate defaultValue={null} isRequired={false} format="F j, Y" />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, 'not a real month 999')

      expect(input).toHaveValue('not a real month 999')
    })

    it('feeds the masked (not raw) string to onTextChange', () => {
      const onTextChange = vi.fn()
      render(<InputDate defaultValue={null} isRequired={false} onTextChange={onTextChange} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '4') // day "4" auto-advances to "4/"

      expect(onTextChange).toHaveBeenCalledWith('4/')
    })

    it('correctly masks a digit typed over the auto-selected today text on required-empty-snap', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      await user.clear(input) // isRequired (default) snaps to today's Y-m-d text, fully selected
      // Typing over a full selection replaces it entirely, not appends --
      // the whole selected text is "removed" in the same edit as "9" is
      // inserted (falls to the strip-and-rebuild path since the removal
      // spans every segment, not just the year's).
      fireEvent.change(input, { target: { value: '9' } })

      expect(input).toHaveValue('9')
    })

    it('masks a Buddhist Era year identically to a Gregorian one', () => {
      render(<InputDate defaultValue={null} isRequired={false} locale="th" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      for (const digit of ['2', '5', '6', '9']) typeChar(input, digit)

      expect(input).toHaveValue('2569-')
      expect(input.selectionStart).toBe(5)
    })
  })

  describe('pending-advance timeout (ambiguous digits)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('auto-advances an ambiguous digit after the delay with no further typing', () => {
      vi.useFakeTimers()
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '1' } })
      expect(input).toHaveValue('1') // still open, awaiting a possible 2nd digit

      act(() => {
        vi.advanceTimersByTime(1200)
      })

      expect(input).toHaveValue('1/')
      expect(input.selectionStart).toBe(2)
    })

    it('a keystroke within the delay window cancels and reschedules it', () => {
      vi.useFakeTimers()
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '1' } })
      act(() => {
        vi.advanceTimersByTime(300) // well within the 1200ms window
      })
      fireEvent.change(input, { target: { value: '12' } }) // completes day as "12"

      expect(input).toHaveValue('12/')

      // The original timeout must not have survived to fire on top of this.
      act(() => {
        vi.advanceTimersByTime(1200)
      })
      expect(input).toHaveValue('12/')
    })

    it('does not apply to a not-yet-complete year segment', () => {
      vi.useFakeTimers()
      render(<InputDate defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '202' } }) // 3 of 4 year digits
      act(() => {
        vi.advanceTimersByTime(1200)
      })

      // Year has no "ambiguous, could stop here" state -- still incomplete,
      // untouched by the timeout.
      expect(input).toHaveValue('202')
    })

    it('does not schedule an advance for a single-digit segment the cursor has already moved past', () => {
      // Regression for the reported cursor-jump bug: with format j/n/Y,
      // day "3" force-advanced (via its own timeout) to "3/", then month
      // "3" auto-advances to "3/3/" with the cursor at 4 (in the year). The
      // day "3" is still a 1-digit "open-looking" segment, but the cursor
      // is past it -- an earlier global open-segment scan scheduled a
      // spurious advance here that fired after the delay and yanked the
      // cursor back to 2. It must stay at 4.
      vi.useFakeTimers()
      render(<InputDate defaultValue={null} isRequired={false} format="j/n/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '3' } }) // day, ambiguous
      act(() => {
        vi.advanceTimersByTime(1200) // day auto-advances to "3/"
      })
      expect(input).toHaveValue('3/')

      fireEvent.change(input, { target: { value: '3/3' } }) // month "3" auto-advances
      expect(input).toHaveValue('3/3/')
      expect(input.selectionStart).toBe(4)

      act(() => {
        vi.advanceTimersByTime(1200) // no stale timeout may fire and move the cursor
      })
      expect(input).toHaveValue('3/3/')
      expect(input.selectionStart).toBe(4)
    })

    it('clears the pending timeout on blur so it cannot fire afterward', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} format="d/m/Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '1' } }) // ambiguous, schedules a pending advance
      fireEvent.blur(input) // commitDraft() cancels it
      const callsAfterBlur = onChange.mock.calls.length

      act(() => {
        vi.advanceTimersByTime(1200)
      })

      // The cancelled timeout must not still fire and mutate the
      // already-blurred field's draft out from under it later.
      expect(onChange.mock.calls.length).toBe(callsAfterBlur)
    })

    it('clears the pending timeout on Escape so it cannot fire afterward', () => {
      vi.useFakeTimers()
      render(<InputDate defaultValue={new Date(2026, 6, 15)} isRequired={false} format="d-m-Y" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.focus()

      fireEvent.change(input, { target: { value: '1' } }) // ambiguous day digit, schedules a pending advance
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input).toHaveValue('15-07-2026') // reverted to the formatted committed value

      act(() => {
        vi.advanceTimersByTime(1200)
      })

      // The cancelled timeout must not overwrite the just-reverted draft.
      expect(input).toHaveValue('15-07-2026')
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
