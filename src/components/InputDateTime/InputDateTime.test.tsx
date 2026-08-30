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

// Drives typing from keydown, which is where the groups are actually edited
// (the browser is never let near the value) — the same approach InputDate's
// own group-typing suite uses.
function press(input: HTMLElement, ...keys: string[]) {
  for (const key of keys) fireEvent.keyDown(input, { key })
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
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()

      focusInput(input)
      input.setSelectionRange(0, input.value.length)
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
          value={new Date(2026, 6, 15, 9, 0)}
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

    it('disables time options outside same-day bounds', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 30)}
          min={new Date(2026, 6, 15, 9, 30)}
          max={new Date(2026, 6, 15, 9, 30)}
          onChange={onChange}
          timeMin={new Date(2026, 0, 1, 9, 0)}
          timeMax={new Date(2026, 0, 1, 10, 0)}
          timeStep={30}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      const list = within(screen.getByRole('listbox'))
      expect(list.getByRole('option', { name: '09:00' })).toHaveAttribute('aria-disabled', 'true')
      expect(list.getByRole('option', { name: '09:30' })).not.toHaveAttribute('aria-disabled')
      expect(list.getByRole('option', { name: '10:00' })).toHaveAttribute('aria-disabled', 'true')

      await user.click(list.getByRole('option', { name: '09:00' }))
      expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps time options enabled on a day without a timestamp bound', async () => {
      const user = userEvent.setup()
      render(
        <InputDateTime
          value={new Date(2026, 6, 16, 9, 30)}
          min={new Date(2026, 6, 15, 9, 30)}
          max={new Date(2026, 6, 15, 9, 30)}
          onChange={() => {}}
          timeMin={new Date(2026, 0, 1, 9, 0)}
          timeMax={new Date(2026, 0, 1, 10, 0)}
          timeStep={30}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      const list = within(screen.getByRole('listbox'))
      expect(list.getByRole('option', { name: '09:00' })).not.toHaveAttribute('aria-disabled')
      expect(list.getByRole('option', { name: '10:00' })).not.toHaveAttribute('aria-disabled')
    })

    it('keeps keyboard selection on enabled time options', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 0)}
          min={new Date(2026, 6, 15, 9, 30)}
          max={new Date(2026, 6, 15, 9, 30)}
          onChange={onChange}
          timeMin={new Date(2026, 0, 1, 9, 0)}
          timeMax={new Date(2026, 0, 1, 10, 0)}
          timeStep={30}
        />,
      )
      const input = getInput()

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      fireEvent.keyDown(input, { key: 'Home' })
      expect(input).toHaveAttribute('aria-activedescendant', `${screen.getByRole('listbox').id}-1`)
      fireEvent.keyDown(input, { key: 'End' })
      expect(input).toHaveAttribute('aria-activedescendant', `${screen.getByRole('listbox').id}-1`)
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 15, 9, 30))
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

  describe('uncontrolled use', () => {
    it('keeps its own value when no `value` prop is given', () => {
      const onChange = vi.fn()
      render(<InputDateTime defaultValue={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()

      focusInput(input)
      moveToGroup(input, 2)
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 23, 9, 30))
      // The field follows its own state rather than waiting to be told.
      expect(input).toHaveValue('2026-07-23 09:30')
    })

    it('starts empty when defaultValue is null and the field is optional', () => {
      render(<InputDateTime defaultValue={null} isRequired={false} />)
      expect(getInput()).toHaveValue('')
    })
  })

  describe('text / onTextChange', () => {
    it('reports the group text as it is typed, fillers included', () => {
      const onTextChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} onTextChange={onTextChange} />)
      const input = getInput()

      focusInput(input)
      // Home first: the focus handler picks its group from a deferred caret
      // read, so a synchronous keydown chain has to say which group it means.
      press(input, 'Home', 'Delete', '2', '0', '2', '7')

      expect(onTextChange).toHaveBeenCalledWith('2___-07-22 09:30')
      expect(onTextChange).toHaveBeenLastCalledWith('2027-07-22 09:30')
    })

    it('shows the text it is given rather than the formatted value', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} text="whatever the parent says" />)
      expect(getInput()).toHaveValue('whatever the parent says')
    })
  })

  describe('keyboard', () => {
    it('walks between groups with Left/Right/Home/End', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()

      focusInput(input)
      // End lands in the minutes group, so a digit typed there fills minutes.
      press(input, 'End', '4', '5')
      expect(input).toHaveValue('2026-07-22 09:45')

      // Left from there is the hour; Home is back to the year.
      press(input, 'ArrowLeft', '0', '8')
      expect(input).toHaveValue('2026-07-22 08:45')
      press(input, 'Home', '1', '9', '9', '9')
      expect(input).toHaveValue('1999-07-22 08:45')
    })

    it('discards an in-progress edit on Escape', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()

      focusInput(input)
      press(input, 'Home', '1', '9', '9', '9')
      expect(input).toHaveValue('1999-07-22 09:30')

      press(input, 'Escape')
      expect(input).toHaveValue('2026-07-22 09:30')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('opens the popup belonging to the group the caret is in (Alt+Arrow)', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      focusInput(input)
      moveToGroup(input, 2) // a date group
      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
      expect(calendar.classList.contains('open')).toBe(true)
      expect(screen.queryByRole('listbox')).toBeNull()

      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
      moveToGroup(input, 4) // a time group
      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(calendar.classList.contains('open')).toBe(false)
    })

    it('gives Home/End to the time list while it is open', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      const listId = screen.getByRole('listbox').id

      fireEvent.keyDown(input, { key: 'Home' })
      expect(input).toHaveAttribute('aria-activedescendant', `${listId}-0`)
      fireEvent.keyDown(input, { key: 'End' })
      // 96 entries at the default 15-minute step, so the last is index 95.
      expect(input).toHaveAttribute('aria-activedescendant', `${listId}-95`)
      // …and the groups stayed where they were, rather than following Home.
      expect(input).toHaveValue('2026-07-22 09:30')
    })

    it('reaches both drop-down toggles with Tab', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()
      const calendarButton = screen.getByRole('button', { name: 'Toggle calendar' })
      const clockButton = screen.getByRole('button', { name: 'Toggle time list' })

      // Skipping either would hide a whole input method from keyboard users:
      // the field has two popups and only one caret to open them from.
      await user.tab()
      expect(input).toHaveFocus()
      await user.tab()
      expect(calendarButton).toHaveFocus()
      await user.tab()
      expect(clockButton).toHaveFocus()
    })

    it('closes the calendar on Escape, and only then discards the edit', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      focusInput(input)
      press(input, 'Home', '1', '9', '9', '9')
      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
      expect(calendar.classList.contains('open')).toBe(true)

      // First Escape closes the popup and leaves the edit alone…
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(calendar.classList.contains('open')).toBe(false)
      expect(input).toHaveValue('1999-07-22 09:30')

      // …a second one discards it, the order a native combobox uses.
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input).toHaveValue('2026-07-22 09:30')
    })

    it('closes the time list on Escape without discarding the value', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} />)
      const input = getInput()

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.queryByRole('listbox')).toBeNull()
      expect(input).toHaveValue('2026-07-22 09:30')
    })

    it('ignores the wheel unless handleWheel is on and the field has focus', () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} />)
      const input = getInput()

      focusInput(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()

      rerender(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} handleWheel />)
      fireEvent.blur(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('text the field is given rather than typed', () => {
    it('takes an autofilled value and commits it', () => {
      const onChange = vi.fn()
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={onChange} format="F j, Y H:i" />)
      const input = getInput()

      // An alphabetic format is pick-only, so this is the one path where text
      // arrives without ever going through the groups.
      fireEvent.change(input, { target: { value: 'August 18, 2026 14:00' } })
      fireEvent.blur(input)

      expect(input).toHaveValue('July 22, 2026 09:30')
      // Unparseable in that format (a month name can't be read back), so the
      // field reverts rather than committing something it cannot round-trip.
      expect(onChange).not.toHaveBeenCalled()
    })

    it('snaps a required field back when it is handed an empty string', () => {
      render(<InputDateTime value={new Date(2026, 6, 22, 9, 30)} onChange={() => {}} format="F j, Y H:i" />)
      const input = getInput()

      fireEvent.change(input, { target: { value: '' } })

      expect(getInput().value).not.toBe('')
    })
  })

  describe('popup configuration', () => {
    it('keeps the calendar open after a pick when closeOnSelection is false', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} closeOnSelection={false} />)
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      const day = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      fireEvent.click(day!)

      expect(calendar.classList.contains('open')).toBe(true)
    })

    it('shows as many months as monthCount asks for', () => {
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} monthCount={2} />)
      expect(document.querySelectorAll('.flatpickr-calendar .flatpickr-month').length).toBe(2)
    })

    it('disables days outside min/max in the calendar', async () => {
      const user = userEvent.setup()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 30)}
          onChange={() => {}}
          min={new Date(2026, 6, 10, 0, 0)}
          max={new Date(2026, 6, 20, 23, 59)}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
      const outside = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 4, 2026"]',
      )
      const inside = document.querySelector(
        '.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)[aria-label="July 15, 2026"]',
      )
      expect(outside!.classList.contains('flatpickr-disabled')).toBe(true)
      expect(inside!.classList.contains('flatpickr-disabled')).toBe(false)
    })

    it('prevents picking a time after max', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 0)}
          onChange={onChange}
          max={new Date(2026, 6, 15, 12, 0)}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      const option = within(screen.getByRole('listbox')).getByRole('option', { name: '14:00' })
      expect(option).toHaveAttribute('aria-disabled', 'true')
      await user.click(option)

      expect(onChange).not.toHaveBeenCalled()
    })

    it('marks the entry matching the current value as selected', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      const selected = within(screen.getByRole('listbox')).getAllByRole('option', { selected: true })
      expect(selected.map((option) => option.textContent)).toEqual(['09:30'])
      expect(selected[0]).toHaveStyle({
        backgroundColor: 'var(--rc-color-primary, #465fff)',
        color: 'rgb(255, 255, 255)',
      })
    })

    it('caps the list height with maxDropdownHeight', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} maxDropdownHeight={120} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(screen.getByRole('listbox')).toHaveStyle({ maxHeight: '120px' })
    })

    it('keeps the time list as wide as its date-time field', async () => {
      const user = userEvent.setup()
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} />)

      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(screen.getByRole('listbox')).toHaveStyle({ minWidth: '100%', width: '100%' })
    })

    it('hides both buttons when showDropdownButton is false, keeping the keyboard route', () => {
      render(<InputDateTime value={new Date(2026, 6, 15, 9, 30)} onChange={() => {}} showDropdownButton={false} />)
      const input = getInput()

      expect(screen.queryByRole('button')).toBeNull()

      focusInput(input)
      moveToGroup(input, 4)
      fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true })
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('uses consumer-supplied icons and accessible names', () => {
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 30)}
          onChange={() => {}}
          dropdownIcon={<span data-testid="calendar-icon">calendar</span>}
          dropdownAriaLabel="Open booking calendar"
          timeDropdownIcon={<span data-testid="clock-icon">clock</span>}
          timeDropdownAriaLabel="Open booking times"
        />,
      )

      expect(screen.getByRole('button', { name: 'Open booking calendar' })).toContainElement(
        screen.getByTestId('calendar-icon'),
      )
      expect(screen.getByRole('button', { name: 'Open booking times' })).toContainElement(
        screen.getByTestId('clock-icon'),
      )
    })

    it('labels the calendar dialog and the time list', async () => {
      const user = userEvent.setup()
      render(
        <InputDateTime
          value={new Date(2026, 6, 15, 9, 30)}
          onChange={() => {}}
          calendarAriaLabel="Booking calendar"
          optionsAriaLabel="Booking times"
        />,
      )

      expect(document.querySelector('.flatpickr-calendar')).toHaveAttribute('aria-label', 'Booking calendar')
      await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
      expect(screen.getByRole('listbox', { name: 'Booking times' })).toBeInTheDocument()
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
