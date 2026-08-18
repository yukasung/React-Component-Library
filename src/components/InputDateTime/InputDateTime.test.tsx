import { createRef, StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputDateTime } from './InputDateTime'

// Types without user-event's own click first — the field is edited a group at
// a time and user-event's click carries no coordinates, so it parks the caret
// in the *last* group. Same helper, same reason, as InputDate's own tests.
function typeInto(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, keys: string) {
  return user.type(input, keys, { skipClick: true })
}

function getInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[role="combobox"]')!
}

// Focus has to flush before any keydown lands: focusing is what creates the
// group entry, and a keydown arriving before that state is committed sees a
// field with no groups at all.
function focusInput(input: HTMLInputElement) {
  act(() => {
    input.focus()
  })
}

// Moves the caret into a group by index, the way an Arrow-key walk would.
function moveToGroup(input: HTMLElement, index: number) {
  fireEvent.keyDown(input, { key: 'Home' })
  for (let i = 0; i < index; i++) fireEvent.keyDown(input, { key: 'ArrowRight' })
}

describe('InputDateTime', () => {
  it('passes through id, name, placeholder and className', () => {
    render(<InputDateTime id="starts" name="startsAt" placeholder="Pick a moment" className="custom" />)
    const input = getInput()
    expect(input).toHaveAttribute('id', 'starts')
    expect(input).toHaveAttribute('name', 'startsAt')
    expect(input).toHaveAttribute('placeholder', 'Pick a moment')
    expect(input.className).toContain('custom')
  })

  it('displays a controlled value in the combined default format', () => {
    render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
    expect(getInput()).toHaveValue('2026-07-22 09:30')
  })

  it('forwards a ref to the text input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputDateTime ref={ref} value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
    expect(ref.current).toBe(getInput())
  })

  it('shows the format shape as its placeholder when empty', () => {
    render(<InputDateTime isRequired={false} format="d/m/Y H:i" />)
    expect(getInput()).toHaveAttribute('placeholder', '__/__/____ __:__')
  })

  describe('typed entry', () => {
    it('fills date and time groups in one pass and commits on blur', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime defaultValue={new Date(2026, 0, 1, 0, 0)} onChange={onChange} />)
      const input = getInput()

      await user.clear(input)
      await typeInto(user, input, '2026-08-18 09:30')
      expect(input).toHaveValue('2026-08-18 09:30')

      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 18, 9, 30))
    })

    it('commits on Enter', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime defaultValue={new Date(2026, 0, 1, 0, 0)} onChange={onChange} />)
      const input = getInput()

      await user.clear(input)
      await typeInto(user, input, '2026-08-18 09:30')
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 18, 9, 30))
    })

    it('commits nothing while a group is still unfilled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} isRequired={false} />)
      const input = getInput()

      await user.clear(input)
      // Date filled, time still on its fillers — a half-entered value, which
      // a native date/time input likewise refuses to report.
      await typeInto(user, input, '2026-08-18')
      expect(input).toHaveValue('2026-08-18 __:__')
      fireEvent.blur(input)

      expect(onChange).not.toHaveBeenCalled()
      expect(getInput()).toHaveValue('2026-07-22 09:30')
    })

    it('keeps the afternoon of a 12-hour format, which flatpickr alone would drop', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDateTime format="d/m/Y h:i K" defaultValue={new Date(2026, 0, 1, 0, 0)} onChange={onChange} />,
      )
      const input = getInput()

      await user.clear(input)
      await typeInto(user, input, '18/08/2026 02:30p')
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 18, 14, 30))
    })

    it('clamps a typed value to min/max on the whole timestamp', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDateTime
          defaultValue={new Date(2026, 7, 18, 12, 0)}
          onChange={onChange}
          min={new Date(2026, 7, 18, 9, 0)}
          max={new Date(2026, 7, 18, 18, 0)}
        />,
      )
      const input = getInput()

      await user.clear(input)
      await typeInto(user, input, '2026-08-18 21:30')
      fireEvent.blur(input)

      // Same day, past the max time — a day-granularity clamp would have let
      // this through untouched.
      expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 18, 18, 0))
    })

    it('snaps a required field back when the whole value is wiped at once', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()

      focusInput(input)
      await user.keyboard('{Control>}a{/Control}')
      fireEvent.keyDown(input, { key: 'Delete' })

      expect(getInput().value).not.toContain('_')
    })

    it('lets an optional field commit empty', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} isRequired={false} />)
      const input = getInput()

      await user.clear(input)
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('arrow stepping follows the group the caret is in', () => {
    it('steps a day from a date group', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()

      focusInput(input)
      moveToGroup(input, 2) // the day group
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 23, 9, 30))
    })

    it('steps through the time list from a time group', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()

      focusInput(input)
      moveToGroup(input, 4) // the minutes group
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 22, 9, 45))
    })

    it('leaves time stepping inert when timeStep yields no entries', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} timeStep={null} />)
      const input = getInput()

      focusInput(input)
      moveToGroup(input, 4)
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps by wheel when handleWheel is on and the field has focus', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} handleWheel />)
      const input = getInput()

      focusInput(input)
      moveToGroup(input, 2)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 23, 9, 30))
    })
  })

  describe('the two popups', () => {
    it('offers a calendar button and a clock button', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      expect(screen.getByRole('button', { name: 'Toggle calendar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Toggle time list' })).toBeInTheDocument()
    })

    it('hides the clock button when there are no time entries', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} timeStep={null} />)
      expect(screen.queryByRole('button', { name: 'Toggle time list' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Toggle calendar' })).toBeInTheDocument()
    })

    it('keeps the time when a day is picked from the calendar', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={onChange} />)

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      expect(day).not.toBeNull()
      fireEvent.click(day!)

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 4, 9, 30))
    })

    it('keeps the day when a time is picked from the list', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={onChange} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      // Scoped to the listbox: flatpickr's own month dropdown is a <select>,
      // whose twelve <option>s would otherwise be in the same query.
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: '14:00' }))

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 15, 14, 0))
    })

    it('lists times from timeMin to timeMax at timeStep, labelled with timeFormat', async () => {
      const user = userEvent.setup()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 30)}
          onChange={() => {}}
          timeMin={new Date(2026, 0, 1, 9, 0)}
          timeMax={new Date(2026, 0, 1, 10, 0)}
          timeStep={30}
          timeFormat="h:i K"
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(
        within(screen.getByRole('listbox'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        '9:00 AM',
        '9:30 AM',
        '10:00 AM',
      ])
    })

    it('closes the calendar when the time list opens, and the other way round', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} />)
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      expect(calendar.classList.contains('open')).toBe(true)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(calendar.classList.contains('open')).toBe(false)
      expect(screen.getByRole('listbox')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(calendar.classList.contains('open')).toBe(true)
    })

    it('reports which popup is open through aria-expanded/controls', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} />)
      const input = getInput()
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      expect(input).toHaveAttribute('aria-expanded', 'false')
      expect(input).toHaveAttribute('aria-controls', calendar.id)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(input).toHaveAttribute('aria-expanded', 'true')
      expect(input).toHaveAttribute('aria-haspopup', 'listbox')
      expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    })

    it('picks the highlighted time with Enter while the list is open', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={onChange} />)
      const input = getInput()

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 15, 9, 45))
    })
  })

  describe('states', () => {
    it('does not open either popup while disabled', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} isDisabled />)

      expect(getInput()).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      expect(getInput()).toHaveAttribute('aria-expanded', 'false')
    })

    it('commits nothing while read-only', async () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={onChange} isReadOnly />)
      const input = getInput()

      expect(input).toHaveAttribute('readonly')
      focusInput(input)
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      fireEvent.blur(input)

      expect(onChange).not.toHaveBeenCalled()
    })

    it('is pick-only for a format the groups cannot describe', () => {
      render(<InputDateTime format="F j, Y H:i" value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} />)
      const input = getInput()
      expect(input).toHaveValue('July 15, 2026 09:30')
      // Read-only to the browser's own text entry, yet still a live control.
      expect(input).toHaveAttribute('readonly')
      expect(input).not.toBeDisabled()
    })
  })

  describe('locale="th" (Buddhist Era)', () => {
    it('displays and parses Buddhist Era years', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDateTime locale="th" value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()
      expect(input).toHaveValue('2569-07-22 09:30')

      await user.clear(input)
      await typeInto(user, input, '2569-08-18 09:30')
      fireEvent.blur(input)

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 18, 9, 30))
    })

    it('renders Thai month names in the calendar popup', async () => {
      const user = userEvent.setup()
      render(<InputDateTime locale="th" value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="กรกฎาคม 4, 2569"]',
      )
      expect(day).not.toBeNull()
    })
  })

  describe('mount/unmount DOM-ownership safety (flatpickr escape hatch)', () => {
    it('mounts and unmounts cleanly (plain, non-StrictMode)', () => {
      const view = render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      expect(() => view.unmount()).not.toThrow()
    })

    it('mounts and unmounts cleanly under StrictMode double-invoke', () => {
      const view = render(
        <StrictMode>
          <InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />
        </StrictMode>,
      )
      expect(() => view.unmount()).not.toThrow()
      cleanup()
      expect(document.querySelectorAll('.flatpickr-calendar').length).toBe(0)
    })
  })
})
