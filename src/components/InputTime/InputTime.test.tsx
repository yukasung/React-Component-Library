import { createRef, startTransition, StrictMode, Suspense, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputTime } from './InputTime'

// Types into the field without user-event's own click first, and that part is
// load-bearing rather than tidiness: the field is edited a group at a time,
// and user-event's click carries no coordinates, so it parks the caret at the
// end of the text -- i.e. in the *last* group. Typing through it would quietly
// exercise a different group than the test means to. Going through one helper
// is what keeps that from being 15 chances to forget.
function typeInto(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, keys: string) {
  return user.type(input, keys, { skipClick: true })
}

// A fixed reference day for every test that cares about the date part
// surviving a time commit.
const DAY = new Date(2026, 6, 22, 9, 0)

function at(hours: number, minutes = 0): Date {
  return new Date(2026, 6, 22, hours, minutes)
}

describe('InputTime', () => {
  it('keeps the visible commit baseline when an external transition suspends', async () => {
    const onChange = vi.fn()
    const pending = new Promise<void>(() => {})
    function Suspends({ active }: { active: boolean }) {
      if (active) throw pending
      return null
    }
    const field = (hour: number) => (
      <Suspense fallback={<span>Loading</span>}>
        <InputTime value={at(hour)} onChange={onChange} />
        <Suspends active={hour === 9} />
      </Suspense>
    )
    const { rerender } = render(field(1))
    const input = screen.getByRole('combobox')
    act(() => { input.focus() })

    await act(async () => { startTransition(() => { rerender(field(9)) }) })
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()
    expect(input).toHaveValue('01:00')

    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits a previous value after an external controlled value change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('09:00')

    rerender(<InputTime value={at(21, 5)} onChange={onChange} isRequired={false} />)
    expect(input).toHaveValue('21:05')
    expect(onChange).not.toHaveBeenCalled()

    await user.clear(input)
    await typeInto(user, input, '0900')
    await user.keyboard('{Enter}')

    expect(input).toHaveValue('09:00')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(at(9))

    // The parent has not accepted the commit yet. Rendering the same
    // controlled value must not reset deduplication before blur.
    rerender(<InputTime value={at(21, 5)} onChange={onChange} isRequired={false} />)
    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('passes through id, name, placeholder, and className', () => {
    render(<InputTime id="start" name="startTime" placeholder="Pick a time" className="custom" />)
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('id', 'start')
    expect(input).toHaveAttribute('name', 'startTime')
    expect(input).toHaveAttribute('placeholder', 'Pick a time')
    // The border and background live on the input itself (the clock icon
    // overlays it rather than sitting in a cell beside it), so a consumer
    // className lands there too.
    expect(input.className).toContain('custom')
  })

  it('uses custom dropdown labels and icon while retaining keyboard selection', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <InputTime
        value={at(9)}
        onChange={onChange}
        dropdownIcon={<span data-testid="time-icon">time</span>}
        dropdownAriaLabel="Open appointment times"
        optionsAriaLabel="Appointment times"
      />,
    )
    const input = screen.getByRole('combobox')
    const button = screen.getByRole('button', { name: 'Open appointment times' })

    expect(button).toContainElement(screen.getByTestId('time-icon'))
    await user.click(button)
    expect(screen.getByRole('listbox', { name: 'Appointment times' })).toBeInTheDocument()

    input.focus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(at(9, 15))
  })

  it('uses the primary theme hook for focus and selected options', () => {
    render(<InputTime value={at(9)} onChange={() => {}} />)
    expect(screen.getByRole('combobox').className).toContain('var(--rc-color-primary,#465fff)')
    expect(screen.getByRole('combobox').className).toContain('color-mix')
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
    await typeInto(user, input, '1015')

    expect(input).toHaveValue('10:15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputTime value={at(9)} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('combobox')

    await user.clear(input)
    await typeInto(user, input, '1015')
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
    await typeInto(user, input, '0745')
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
    await typeInto(user, input, '0745')
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
    await typeInto(user, input, '9')
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
    await typeInto(user, input, '2233')
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
    await typeInto(user, input, '1830')
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
      await typeInto(user, input, '1645')
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
      await typeInto(user, screen.getByRole('combobox'), '1000')
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
      await typeInto(user, input, '230p')
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

    it('does not commit a 24-hour time pasted into a 12-hour field', () => {
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} format="h:i K" />)
      const input = screen.getByRole('combobox')

      // "14" is not an hour on a 12-hour clock, so the group refuses it and
      // the paste stops there rather than being corrected into something else.
      fireEvent.change(input, { target: { value: '14:30 PM' } })
      expect(input).toHaveValue('__:__ __')

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
      await typeInto(user, input, '0730')
      await user.tab()

      expect(onChange.mock.calls[0][0]).toEqual(at(9))
    })

    it('clamps a typed value above max down to max on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(12)} onChange={onChange} min={at(9)} max={at(17)} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await typeInto(user, input, '2300')
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

    it('tracks the list state on aria-expanded through every way it opens and closes', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} min={at(9)} max={at(10)} step={30} />)
      const input = screen.getByRole('combobox')
      const button = screen.getByRole('button', { name: 'Toggle time list' })
      expect(input).toHaveAttribute('aria-expanded', 'false')

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'true')

      await user.click(screen.getByRole('option', { name: '09:30' }))
      expect(input).toHaveAttribute('aria-expanded', 'false')

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'true')

      await user.keyboard('{Escape}')
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    it('marks the entry matching the value as selected', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9, 30)} min={at(9)} max={at(10)} step={30} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      const selected = screen.getByRole('option', { name: '09:30' })
      expect(selected).toHaveAttribute('aria-selected', 'true')
      expect(selected).toHaveStyle({
        backgroundColor: 'var(--rc-color-primary, #465fff)',
        color: 'rgb(255, 255, 255)',
      })
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

    // Regression, shared with InputDateTime: a portalled list is a child of
    // <body>, so it stacks against the application's overlays rather than the
    // field's siblings. The old default of 50 put it under an app modal.
    it('opens the list above an application overlay', async () => {
      const user = userEvent.setup()
      const overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.zIndex = '99999'
      document.body.appendChild(overlay)

      try {
        render(<InputTime defaultValue={at(9)} />, { container: overlay })
        await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

        const listbox = screen.getByRole('listbox')
        expect(overlay.contains(listbox)).toBe(false)
        expect(Number(listbox.style.zIndex)).toBeGreaterThan(Number(overlay.style.zIndex))
      } finally {
        overlay.remove()
      }
    })

    // The application owns its own layer order; --rc-z-popup lets it place
    // every portalled popup at once instead of threading a prop through each
    // field. Set on an ancestor, it must cross the portal boundary the same
    // way --rc-color-primary already does.
    it('takes its layer from the --rc-z-popup token', async () => {
      const user = userEvent.setup()
      const host = document.createElement('div')
      host.style.setProperty('--rc-z-popup', '1100')
      document.body.appendChild(host)

      try {
        render(<InputTime defaultValue={at(9)} />, { container: host })
        await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

        expect(screen.getByRole('listbox')).toHaveStyle({ zIndex: '1100' })
      } finally {
        host.remove()
      }
    })

    // The prop is the per-field escape hatch, so it has to beat the token.
    it('lets portalZIndex override the --rc-z-popup token', async () => {
      const user = userEvent.setup()
      const host = document.createElement('div')
      host.style.setProperty('--rc-z-popup', '1100')
      document.body.appendChild(host)

      try {
        render(<InputTime defaultValue={at(9)} portalZIndex={7} />, { container: host })
        await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

        expect(screen.getByRole('listbox')).toHaveStyle({ zIndex: '7' })
      } finally {
        host.remove()
      }
    })

    it('lets portalZIndex override the stacking order', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} portalZIndex={120} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(screen.getByRole('listbox')).toHaveStyle({ zIndex: '120' })
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

      // Emptied, and still being edited -- so the groups are showing rather
      // than the field going blank mid-edit.
      expect(input).toHaveValue('__:__')

      await user.tab()
      expect(input).toHaveValue('')
    })
  })

  describe('segment highlight on landing in the field', () => {
    // The selection is applied on a deferred macrotask, because a real
    // click's own native caret positioning runs after the focus event in
    // WebKit and would otherwise overwrite it -- see selectRangeAtCaret.
    function settleSelection() {
      act(() => {
        vi.advanceTimersByTime(0)
      })
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('highlights the hour on tab-in, not the whole value', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      input.focus()
      settleSelection()

      expect(input.value).toBe('09:30')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    // A real click: mousedown, then focus, then the browser dropping the
    // caret where it was clicked (which jsdom doesn't do on its own).
    function clickAt(input: HTMLInputElement, caret: number) {
      fireEvent.mouseDown(input)
      input.focus()
      input.setSelectionRange(caret, caret)
    }

    it('highlights the group the caret landed in', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      clickAt(input, 4)
      settleSelection()

      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('highlights the AM/PM designator as one group', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(14, 30)} format="h:i K" />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      // At rest the format's own unpadded hour is shown.
      expect(input.value).toBe('2:30 PM')

      clickAt(input, 7)
      settleSelection()

      // Editing puts every group at full width, so the hour pads out -- the
      // positions have to hold still while the groups are being edited.
      expect(input.value).toBe('02:30 PM')
      expect([input.selectionStart, input.selectionEnd]).toEqual([6, 8])
    })

    it('ignores where a keyboard focus left the caret, taking the hour either way', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      // No mousedown — a tab-in or a programmatic .focus(), where engines
      // park the caret in different places (jsdom leaves it at the end).
      input.focus()
      input.setSelectionRange(5, 5)
      settleSelection()

      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('re-highlights on a later click, when no focus event fires', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      input.focus()
      settleSelection()
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])

      // A plain click collapses the caret at the pointer first.
      input.setSelectionRange(4, 4)
      fireEvent.click(input)
      settleSelection()

      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('leaves a dragged selection alone', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      input.focus()
      settleSelection()
      // A drag ends with a range, not a collapsed caret.
      input.setSelectionRange(1, 4)
      fireEvent.click(input)
      settleSelection()

      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])
    })

    it('does not select on a field blurred before the deferred timer fires', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      input.focus()
      input.blur()
      settleSelection()

      expect(input.selectionStart).toBe(input.selectionEnd)
    })

    it('replaces only the highlighted group when the next digit is typed', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      input.focus()
      settleSelection()
      // Typing over the highlighted "09" -- the minutes are untouched.
      fireEvent.keyDown(input, { key: '7' })

      expect(input).toHaveValue('07:30')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })
  })

  describe('empty-field template', () => {
    function settleSelection() {
      act(() => {
        vi.advanceTimersByTime(0)
      })
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('turns the format into real, highlighted text when an empty field is focused', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      expect(input.value).toBe('')

      act(() => {
        input.focus()
      })
      settleSelection()

      expect(input.value).toBe('__:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('follows the format, highlighting the leading group of a 12-hour one', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} format="h:i K" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()

      expect(input.value).toBe('__:__ __')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('highlights the group a pointer landed in, not just the leading one', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      fireEvent.mouseDown(input)
      act(() => {
        input.focus()
      })
      input.setSelectionRange(4, 4)
      settleSelection()

      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('fills the group that is highlighted, leaving the earlier one empty', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      // Click into the minutes of an empty field and type there -- the case a
      // draft (which only holds what is typed, in order) cannot represent.
      fireEvent.mouseDown(input)
      act(() => {
        input.focus()
      })
      input.setSelectionRange(4, 4)
      settleSelection()
      fireEvent.change(input, { target: { value: '__:3' } })

      expect(input).toHaveValue('__:03')
      // Still in the minutes: "3" could yet become "35".
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])

      fireEvent.change(input, { target: { value: '__:5' } })
      expect(input).toHaveValue('__:35')
    })

    it('replaces the template with the typed digit, keeping the rest as fillers', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      // What the browser produces when a digit is typed over the highlight.
      fireEvent.change(input, { target: { value: '9:__' } })

      // An hour of 9 can't take a second digit, so it finishes and pads,
      // and the highlight moves on to the minutes.
      expect(input).toHaveValue('09:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('zero-pads a single digit immediately, and still takes a second one', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '1:__' } })
      // Reads as an hour right away, the way a native time input does.
      expect(input).toHaveValue('01:__')
      // Still the hour's group -- "1" could yet become 10-19, so the next
      // digit continues it instead of starting over.
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])

      fireEvent.change(input, { target: { value: '4:__' } })
      expect(input).toHaveValue('14:__')
    })

    it('rejects a digit that would push a group out of range', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '2:__' } })
      expect(input).toHaveValue('02:__')

      // 25 is not an hour -- the same rule the draft masker applies, from the
      // same acceptDigit.
      fireEvent.change(input, { target: { value: '5:__' } })
      expect(input).toHaveValue('02:__')
    })

    it('rebuilds a pasted time dropped onto the template', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} format="h:i K" />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '9:30 PM:__ __' } })

      expect(input).toHaveValue('09:30 PM')
    })

    it('walks between groups with Left/Right, finishing the one it leaves', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '1:__' } })
      expect(input).toHaveValue('01:__')

      // Leaving an ambiguous "1" settles it as the 01 it already reads as,
      // rather than losing it for being unfinished.
      fireEvent.keyDown(input, { key: 'ArrowRight' })
      expect(input).toHaveValue('01:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])

      fireEvent.keyDown(input, { key: 'ArrowLeft' })
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('steps from the time on screen, not the one last committed', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputTime defaultValue={at(9, 30)} onChange={onChange} step={15} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      for (const key of ['1', '1', '4', '5']) fireEvent.keyDown(input, { key })
      expect(input).toHaveValue('11:45')

      // The groups aren't written to the draft, so stepping used to read the
      // committed 09:30 and throw the typed time away.
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(input).toHaveValue('12:00')
      // Still editing as groups, with one highlighted -- dropping out would
      // leave the next keystroke nowhere to go.
      expect(input.selectionStart).not.toBe(input.selectionEnd)
    })

    it('commits a fully filled template on blur', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputTime value={null} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '9:__' } })
      fireEvent.change(input, { target: { value: '09:3' } })
      fireEvent.change(input, { target: { value: '09:5' } })
      expect(input).toHaveValue('09:35')

      act(() => {
        fireEvent.blur(input)
      })

      expect(onChange).toHaveBeenCalledTimes(1)
      const committed = onChange.mock.calls[0][0] as Date
      expect([committed.getHours(), committed.getMinutes()]).toEqual([9, 35])
    })

    it('discards a half-filled template on blur', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputTime value={null} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '9:__' } })
      expect(input).toHaveValue('09:__')

      act(() => {
        fireEvent.blur(input)
      })

      // A time with no minutes is not a time; nothing is invented for it.
      expect(input).toHaveValue('')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('empties every group on Escape', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '9:__' } })
      expect(input).toHaveValue('09:__')

      fireEvent.keyDown(input, { key: 'Escape' })

      expect(input).toHaveValue('__:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('empties the highlighted group when it is deleted', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.change(input, { target: { value: '9:__' } })
      expect(input).toHaveValue('09:__')

      // Backspace with the (now highlighted) minutes selected steps back and
      // clears the hour, since the minutes hold nothing to clear.
      fireEvent.change(input, { target: { value: '09:' } })

      expect(input).toHaveValue('__:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('keeps the template up when a keystroke is rejected', async () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      // A letter is not a valid character in an H:i field.
      fireEvent.change(input, { target: { value: 'x:__' } })
      // Nothing re-renders, so the highlight is re-applied straight to the
      // element -- including the microtask re-apply that outlives React's own
      // controlled-value restoration (see applySelection).
      await Promise.resolve()

      expect(input).toHaveValue('__:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    })

    it('hands the field back to its placeholder on blur, with no value change', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputTime value={null} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      expect(input.value).toBe('__:__')

      fireEvent.blur(input)

      expect(input.value).toBe('')
      expect(input).toHaveAttribute('placeholder', '__:__')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('never reports the template as text', () => {
      vi.useFakeTimers()
      const onTextChange = vi.fn()
      render(<InputTime defaultValue={null} isRequired={false} onTextChange={onTextChange} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()
      fireEvent.blur(input)

      expect(onTextChange).not.toHaveBeenCalledWith('__:__')
    })

    it('does not show on a required field, which is never empty', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()

      expect(input).toHaveValue('09:30')
    })

    it('does not show on a read-only field, which has nothing to type into', () => {
      vi.useFakeTimers()
      render(<InputTime defaultValue={null} isRequired={false} isReadOnly />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      act(() => {
        input.focus()
      })
      settleSelection()

      expect(input).toHaveValue('')
    })

    it('gives way to a value picked from the dropdown while still focused', async () => {
      render(<InputTime defaultValue={null} isRequired={false} min={at(9)} max={at(10)} step={30} />)
      const user = userEvent.setup()
      const input = screen.getByRole('combobox') as HTMLInputElement

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      await user.click(screen.getByRole('option', { name: '09:30' }))

      expect(input).toHaveValue('09:30')
    })
  })

  describe('placeholder', () => {
    it('falls back to the format as an empty mask, so a cleared field is not blank', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9)} isRequired={false} />)
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await user.tab()

      expect(input).toHaveValue('')
      expect(input).toHaveAttribute('placeholder', '__:__')
    })

    it('follows the format, designator included', () => {
      render(<InputTime defaultValue={null} isRequired={false} format="h:i K" />)
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', '__:__ __')
    })

    it('falls back to the default format when the format is unusable', () => {
      render(<InputTime defaultValue={null} isRequired={false} format="H:i:S" />)
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', '__:__')
    })

    it('leaves a consumer-supplied placeholder alone', () => {
      render(<InputTime defaultValue={null} isRequired={false} placeholder="เวลานัดหมาย" />)
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'เวลานัดหมาย')
    })
  })

  describe('isEditable', () => {
    it('blocks typing but still allows picking from the dropdown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={DAY} onChange={onChange} isEditable={false} min={at(9)} max={at(10)} step={30} />)
      const input = screen.getByRole('combobox')

      await typeInto(user, input, '1234')
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
      expect(screen.getByRole('combobox').className).not.toContain('bg-gray-50')
    })
  })

  describe('isDisabled / isReadOnly', () => {
    it('renders as a disabled input with disabled styling', () => {
      render(<InputTime defaultValue={at(9)} isDisabled />)
      const input = screen.getByRole('combobox')
      expect(input).toBeDisabled()
      expect(input.className).toContain('bg-gray-100')
    })

    it('prevents typing and dropdown toggling while disabled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputTime value={at(9)} onChange={onChange} isDisabled />)

      await typeInto(user, screen.getByRole('combobox'), '1234')
      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))

      expect(onChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('renders as read-only, distinct from disabled, and stays focusable', () => {
      render(<InputTime defaultValue={at(9)} isReadOnly />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('readonly')
      expect(input).not.toBeDisabled()
      expect(input.className).toContain('bg-gray-50')
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
        const [text, setText] = useState('09:00')
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
      const input = screen.getByRole('combobox')

      await user.clear(input)
      await typeInto(user, input, '09')

      // What the field is showing, groups and all -- not the raw keystrokes,
      // and not a half-formatted string the consumer would have to guess at.
      expect(onTextChange).toHaveBeenLastCalledWith('09:__')
    })

    it('reports the finished time once it commits', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()
      render(<InputTime defaultValue={null} isRequired={false} onTextChange={onTextChange} />)
      const input = screen.getByRole('combobox')

      await user.click(input)
      await user.keyboard('{Home}0930')
      await user.tab()

      // The groups are reported while they fill, and the formatted value once
      // the edit commits -- so a consumer watching `text` never has to parse
      // a partly filled field to know what was settled.
      expect(onTextChange).toHaveBeenLastCalledWith('09:30')
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

    it('passes a consumer-supplied aria-describedby straight through', () => {
      render(<InputTime defaultValue={at(9)} aria-describedby="external" />)
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-describedby', 'external')
    })

    it('omits aria-describedby entirely when the consumer supplies none', () => {
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

  describe('group typing', () => {
    // Typing is driven from the key, not from the text it would produce (a
    // padded group makes that text ambiguous -- see handleTemplateKey), so
    // these press keys rather than assigning values.
    function press(input: HTMLInputElement, ...keys: string[]) {
      for (const key of keys) fireEvent.keyDown(input, { key })
    }

    function focused(props: Partial<Parameters<typeof InputTime>[0]> = {}) {
      render(<InputTime defaultValue={null} isRequired={false} {...props} />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      act(() => {
        input.focus()
      })
      return input
    }

    it('finishes and moves on when a digit cannot take another', () => {
      const input = focused()

      press(input, '9')

      expect(input).toHaveValue('09:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('keeps an ambiguous digit in its group, then completes on the second', () => {
      const input = focused()

      press(input, '1')
      expect(input).toHaveValue('01:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])

      press(input, '4')
      expect(input).toHaveValue('14:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('rejects a second hour digit that would exceed 23', () => {
      const input = focused()

      press(input, '2', '5')

      expect(input).toHaveValue('02:__')
    })

    it('takes the highest minute, and finishes a minute no second digit can follow', () => {
      const input = focused()

      press(input, '0', '9', '5', '9')
      expect(input).toHaveValue('09:59')

      // A finished group starts over. "6" is a minute on its own and nothing
      // can follow it (60-69 don't exist), so it finishes on the spot -- which
      // is why the "9" after it starts over again rather than making 69.
      press(input, '6')
      expect(input).toHaveValue('09:06')
      press(input, '9')
      expect(input).toHaveValue('09:09')
    })

    it('writes the whole AM/PM designator from a single letter', () => {
      const input = focused({ format: 'h:i K' })

      press(input, '2', '3', '0', 'p')

      expect(input).toHaveValue('02:30 PM')
    })

    it('moves the highlight to the next group when the separator is typed', () => {
      const input = focused()

      // Nothing typed yet: the separator skips the hour and leaves the
      // minutes highlighted, ready for digits.
      press(input, ':')
      expect(input).toHaveValue('__:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])

      press(input, '3')
      expect(input).toHaveValue('__:03')
    })

    it('finishes a short group when the separator moves off it', () => {
      const input = focused()

      press(input, '1', ':')
      // "1" was still open (it could have become 19); the separator settles it
      // and hands the highlight to the minutes.
      expect(input).toHaveValue('01:__')
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5])
    })

    it('empties the highlighted group on Backspace, then steps back', () => {
      const input = focused()

      press(input, '9', '3', '0')
      expect(input).toHaveValue('09:30')

      press(input, 'Backspace')
      expect(input).toHaveValue('09:__')

      // Nothing left in the minutes, so the next press clears the hour.
      press(input, 'Backspace')
      expect(input).toHaveValue('__:__')
    })

    it('rebuilds a full time from a single-event paste', () => {
      const input = focused({ format: 'h:i K' })

      fireEvent.change(input, { target: { value: '9:30 PM' } })

      expect(input).toHaveValue('09:30 PM')
    })

    it('clears the last group too, instead of snapping the field back under the user', () => {
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement
      act(() => {
        input.focus()
      })

      press(input, 'End')
      press(input, 'Backspace')
      expect(input).toHaveValue('09:__')
      press(input, 'Backspace')
      expect(input).toHaveValue('__:__')
    })

    it('snaps a required field back to a time when every group is emptied', async () => {
      const user = userEvent.setup()
      render(<InputTime defaultValue={at(9, 30)} />)
      const input = screen.getByRole('combobox') as HTMLInputElement

      // Select-all-then-delete clears every group at once; a required field
      // can't sit with no value, so it snaps rather than waiting for blur.
      await user.clear(input)

      expect(input.value).toMatch(/^\d{2}:\d{2}$/)
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
