import { createRef, StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputTime } from './InputTime'

// A fixed reference day for every test that cares about the date part
// surviving a time commit.
const DAY = new Date(2026, 6, 22, 9, 0)

function at(hours: number, minutes = 0): Date {
  return new Date(2026, 6, 22, hours, minutes)
}

describe('InputTime', () => {
  it('passes through id, name, placeholder, and className', () => {
    render(<InputTime id="start" name="startTime" placeholder="Pick a time" className="custom" />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('id', 'start')
    expect(input).toHaveAttribute('name', 'startTime')
    expect(input).toHaveAttribute('placeholder', 'Pick a time')
    // className styles the wrapper (bordered box around the input and
    // dropdown button), not the input itself.
    expect(input.parentElement?.className).toContain('custom')
  })

  it('displays a controlled value', () => {
    render(<InputTime value={at(14, 30)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('14:30')
  })

  it('updates the displayed value while typing without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '1015')

    expect(input).toHaveValue('10:15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '1015')
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(at(10, 15))
  })

  it('commits on Enter without losing focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '0745')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(at(7, 45))
    expect(input).toHaveFocus()
  })

  it('does not re-fire onChange on blur immediately after an Enter commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime defaultValue={at(9)} onChange={onChange} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '0745')
    await user.keyboard('{Enter}')
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reverts an unparseable draft on blur without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '9')
    await user.tab()

    // "9" alone isn't a complete H:i time.
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('09:00')
  })

  it('discards an in-progress edit on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await user.type(input, '2233')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('09:00')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when the field is cleared and blurred while isRequired is false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)

    await user.clear(screen.getByRole('combobox'))
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('works uncontrolled via defaultValue', async () => {
    const user = userEvent.setup()
    render(<InputTime defaultValue={at(9)} isRequired={false} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('09:00')

    await user.clear(input)
    await user.type(input, '1830')
    await user.tab()

    expect(input).toHaveValue('18:30')
  })

  it('resyncs the displayed value when the external value prop changes', () => {
    const { rerender } = render(<InputTime value={at(9)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('09:00')

    rerender(<InputTime value={at(21, 5)} onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toHaveValue('21:05')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputTime ref={ref} defaultValue={at(9)} />)
    expect(ref.current).toBe(screen.getByRole('combobox'))
  })

  describe('value: date part', () => {
    it('keeps the year/month/day of the existing value when committing a time', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={DAY} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '1645')
      await user.tab()

      const committed = onChange.mock.calls[0][0] as Date
      expect(committed.getFullYear()).toBe(2026)
      expect(committed.getMonth()).toBe(6)
      expect(committed.getDate()).toBe(22)
      expect(committed.getHours()).toBe(16)
      expect(committed.getMinutes()).toBe(45)
    })

    it('ignores the date part of the value when displaying the time', () => {
      render(<InputTime value={new Date(1999, 0, 1, 8, 15)} onChange={() => {}} />)
      expect(screen.getByRole('combobox')).toHaveValue('08:15')
    })

    it('drops seconds and milliseconds from a committed value', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={new Date(2026, 6, 22, 9, 0, 45, 500)} onChange={onChange} isRequired={false} />)

      await user.clear(screen.getByRole('combobox'))
      await user.type(screen.getByRole('combobox'), '1000')
      await user.tab()

      const committed = onChange.mock.calls[0][0] as Date
      expect(committed.getSeconds()).toBe(0)
      expect(committed.getMilliseconds()).toBe(0)
    })
  })

  describe('format', () => {
    it('renders a 12-hour format with an AM/PM designator', () => {
      render(<InputTime value={at(14, 30)} onChange={() => {}} format="h:i K" />)
      expect(screen.getByRole('combobox')).toHaveValue('2:30 PM')
    })

    it('commits a typed 12-hour time to the right hour of the day', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} format="h:i K" isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '230p')
      await user.tab()

      expect(onChange.mock.calls[0][0]).toEqual(at(14, 30))
    })

    it('falls back to H:i for a format naming an unsupported token', () => {
      // Seconds are out of scope; falling back keeps the control usable
      // instead of rendering an empty or wrong value.
      render(<InputTime value={at(14, 30)} onChange={() => {}} format="H:i:S" />)
      expect(screen.getByRole('combobox')).toHaveValue('14:30')
    })

    it('falls back to H:i for a 24-hour format that also asks for AM/PM', () => {
      // "14:30 PM" isn't a time, so the designator is refused rather than
      // rendered and then silently dropped on the way back in.
      render(<InputTime value={at(14, 30)} onChange={() => {}} format="H:i K" />)
      expect(screen.getByRole('combobox')).toHaveValue('14:30')
    })

    it('does not commit a 24-hour time pasted with a designator', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} format="h:i K" />)
      const input = screen.getByRole('combobox')

      // The mask blocks typing "14" into a 12-hour field, but a paste
      // rebuilds without per-segment range checks — commit is where it's
      // caught, and the draft reverts rather than committing a wrong time.
      fireEvent.change(input, { target: { value: '14:30 PM' } })
      expect(input).toHaveValue('14:30 PM')

      fireEvent.blur(input)
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('9:00 AM')
    })
  })

  describe('min / max', () => {
    it('clamps a typed value below min up to min on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(12)} onChange={onChange} min={at(9)} max={at(17)} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '0730')
      await user.tab()

      expect(onChange.mock.calls[0][0]).toEqual(at(9))
    })

    it('clamps a typed value above max down to max on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(12)} onChange={onChange} min={at(9)} max={at(17)} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.type(input, '2300')
      await user.tab()

      expect(onChange.mock.calls[0][0]).toEqual(at(17))
    })

    it('limits the dropdown entries to the range', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      const options = screen.getAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual(['09:00', '09:30', '10:00'])
    })
  })

  describe('step (dropdown, Arrow keys, wheel)', () => {
    it('spaces the dropdown entries by step minutes', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={15} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getAllByRole('option')).toHaveLength(5)
    })

    it('lists a full day at the default step when min/max are unset', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getAllByRole('option')).toHaveLength(96)
    })

    it('hides the dropdown button entirely when step is null', () => {
      render(<InputTime defaultValue={at(9)} step={null} />)
      expect(screen.queryByRole('button', { name: 'Toggle time list' })).toBeNull()
    })

    it('makes Arrow keys inert when step is null', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={null} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowUp}')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps to the next entry on ArrowUp and commits immediately', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={30} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowUp}')

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('steps to the previous entry on ArrowDown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={30} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowDown}')

      expect(onChange.mock.calls[0][0]).toEqual(at(8, 30))
    })

    it('snaps an off-grid value onto the list rather than adding raw minutes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9, 10)} onChange={onChange} step={30} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowUp}')

      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('stops stepping at the ends of the range', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(17)} onChange={onChange} min={at(9)} max={at(17)} step={30} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{ArrowUp}')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not step on wheel by default', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={30} />)
      const input = screen.getByRole('combobox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -1 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps one entry per wheel notch while focused when enabled', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={30} handleWheel />)
      const input = screen.getByRole('combobox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -1 })

      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('ignores wheel events while unfocused even when enabled', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} step={30} handleWheel />)

      fireEvent.wheel(screen.getByRole('combobox'), { deltaY: -1 })

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('dropdown', () => {
    it('commits the clicked entry', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={DAY} onChange={onChange} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.click(screen.getByRole('option', { name: '09:30' }))

      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('closes after selection by default', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.click(screen.getByRole('option', { name: '09:30' }))

      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('stays open after selection when closeOnSelection is false', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} closeOnSelection={false} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.click(screen.getByRole('option', { name: '09:30' }))

      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('toggles closed when clicking the button again', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)
      const button = screen.getByRole('button', { name: 'Toggle time list' })

      await user.click(button)
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.click(button)
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('closes when clicking outside the control', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />
          <button type="button">elsewhere</button>
        </div>,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.click(screen.getByRole('button', { name: 'elsewhere' }))

      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('browses the list with Arrow keys without committing, then commits on Enter', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={DAY} onChange={onChange} min={at(9)} max={at(11)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.keyboard('{ArrowDown}{ArrowDown}')
      expect(onChange).not.toHaveBeenCalled()

      await user.keyboard('{Enter}')
      expect(onChange.mock.calls[0][0]).toEqual(at(10))
    })

    it('closes on Escape without reverting the value', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('listbox')).toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('opens and closes with Alt+Arrow', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('combobox'))
      await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('opens when the controlled isOpen prop becomes true', () => {
      const { rerender } = render(<InputTime defaultValue={at(9)} isOpen={false} onOpenChange={() => {}} />)
      expect(screen.queryByRole('listbox')).toBeNull()

      rerender(<InputTime defaultValue={at(9)} isOpen onOpenChange={() => {}} />)
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('calls onOpenChange when the dropdown button toggles the list', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()
      render(<InputTime defaultValue={at(9)} onOpenChange={onOpenChange} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(onOpenChange).toHaveBeenLastCalledWith(true)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(onOpenChange).toHaveBeenLastCalledWith(false)
    })

    it('marks the entry matching the value as selected', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9, 30)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getByRole('option', { name: '09:30' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('option', { name: '09:00' })).toHaveAttribute('aria-selected', 'false')
    })

    it('highlights the nearest entry when the value is off-grid', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      // 09:07 with a 30-minute step matches no entry at all.
      render(<InputTime value={at(9, 7)} onChange={onChange} min={at(9)} max={at(11)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.keyboard('{Enter}')

      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('applies maxDropdownHeight to the list', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} maxDropdownHeight={120} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getByRole('listbox')).toHaveStyle({ maxHeight: '120px' })
    })

    it('labels the entries with the control format', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} format="h:i K" min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        '9:00 AM',
        '9:30 AM',
        '10:00 AM',
      ])
    })
  })

  describe('isRequired (default true) — immediate empty-block', () => {
    it('snaps to a time immediately when cleared, rather than staying blank', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      await user.clear(input)

      expect(input.value).toMatch(/^\d{2}:\d{2}$/)
      expect(input.value).not.toBe('')
    })

    it('allows clearing to null when isRequired is false', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)

      expect(input).toHaveValue('')
    })
  })

  describe('isEditable', () => {
    it('blocks typing but still allows picking from the dropdown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={DAY} onChange={onChange} isEditable={false} min={at(9)} max={at(10)} step={30} />)
      const input = screen.getByRole('combobox')

      await user.type(input, '1234')
      expect(input).toHaveValue('09:00')
      expect(onChange).not.toHaveBeenCalled()

      // Clicking a non-editable field opens the list (its only input
      // method) — the click userEvent.type made above already did, so this
      // just makes the state the assertion depends on explicit.
      await user.click(input)
      await user.click(screen.getByRole('option', { name: '09:30' }))
      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('still steps with Arrow keys', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} isEditable={false} step={30} />)
      const input = screen.getByRole('combobox')

      // Focused without a click on purpose: clicking a non-editable field
      // opens the list, and an Arrow with the list open browses it instead
      // of stepping (covered separately).
      fireEvent.focus(input)
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange.mock.calls[0][0]).toEqual(at(9, 30))
    })

    it('opens the list when the field itself is clicked', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} isEditable={false} />)

      await user.click(screen.getByRole('combobox'))

      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('does not carry the read-only wrapper styling', () => {
      render(<InputTime defaultValue={at(9)} isEditable={false} />)
      expect(screen.getByRole('combobox').parentElement?.className).not.toContain('bg-gray-50')
    })
  })

  describe('isDisabled / isReadOnly', () => {
    it('renders as a disabled input with disabled styling', () => {
      render(<InputTime defaultValue={at(9)} isDisabled />)
      const input = screen.getByRole('combobox')
      expect(input).toBeDisabled()
      expect(input.parentElement?.className).toContain('bg-gray-100')
    })

    it('prevents typing and dropdown toggling while disabled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} isDisabled />)

      await user.type(screen.getByRole('combobox'), '1234')
      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('renders as read-only, distinct from disabled, and stays focusable', () => {
      render(<InputTime defaultValue={at(9)} isReadOnly />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('readonly')
      expect(input).not.toBeDisabled()
      expect(input.parentElement?.className).toContain('bg-gray-50')
    })

    it('blocks every commit path while read-only', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} isReadOnly step={30} />)
      const input = screen.getByRole('combobox')

      await user.click(input)
      await user.keyboard('{ArrowUp}')
      await user.tab()

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('listbox')).toBeNull()
    })
  })

  describe('text (two-way binding for the displayed draft)', () => {
    it('displays the controlled text prop instead of the formatted value', () => {
      render(<InputTime value={at(9)} onChange={() => {}} text="anything" onTextChange={() => {}} />)
      expect(screen.getByRole('combobox')).toHaveValue('anything')
    })

    it('calls onTextChange with the masked (not raw) string as the user types', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()

      function Harness() {
        const [text, setText] = useState('')
        return (
          <InputTime
            isRequired={false}
            text={text}
            onTextChange={(next) => {
              setText(next)
              onTextChange(next)
            }}
          />
        )
      }
      render(<Harness />)

      await user.type(screen.getByRole('combobox'), '09')

      expect(onTextChange).toHaveBeenLastCalledWith('09:')
    })
  })

  describe('ARIA', () => {
    it('exposes the combobox/listbox relationship', () => {
      render(<InputTime defaultValue={at(9)} />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('aria-haspopup', 'listbox')
      expect(input).toHaveAttribute('aria-expanded', 'false')
      expect(input).toHaveAttribute('aria-autocomplete', 'none')
    })

    it('points aria-activedescendant at the highlighted entry while open', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.keyboard('{ArrowDown}')

      const activeId = screen.getByRole('combobox').getAttribute('aria-activedescendant')
      expect(screen.getByRole('option', { name: '09:30' })).toHaveAttribute('id', activeId)
    })

    it('renders hint text wired to the input via aria-describedby', () => {
      render(<InputTime defaultValue={at(9)} hint="Office hours only" />)
      const input = screen.getByRole('combobox')
      const hintId = input.getAttribute('aria-describedby')
      expect(hintId).toBeTruthy()
      expect(document.getElementById(hintId!)).toHaveTextContent('Office hours only')
    })

    it('merges a consumer-supplied aria-describedby with the generated hint id', () => {
      render(<InputTime defaultValue={at(9)} hint="Office hours only" aria-describedby="external" />)
      expect(screen.getByRole('combobox').getAttribute('aria-describedby')).toMatch(/^external /)
    })

    it('omits aria-describedby entirely when there is no hint and no consumer value', () => {
      render(<InputTime defaultValue={at(9)} />)
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby')
    })
  })

  describe('showDropdownButton', () => {
    it('renders a toggle button by default', () => {
      render(<InputTime defaultValue={at(9)} />)
      expect(screen.getByRole('button', { name: 'Toggle time list' })).toBeInTheDocument()
    })

    it('omits the toggle button when false', () => {
      render(<InputTime defaultValue={at(9)} showDropdownButton={false} />)
      expect(screen.queryByRole('button', { name: 'Toggle time list' })).toBeNull()
    })
  })

  describe('typed-digit masking', () => {
    function typeChar(input: HTMLInputElement, char: string) {
      fireEvent.change(input, { target: { value: input.value + char } })
    }

    it('auto-inserts the separator after an unambiguous hour digit', () => {
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '9')

      expect(input).toHaveValue('9:')
      expect(input.selectionStart).toBe(2)
    })

    it('keeps an ambiguous hour digit open, then completes on a valid 2nd digit', () => {
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '1')
      expect(input).toHaveValue('1')

      typeChar(input, '4')
      expect(input).toHaveValue('14:')
      expect(input.selectionStart).toBe(3)
    })

    it('rejects a 2nd hour digit that would exceed 23', () => {
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      typeChar(input, '2')
      typeChar(input, '5')

      expect(input).toHaveValue('2')
    })

    it('rejects a minute digit that would exceed 59', () => {
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      for (const digit of ['0', '9', '5', '9']) typeChar(input, digit)
      expect(input).toHaveValue('09:59')

      // Overtyping the "5" with a "6" would make 69 minutes.
      fireEvent.change(input, { target: { value: '09:69' } })
      expect(input).toHaveValue('09:59')
    })

    it('writes the whole AM/PM designator from a single letter', () => {
      render(<InputTime defaultValue={null} isRequired={false} format="h:i K" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      for (const char of ['2', '3', '0', 'p']) typeChar(input, char)

      expect(input).toHaveValue('2:30 PM')
    })

    it('two-press Backspace steps over a separator before deleting the digit before it', () => {
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      input.setSelectionRange(3, 3)

      fireEvent.keyDown(input, { key: 'Backspace' })
      expect(input).toHaveValue('09:30')
      expect(input.selectionStart).toBe(2)
    })

    it('rebuilds a full time from a single-event paste', () => {
      render(<InputTime defaultValue={null} isRequired={false} format="h:i K" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      fireEvent.change(input, { target: { value: '9:30 PM' } })

      expect(input).toHaveValue('9:30 PM')
    })

    it('masks a digit typed over the auto-selected snap text on required-empty', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      await user.clear(input)
      // clear() snaps to the fallback time with everything selected; typing
      // one digit must restart the mask rather than append to the snapped
      // value. Like InputDate's equivalent case, the removal spans every
      // segment, so this takes the strip-and-rebuild path — which fills
      // segments without applying the per-digit completion rule, leaving
      // the hour open for a second digit (or for the pending-advance
      // timeout) rather than auto-advancing on the spot.
      fireEvent.change(input, { target: { value: '7' } })

      expect(input).toHaveValue('7')
    })
  })

  describe('pending-advance timeout (ambiguous digits)', () => {
    afterEach(() => {
      vi.useRealTimers()
      cleanup()
    })

    it('auto-advances an ambiguous hour digit after the delay with no further typing', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
        fireEvent.change(input, { target: { value: '1' } })
      })
      expect(input).toHaveValue('1')

      act(() => {
        vi.advanceTimersByTime(1200)
      })
      expect(input).toHaveValue('1:')
    })

    it('clears the pending timeout on blur so it cannot fire afterward', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
        fireEvent.change(input, { target: { value: '1' } })
        fireEvent.blur(input)
      })
      act(() => {
        vi.advanceTimersByTime(1200)
      })

      // Blur reverted the incomplete draft; the timeout must not resurrect it.
      expect(input).toHaveValue('')
    })
  })

  describe('mount/unmount', () => {
    it('mounts and unmounts cleanly under StrictMode double-invoke', () => {
      const { unmount } = render(
        <StrictMode>
          <InputTime defaultValue={at(9)} />
        </StrictMode>,
      )
      expect(() => unmount()).not.toThrow()
    })
  })
})
