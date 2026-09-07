import { createRef, startTransition, StrictMode, Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputDate } from './InputDate'

// Types into the field without user-event's own click first, and that part is
// load-bearing rather than tidiness: the field is edited a group at a time,
// and user-event's click carries no coordinates, so it parks the caret at the
// end of the text — i.e. in the *last* group. Typing through it would quietly
// exercise a different group than the test means to, and for this component
// the click also opens the calendar. Going through one helper is what keeps
// that from being 13 chances to forget.
function typeInto(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, keys: string) {
  return user.type(input, keys, { skipClick: true })
}

function getDateInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[role="combobox"]')!
}

describe('InputDate', () => {
  describe('on an iPhone', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      )
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('commits an English native date selection after calendar prop updates', () => {
      const onChange = vi.fn()
      const { rerender, unmount } = render(
        <StrictMode>
          <InputDate defaultValue={new Date(2026, 6, 1)} onChange={onChange} />
        </StrictMode>,
      )
      const nativeInput = document.querySelector<HTMLInputElement>('input.flatpickr-mobile')!
      expect(nativeInput).toHaveAttribute('type', 'date')
      expect(document.querySelector('.flatpickr-calendar')).not.toBeInTheDocument()

      rerender(
        <StrictMode>
          <InputDate
            defaultValue={new Date(2026, 6, 1)}
            onChange={onChange}
            monthCount={2}
            calendarAriaLabel="Booking calendar"
          />
        </StrictMode>,
      )
      fireEvent.change(nativeInput, { target: { value: '2026-07-15' } })

      expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 15))
      expect(getDateInput()).toHaveValue('2026-07-15')
      unmount()
      expect(document.querySelector('input.flatpickr-mobile')).not.toBeInTheDocument()
    })

    it('keeps native selections Gregorian after switching to Thai locale', () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputDate defaultValue={new Date(2026, 6, 1)} onChange={onChange} />)
      rerender(<InputDate defaultValue={new Date(2026, 6, 1)} onChange={onChange} locale="th" monthCount={2} />)

      // Mobile mode is chosen at mount. The native value stays Gregorian,
      // while the React-owned field displays Buddhist Era after the switch.
      const nativeInput = document.querySelector<HTMLInputElement>('input.flatpickr-mobile')!
      expect(nativeInput).toBeInTheDocument()
      expect(getDateInput()).toHaveValue('2569-07-01')

      fireEvent.change(nativeInput, { target: { value: '2026-07-15' } })

      expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 15))
      expect(getDateInput()).toHaveValue('2569-07-15')
      expect(nativeInput).toHaveValue('2026-07-15')
    })

    it('keeps the Thai Buddhist Era JavaScript calendar on mobile', () => {
      render(<InputDate defaultValue={new Date(2026, 6, 1)} locale="th" />)

      expect(document.querySelector('input.flatpickr-mobile')).not.toBeInTheDocument()
      expect(document.querySelector('.flatpickr-calendar')).toHaveAttribute('role', 'dialog')
      expect(document.querySelector('.rcl-year-input')).toHaveValue('2569')
    })
  })

  it('keeps the visible commit baseline when an external transition suspends', async () => {
    const onChange = vi.fn()
    const pending = new Promise<void>(() => {})
    function Suspends({ active }: { active: boolean }) {
      if (active) throw pending
      return null
    }
    const field = (day: number) => (
      <Suspense fallback={<span>Loading</span>}>
        <InputDate value={new Date(2026, 6, day)} onChange={onChange} />
        <Suspends active={day === 9} />
      </Suspense>
    )
    const { rerender } = render(field(1))
    const input = getDateInput()
    act(() => { input.focus() })

    await act(async () => { startTransition(() => { rerender(field(9)) }) })
    expect(screen.queryByText('Loading')).not.toBeInTheDocument()
    expect(input).toHaveValue('2026-07-01')

    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits a previous value after an external controlled value change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()
    expect(input).toHaveValue('2026-07-01')

    rerender(<InputDate value={new Date(2026, 6, 9)} onChange={onChange} isRequired={false} />)
    expect(input).toHaveValue('2026-07-09')
    expect(onChange).not.toHaveBeenCalled()

    await user.clear(input)
    await typeInto(user, input, '2026-07-01')
    await user.keyboard('{Enter}')

    expect(input).toHaveValue('2026-07-01')
    expect(onChange).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 1))

    // The parent has not accepted the commit yet. Rendering the same
    // controlled value must not reset deduplication before blur.
    rerender(<InputDate value={new Date(2026, 6, 9)} onChange={onChange} isRequired={false} />)
    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('passes through id, name, placeholder, and className', () => {
    render(<InputDate id="dob" name="dateOfBirth" placeholder="Pick a date" className="custom" />)
    const input = getDateInput()
    expect(input).toHaveAttribute('id', 'dob')
    expect(input).toHaveAttribute('name', 'dateOfBirth')
    expect(input).toHaveAttribute('placeholder', 'Pick a date')
    // The border and background live on the input itself (the calendar
    // icon overlays it rather than sitting in a cell beside it), so a
    // consumer className lands there too.
    expect(input.className).toContain('custom')
  })

  it('uses a consumer-supplied calendar icon and accessible name', () => {
    render(
      <InputDate
        value={new Date(2026, 6, 1)}
        onChange={() => {}}
        dropdownIcon={<span data-testid="calendar-icon">calendar</span>}
        dropdownAriaLabel="Open booking calendar"
      />,
    )

    expect(screen.getByRole('button', { name: 'Open booking calendar' })).toContainElement(
      screen.getByTestId('calendar-icon'),
    )
  })

  it('uses the primary theme hook for its focus treatment', () => {
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    expect(getDateInput().className).toContain('var(--rc-color-primary,#465fff)')
    expect(getDateInput().className).toContain('color-mix')
  })

  it('displays a controlled value', () => {
    render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} />)
    expect(getDateInput()).toHaveValue('2026-07-22')
  })

  it('updates the displayed value while typing without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()

    await user.clear(input)
    await typeInto(user, input, '2026-07-15')

    expect(input).toHaveValue('2026-07-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()

    await user.clear(input)
    await typeInto(user, input, '2026-07-15')
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(new Date(2026, 6, 15))
  })

  it('commits on Enter without losing focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()

    await user.clear(input)
    await typeInto(user, input, '2026-07-04')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 4))
    expect(input).toHaveFocus()
  })

  it('does not re-fire onChange on blur immediately after an Enter commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} />)
    const input = getDateInput()

    await user.clear(input)
    await typeInto(user, input, '2026-07-04')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reverts an unparseable draft on blur without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()

    await user.clear(input)
    // The live-typing mask (see the "typed-digit masking" describe block
    // below) rejects non-digit characters for this numeric-only default
    // format, so "not a date" would never actually land in the draft at
    // all — an incomplete year is the realistic way to leave the field in
    // an unparseable state under masking.
    await typeInto(user, input, '202')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('2026-07-15')
  })

  it('discards an in-progress edit on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
    const input = getDateInput()

    await user.clear(input)
    await typeInto(user, input, '2026-01-01')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('2026-07-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes an open calendar on Escape, and only then discards the edit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
    const input = getDateInput()
    const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

    await user.clear(input)
    await typeInto(user, input, '2026-01-01')
    await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))
    expect(calendar.classList.contains('open')).toBe(true)

    // First Escape takes the popup and leaves the edit alone…
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(calendar.classList.contains('open')).toBe(false)
    expect(input).toHaveValue('2026-01-01')

    // …the second discards it.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('2026-07-15')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when the field is cleared and blurred while isRequired is false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
    const input = getDateInput()

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('works uncontrolled via defaultValue', async () => {
    const user = userEvent.setup()
    render(<InputDate defaultValue={new Date(2026, 6, 3)} isRequired={false} />)
    const input = getDateInput()
    expect(input).toHaveValue('2026-07-03')

    await user.clear(input)
    await typeInto(user, input, '2026-07-09')
    await user.tab()

    expect(input).toHaveValue('2026-07-09')
  })

  it('resyncs the displayed value when the external value prop changes', () => {
    const { rerender } = render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    expect(getDateInput()).toHaveValue('2026-07-01')

    rerender(<InputDate value={new Date(2026, 6, 9)} onChange={() => {}} />)
    expect(getDateInput()).toHaveValue('2026-07-09')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputDate ref={ref} value={new Date(2026, 6, 1)} onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('highlights the leading group on focus', () => {
    // The selection defers via a zero-delay setTimeout -- required for
    // WebKit/Safari, where a synchronous selection in the focus handler gets
    // silently overwritten by the browser's own native click-cursor
    // positioning (confirmed empirically, not just reasoned about).
    vi.useFakeTimers()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} format="d/m/Y" />)
    const input = getDateInput() as HTMLInputElement

    act(() => {
      input.focus()
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    // The day, not the whole date: the field is edited a group at a time.
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2])
    vi.useRealTimers()
  })

  it('still selects the whole value on focus for a format the groups cannot describe', () => {
    vi.useFakeTimers()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} format="F j, Y" />)
    const input = getDateInput() as HTMLInputElement

    act(() => {
      input.focus()
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })

    // "July 1, 2026" has no fixed-width groups, so it stays plain text.
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
    vi.useRealTimers()
  })

  it('does not select on focus if the field is blurred before the deferred timer fires', () => {
    vi.useFakeTimers()
    render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
    const input = getDateInput() as HTMLInputElement

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
      const input = getDateInput()

      await user.clear(input)
      await typeInto(user, input, '2026-07-01')
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
      const input = getDateInput()

      await user.clear(input)
      await typeInto(user, input, '2026-07-31')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 20))
    })
  })

  describe('Arrow-key day-stepping', () => {
    it('increments by one day on ArrowUp and commits immediately', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = getDateInput()

      input.focus()
      await user.keyboard('{ArrowUp}')

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16))
    })

    it('decrements by one day on ArrowDown', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = getDateInput()

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
      const input = getDateInput()

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
      const input = getDateInput()

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
      const input = getDateInput()
      expect(input).toBeDisabled()
      expect(input.className).toContain('opacity-40')
    })

    it('prevents typing and dropdown toggling, and never calls onChange', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isDisabled />)
      const input = getDateInput()
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      expect(button).toBeDisabled()
      // user-event no-ops (or throws, depending on version) on a disabled
      // element rather than dispatching events through it — either way,
      // nothing should reach onChange.
      await typeInto(user, input, '2026-07-15').catch(() => {})
      await user.click(button).catch(() => {})

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('isReadOnly', () => {
    it('renders as read-only, distinct from disabled, and stays focusable', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} isReadOnly />)
      const input = getDateInput()
      expect(input).toHaveAttribute('readonly')
      expect(input).not.toBeDisabled()
    })

    it('blocks commit and dropdown toggling while read-only, and never calls onChange', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} isReadOnly showDropdownButton={false} />)
      const input = getDateInput()

      input.focus()
      await user.keyboard('{Enter}')

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('isRequired (default true) — immediate empty-block', () => {
    it("snaps to today's date immediately (not the previous value) when cleared", async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const input = getDateInput()

      await user.clear(input)

      expect(input).not.toHaveValue('')
    })

    it('allows clearing to null when isRequired is false', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
      const input = getDateInput()

      await user.clear(input)
      // Emptied, and still being edited -- so the groups show rather than the
      // field going blank mid-edit.
      expect(input).toHaveValue('____-__-__')

      await user.tab()
      expect(input).toHaveValue('')
      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('group typing', () => {
    function press(input: HTMLInputElement, ...keys: string[]) {
      for (const key of keys) fireEvent.keyDown(input, { key })
    }

    function focused(props: Partial<Parameters<typeof InputDate>[0]> = {}) {
      render(<InputDate defaultValue={null} isRequired={false} {...props} />)
      const input = getDateInput() as HTMLInputElement
      act(() => {
        input.focus()
      })
      return input
    }

    it('fills a year out to the right as it is typed', () => {
      const input = focused()

      press(input, '2')
      // A year reads most-significant-first, and the positions it hasn't
      // reached yet stay fillers -- so typing the zeros of 2006 is visible.
      expect(input).toHaveValue('2___-__-__')

      press(input, '0')
      expect(input).toHaveValue('20__-__-__')
      press(input, '0', '6')
      expect(input).toHaveValue('2006-__-__')
    })

    it('right-aligns the month and day, which do have a range', () => {
      const input = focused()

      press(input, '2', '0', '2', '6', '7')
      // "7" can only be July, so the month finishes and pads on the left.
      expect(input).toHaveValue('2026-07-__')

      press(input, '4')
      expect(input).toHaveValue('2026-07-04')
    })

    it('commits the date the groups were showing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={null} onChange={onChange} isRequired={false} />)
      const input = getDateInput() as HTMLInputElement
      act(() => {
        input.focus()
      })

      // A year only fills at four digits, so the separator is how you leave
      // it early -- and it commits as the 2000 it was showing.
      press(input, '2', '-', '7', '4')
      expect(input).toHaveValue('2000-07-04')

      await user.tab()
      expect(onChange).toHaveBeenCalledWith(new Date(2000, 6, 4))
    })

    it('clears the last group too, instead of snapping the field back under the user', () => {
      // Reported: 30/07/2026, delete the year, delete the month, then the day
      // refuses to go -- it was the required-field snap refilling every group
      // the moment the last one emptied.
      render(<InputDate defaultValue={new Date(2026, 6, 30)} format="d/m/Y" />)
      const input = getDateInput() as HTMLInputElement
      act(() => {
        input.focus()
      })

      press(input, 'End')
      press(input, 'Backspace')
      expect(input).toHaveValue('30/07/____')
      press(input, 'Backspace')
      expect(input).toHaveValue('30/__/____')
      press(input, 'Backspace')
      expect(input).toHaveValue('__/__/____')
    })

    it('still refuses to leave a required field empty once it is left', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate defaultValue={new Date(2026, 6, 30)} onChange={onChange} format="d/m/Y" />)
      const input = getDateInput() as HTMLInputElement
      act(() => {
        input.focus()
      })

      press(input, 'End', 'Backspace', 'Backspace', 'Backspace')
      await user.tab()

      // Back to the date it held: emptying the groups doesn't commit null on
      // a required field, it just doesn't fight the deletion while editing.
      expect(input).toHaveValue('30/07/2026')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps the group the user was in after an Arrow step', () => {
      vi.useFakeTimers()
      render(<InputDate defaultValue={new Date(2026, 6, 15)} format="Y-m-d" />)
      const input = getDateInput() as HTMLInputElement
      act(() => {
        input.focus()
      })
      // Landing on the leading group is applied on a deferred macrotask.
      act(() => {
        vi.advanceTimersByTime(0)
      })

      // Sitting in the month, then stepping the whole date by a day.
      press(input, 'ArrowRight')
      press(input, 'ArrowUp')
      expect(input).toHaveValue('2026-07-16')

      // Re-seeding used to put the highlight wherever the new text ended, so
      // this digit landed in the day instead of the month.
      press(input, '9')
      expect(input).toHaveValue('2026-09-16')
      vi.useRealTimers()
    })

    it('types a full date straight through, separators and all', () => {
      const input = focused({ format: 'd/m/Y' })

      press(input, '2', '2', '/', '0', '7', '/', '2', '0', '2', '6')
      expect(input).toHaveValue('22/07/2026')
    })
  })

  describe('placeholder', () => {
    it('falls back to the format as an empty mask', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="d/m/Y" />)
      expect(getDateInput()).toHaveAttribute('placeholder', '__/__/____')
    })

    it('follows the format, separators and widths included', () => {
      render(<InputDate defaultValue={null} isRequired={false} format="j/n/y" />)
      // Unpadded tokens still occupy their full width, so the shape shown is
      // the shape typing produces.
      expect(getDateInput()).toHaveAttribute('placeholder', '__/__/__')
    })

    it('renders the default format, whose own separator is also the filler', () => {
      render(<InputDate defaultValue={null} isRequired={false} />)
      // "Y-m-d" comes out as ten dashes: the groups and the separators are
      // the same character, so nothing distinguishes them.
      expect(getDateInput()).toHaveAttribute('placeholder', '____-__-__')
    })

    it('shows none for a format the mask cannot describe', () => {
      // "F j, Y" spells the month out, so there is no fixed-width shape to
      // show -- and inventing one would promise typing this format supports.
      render(<InputDate defaultValue={null} isRequired={false} format="F j, Y" />)
      expect(getDateInput()).not.toHaveAttribute('placeholder')
    })

    it('leaves a consumer-supplied placeholder alone', () => {
      render(<InputDate defaultValue={null} isRequired={false} placeholder="วันเกิด" />)
      expect(getDateInput()).toHaveAttribute('placeholder', 'วันเกิด')
    })
  })

  describe('text (two-way binding for the displayed draft)', () => {
    it('displays the controlled text prop instead of the formatted value', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} text="not-a-real-date" />)
      expect(getDateInput()).toHaveValue('not-a-real-date')
    })

    it('calls onTextChange as the user types', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()
      render(
        <InputDate value={new Date(2026, 6, 1)} onChange={() => {}} onTextChange={onTextChange} isRequired={false} />,
      )
      const input = getDateInput()

      await user.clear(input)
      await typeInto(user, input, '5')

      // What the field is showing, groups and all -- the "5" landed in the
      // year, whose remaining positions are still fillers.
      expect(onTextChange).toHaveBeenCalled()
      expect(onTextChange.mock.calls[onTextChange.mock.calls.length - 1][0]).toBe('5___-__-__')
    })
  })

  describe('handleWheel', () => {
    it('does not step on wheel by default', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const input = getDateInput()

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps by one day per wheel notch while focused when enabled', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} handleWheel />)
      const input = getDateInput()

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16))
    })

    it('ignores wheel events while unfocused even when enabled', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} handleWheel />)
      const input = getDateInput()

      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('calendar popup state / monthCount', () => {
    it('tracks the popup state on aria-expanded as the user opens and closes it', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      const input = getDateInput()
      const button = screen.getByRole('button', { name: 'Toggle calendar' })
      expect(input).toHaveAttribute('aria-expanded', 'false')

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'true')

      await user.click(button)
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    it('keeps the month as a dropdown you can pick from', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 0, 15)} onChange={() => {}} />)

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))

      // flatpickr's monthSelectorType is left at its default rather than
      // 'static': the reference uses static (a plain span, no gap before
      // the year) but that costs the dropdown, so the gap is closed in CSS
      // instead — see flatpickr-theme.css.
      const monthSelect = document.querySelector('.flatpickr-calendar .flatpickr-monthDropdown-months')
      expect(monthSelect).not.toBeNull()
      expect(monthSelect?.tagName).toBe('SELECT')
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
      const input = getDateInput()
      expect(input).toHaveAttribute('aria-haspopup', 'dialog')
      expect(input).toHaveAttribute('aria-autocomplete', 'none')
      expect(input).toHaveAttribute('aria-expanded', 'false')
    })

    it('passes a consumer-supplied aria-describedby straight through', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} aria-describedby="external-id" />)
      expect(getDateInput()).toHaveAttribute('aria-describedby', 'external-id')
    })

    it('omits aria-describedby entirely when the consumer supplies none', () => {
      render(<InputDate value={new Date(2026, 6, 1)} onChange={() => {}} />)
      expect(getDateInput()).not.toHaveAttribute('aria-describedby')
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
    it('appends an opened calendar to document body so card overflow cannot clip it', async () => {
      const user = userEvent.setup()
      const { container } = render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)

      await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))

      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!
      expect(calendar.parentElement).toBe(document.body)
      expect(container).not.toContainElement(calendar)
    })

    it('labels the calendar dialog by default and supports a custom label', () => {
      const { rerender } = render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!

      expect(calendar).toHaveAttribute('aria-label', 'Calendar')

      rerender(
        <InputDate value={new Date(2026, 6, 15)} onChange={() => {}} calendarAriaLabel="Booking date calendar" />,
      )
      expect(calendar).toHaveAttribute('aria-label', 'Booking date calendar')
    })

    it('connects the combobox to an exposed popup and keeps its toggle tabbable', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)
      const input = getDateInput()
      const button = screen.getByRole('button', { name: 'Toggle calendar' })
      const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')

      expect(calendar).not.toBeNull()
      expect(input).toHaveAttribute('aria-controls', calendar!.id)
      expect(calendar!.closest('[aria-hidden="true"]')).toBeNull()
      expect(button.tabIndex).toBe(0)

      await user.tab()
      expect(input).toHaveFocus()
      await user.tab()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')

      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens the calendar and commits the clicked day', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} />)
      const button = screen.getByRole('button', { name: 'Toggle calendar' })

      await user.click(button)
      expect(getDateInput()).toHaveAttribute('aria-expanded', 'true')

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
      const input = getDateInput()
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
      const input = getDateInput()
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
      const input = getDateInput()
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
      expect(getDateInput()).toHaveValue('2569-07-22')
    })

    it('commits a typed Buddhist year to the correct Gregorian date', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 1)} onChange={onChange} locale="th" isRequired={false} />)
      const input = getDateInput()

      await user.clear(input)
      await typeInto(user, input, '2569-07-15')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 15))
    })

    it('does not affect English locale (default) formatting', () => {
      render(<InputDate value={new Date(2026, 6, 22)} onChange={() => {}} />)
      expect(getDateInput()).toHaveValue('2026-07-22')
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

  describe('text the field is given rather than typed', () => {
    // Typing goes through the groups (or is refused outright for a format
    // they can't describe), so what reaches onChange is browser autofill, a
    // form library assigning `value`, or an IME commit at an unfocused field.
    // Those are taken as-is and validated at commit, like any other value.
    it('accepts an autofilled date and commits it', () => {
      const onChange = vi.fn()
      render(<InputDate value={null} onChange={onChange} isRequired={false} />)
      const input = getDateInput() as HTMLInputElement

      fireEvent.change(input, { target: { value: '2026-07-22' } })
      expect(input).toHaveValue('2026-07-22')

      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 22))
    })

    it('reverts autofilled text that is not a date in this format', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} isRequired={false} />)
      const input = getDateInput() as HTMLInputElement

      fireEvent.change(input, { target: { value: 'not a date' } })
      fireEvent.blur(input)

      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('2026-07-15')
    })

    it('snaps a required field back when it is emptied', () => {
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} format="F j, Y" />)
      const input = getDateInput() as HTMLInputElement

      fireEvent.change(input, { target: { value: '' } })

      expect(input).not.toHaveValue('')
    })
  })

  describe('a format the groups cannot describe is picked, not typed', () => {
    it('refuses text entry but keeps the calendar live', async () => {
      const user = userEvent.setup()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} format="F j, Y" />)
      const input = getDateInput() as HTMLInputElement

      // "July 15, 2026" can't be read back by the parser, so accepting
      // keystrokes would only ever produce text that fails to commit.
      expect(input).toHaveAttribute('readonly')
      await typeInto(user, input, '9')
      expect(input).toHaveValue('July 15, 2026')

      // Still a live control, unlike isReadOnly: the popup opens from the
      // field itself, and Arrow keys still step the value.
      await user.click(input)
      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    it('still steps with the Arrow keys', () => {
      const onChange = vi.fn()
      render(<InputDate value={new Date(2026, 6, 15)} onChange={onChange} format="F j, Y" />)
      const input = getDateInput()

      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16))
      expect(input).toHaveValue('July 16, 2026')
    })

    it('leaves a format the groups can describe typeable', () => {
      render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} format="d/m/Y" />)
      expect(getDateInput()).not.toHaveAttribute('readonly')
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
