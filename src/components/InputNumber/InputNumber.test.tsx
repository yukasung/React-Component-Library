import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputNumber } from './InputNumber'

describe('InputNumber', () => {
  it('passes through id, name, placeholder, and className', () => {
    render(
      <InputNumber id="qty" name="quantity" placeholder="Enter a number" className="custom" />,
    )
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('id', 'qty')
    expect(input).toHaveAttribute('name', 'quantity')
    expect(input).toHaveAttribute('placeholder', 'Enter a number')
    expect(input.className).toContain('custom')
  })

  it('displays a controlled value', () => {
    render(<InputNumber value={42} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('42')
  })

  it('updates the displayed value while typing without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '12')

    expect(input).toHaveValue('12')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '25')
    await user.tab()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('commits on Enter without losing focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '7')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(7)
    expect(input).toHaveFocus()
  })

  it('does not re-fire onChange on blur immediately after an Enter commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '7')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.tab() // blurs without any further edit
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not re-fire onChange on blur immediately after an Arrow key commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.tab() // blurs without any further edit
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reverts an unparseable draft on blur without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '-')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')
  })

  it('discards an in-progress edit on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '99')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when the field is cleared and blurred', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('works uncontrolled via defaultValue', async () => {
    const user = userEvent.setup()
    render(<InputNumber defaultValue={3} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('3')

    await user.clear(input)
    await user.type(input, '9')
    await user.tab()

    expect(input).toHaveValue('9')
  })

  it('resyncs the displayed value when the external value prop changes', () => {
    const { rerender } = render(<InputNumber value={1} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('1')

    rerender(<InputNumber value={9} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('9')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputNumber ref={ref} value={1} onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('clamps a typed value above max down to max on commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} max={10} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '99')
    expect(input).toHaveValue('99')

    await user.tab()

    expect(onChange).toHaveBeenCalledWith(10)
    expect(input).toHaveValue('10')
  })

  it('clamps a typed value below min up to min on commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // min is negative here (rather than 0) so the minus key isn't blocked
    // outright by the sign-toggle feature (DEV-51) — this test is about
    // commit-time clamping, not about whether "-" is typeable at all.
    render(<InputNumber value={5} min={-20} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '-99')

    await user.tab()

    expect(onChange).toHaveBeenCalledWith(-20)
    expect(input).toHaveValue('-20')
  })

  it('does not clamp an empty (null) commit even when min/max are set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} min={0} max={10} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('increments by the default step (1) on ArrowUp and commits immediately', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith(6)
    expect(input).toHaveValue('6')
  })

  it('decrements by a custom step on ArrowDown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} step={2} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowDown}')

    expect(onChange).toHaveBeenCalledWith(3)
    expect(input).toHaveValue('3')
  })

  it('clamps ArrowUp/ArrowDown stepping at min/max', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={10} min={0} max={10} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowUp}')
    // already at max — the clamped step is a no-op, so onChange must not fire
    expect(onChange).not.toHaveBeenCalled()

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('avoids floating-point drift when stepping by a fractional step', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={0.1} step={0.1} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(0.2)

    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(0.3)
  })

  it('steps from the in-progress typed draft, not the last committed value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '20')
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith(21)
  })

  it('renders as a disabled input with disabled styling', () => {
    render(<InputNumber value={5} disabled onChange={() => {}} />)
    const input = screen.getByRole('textbox')

    expect(input).toBeDisabled()
    expect(input).toHaveClass('disabled:opacity-40')
  })

  it('prevents typing and never calls onChange while disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} disabled onChange={onChange} />)
    const input = screen.getByRole('textbox')

    // user-event no-ops (or throws, depending on version) on a disabled
    // element rather than dispatching events through it — either way,
    // nothing should reach onChange or change the displayed value.
    await user.type(input, '9').catch(() => {})
    await user.click(input).catch(() => {})
    await user.keyboard('{ArrowUp}').catch(() => {})

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')
  })

  it('renders as read-only, distinct from disabled, and stays focusable', () => {
    render(<InputNumber value={5} readOnly onChange={() => {}} />)
    const input = screen.getByRole('textbox')

    expect(input).toHaveAttribute('readonly')
    expect(input).not.toBeDisabled()
    expect(input).toHaveClass('read-only:bg-gray-50')

    input.focus()
    expect(input).toHaveFocus()
  })

  it('blocks typing and Arrow key stepping while read-only, and never calls onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} readOnly onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.type(input, '9').catch(() => {})
    expect(input).toHaveValue('5')

    input.focus()
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')
  })

  it('allows clearing to null when not required (default)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
    expect(input).toHaveValue('')
  })

  it('reverts instead of committing null when cleared and required', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} required onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')
  })

  it('still commits a valid non-empty value when required', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} required onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '8')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(8)
    expect(input).toHaveValue('8')
  })

  it('renders spin buttons by default and steps the value on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Increase value' }))
    expect(onChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByRole('button', { name: 'Decrease value' }))
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('renders no spin buttons when showSpinButtons is false, but Arrow keys still work', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} showSpinButtons={false} onChange={onChange} />)

    expect(screen.queryByRole('button', { name: 'Increase value' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decrease value' })).not.toBeInTheDocument()

    screen.getByRole('textbox').focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('disables spin buttons at min/max boundaries', () => {
    render(<InputNumber value={10} min={0} max={10} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).not.toBeDisabled()
  })

  it('disables spin buttons when the field is disabled or read-only', () => {
    const { rerender } = render(<InputNumber value={5} onChange={() => {}} disabled />)
    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).toBeDisabled()

    rerender(<InputNumber value={5} onChange={() => {}} readOnly />)
    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).toBeDisabled()
  })

  it('keeps focus on the input when clicking a spin button', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={5} onChange={() => {}} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.click(screen.getByRole('button', { name: 'Increase value' }))

    expect(input).toHaveFocus()
  })

  it('displays the committed value fixed to the given precision', () => {
    render(<InputNumber value={3} precision={2} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('3.00')
  })

  it('does not reformat the live draft to the given precision while typing', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={3} precision={2} onChange={() => {}} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '3.1')

    expect(input).toHaveValue('3.1')
  })

  it('rounds a typed value to the given precision on commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={3} precision={2} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    await user.clear(input)
    await user.type(input, '3.14159')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(3.14)
    expect(input).toHaveValue('3.14')
  })

  it('an explicit precision prop overrides precision inferred from step', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} step={0.1} precision={3} onChange={onChange} />)
    const input = screen.getByRole('textbox')

    input.focus()
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith(1.1)
    expect(input).toHaveValue('1.100')
  })

  it('passes through aria-label, aria-labelledby, and aria-invalid', () => {
    render(
      <>
        <span id="qty-label">Quantity</span>
        <InputNumber
          value={5}
          onChange={() => {}}
          aria-label="Quantity input"
          aria-labelledby="qty-label"
          aria-invalid
        />
      </>,
    )
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-label', 'Quantity input')
    expect(input).toHaveAttribute('aria-labelledby', 'qty-label')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders hint text wired to the input via aria-describedby', () => {
    render(<InputNumber value={5} onChange={() => {}} hint="Enter a whole number" />)
    const input = screen.getByRole('textbox')
    const hint = screen.getByText('Enter a whole number')

    expect(hint).toHaveAttribute('id')
    expect(input).toHaveAttribute('aria-describedby', hint.id)
  })

  it('merges a consumer-supplied aria-describedby with the generated hint id', () => {
    render(
      <>
        <span id="extra-desc">Extra description</span>
        <InputNumber
          value={5}
          onChange={() => {}}
          hint="Enter a whole number"
          aria-describedby="extra-desc"
        />
      </>,
    )
    const input = screen.getByRole('textbox')
    const hint = screen.getByText('Enter a whole number')

    expect(input.getAttribute('aria-describedby')).toBe(`extra-desc ${hint.id}`)
  })

  it('omits aria-describedby entirely when there is no hint and no consumer value', () => {
    render(<InputNumber value={5} onChange={() => {}} />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby')
  })

  describe('repeatButtons', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('repeats stepping while a spin button is held past the initial delay', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} />)
      const upButton = screen.getByRole('button', { name: 'Increase value' })

      fireEvent.mouseDown(upButton)
      // one advance call so the interval scheduled after the initial delay
      // is picked up within the same virtual-clock sweep: delay (400) + 2
      // repeat ticks (80 each) = 5 -> 6 -> 7. Wrapped in act() so React
      // flushes the state update from each tick before the next fires.
      act(() => {
        vi.advanceTimersByTime(400 + 80 + 80)
      })
      fireEvent.mouseUp(upButton)
      fireEvent.click(upButton) // trailing click after mouseup

      // the trailing click must not add a 3rd step on top of the 2 repeats
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenLastCalledWith(7)
    })

    it('a quick click released before the initial delay still steps exactly once', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} />)
      const upButton = screen.getByRole('button', { name: 'Increase value' })

      fireEvent.mouseDown(upButton)
      fireEvent.mouseUp(upButton) // released well before the 400ms delay
      fireEvent.click(upButton)

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(6)
    })

    it('does not repeat when repeatButtons is false, even when held', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputNumber value={5} repeatButtons={false} onChange={onChange} />)
      const upButton = screen.getByRole('button', { name: 'Increase value' })

      fireEvent.mouseDown(upButton)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      fireEvent.mouseUp(upButton)
      fireEvent.click(upButton)

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(6)
    })

    it('stops repeating once the value reaches max while held', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputNumber value={9} max={10} onChange={onChange} />)
      const upButton = screen.getByRole('button', { name: 'Increase value' })

      fireEvent.mouseDown(upButton)
      // delay (400) + tick 1 (9 -> 10) + tick 2 (already at max, no-op) + tick 3
      act(() => {
        vi.advanceTimersByTime(400 + 80 + 80 + 80)
      })
      fireEvent.mouseUp(upButton)

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith(10)
    })
  })

  describe('handleWheel', () => {
    it('does nothing by default (handleWheel is off) even when focused', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps up on scroll-up and down on scroll-down when enabled and focused', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} handleWheel onChange={onChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).toHaveBeenCalledWith(6)

      fireEvent.wheel(input, { deltaY: 100 })
      expect(onChange).toHaveBeenLastCalledWith(5)
    })

    it('does nothing when enabled but the field is not focused', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} handleWheel onChange={onChange} />)
      const input = screen.getByRole('textbox')

      // deliberately not focused
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('does nothing when enabled and focused but disabled or read-only', () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <InputNumber value={5} handleWheel disabled onChange={onChange} />,
      )
      let input = screen.getByRole('textbox')
      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()

      rerender(<InputNumber value={5} handleWheel readOnly onChange={onChange} />)
      input = screen.getByRole('textbox')
      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('respects clamping at min/max', () => {
      const onChange = vi.fn()
      render(<InputNumber value={10} min={0} max={10} handleWheel onChange={onChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      // already at max — the clamped step is a no-op, so onChange must not fire
      expect(onChange).not.toHaveBeenCalled()
    })

    it('stops applying once the field loses focus', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} handleWheel onChange={onChange} />)
      const input = screen.getByRole('textbox')

      fireEvent.focus(input)
      fireEvent.blur(input) // commits the (unchanged) value once, as blur always does
      const callsAfterBlur = onChange.mock.calls.length

      fireEvent.wheel(input, { deltaY: -100 })

      // the wheel event itself must not add any further call once unfocused
      expect(onChange).toHaveBeenCalledTimes(callsAfterBlur)
    })
  })

  describe('truncate', () => {
    it('rounds excess decimals by default on commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={0} precision={1} onChange={onChange} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, '2.999')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(3)
      expect(input).toHaveValue('3.0')
    })

    it('truncates instead of rounding when truncate is set', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={0} precision={1} truncate onChange={onChange} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, '2.999')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(2.9)
      expect(input).toHaveValue('2.9')
    })
  })

  describe('keystroke restriction', () => {
    it('blocks letters and symbols from ever being typed', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, 'abc')
      expect(input).toHaveValue('')

      await user.type(input, '12a3b')
      expect(input).toHaveValue('123')
    })

    it('still allows digits, a leading minus, and a single decimal point', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, '-12.5')
      expect(input).toHaveValue('-12.5')
    })

    it('blocks a second decimal point', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, '1.2.3')
      expect(input).toHaveValue('1.23')
    })
  })

  describe('sign toggle (- and +)', () => {
    it('toggles a leading "-" on when pressed with no selection', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(3, 3) // cursor at the end of "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-500')
    })

    it('toggles a leading "-" off when pressed again', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(3, 3)
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-500')

      input.setSelectionRange(4, 4)
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('500')
    })

    it('produces the same toggle result regardless of cursor position', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1) // cursor between "5" and "00" in "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-500')
    })

    it('clears the whole draft to just "-" when a selection is active', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(0, 2) // select "50" out of "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-')
    })

    it('does nothing when min does not allow negative values', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} min={0} onChange={onChange} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1)
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('5')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('"+" removes a leading "-" when present', () => {
      render(<InputNumber value={-500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      fireEvent.keyDown(input, { key: '+' })
      expect(input).toHaveValue('500')
    })

    it('"+" is a no-op when there is no leading "-"', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      fireEvent.keyDown(input, { key: '+' })
      expect(input).toHaveValue('500')
    })

    it('never inserts a literal "+" character via typing', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} />)
      const input = screen.getByRole('textbox')

      await user.clear(input)
      await user.type(input, '+5')
      expect(input).toHaveValue('5')
    })

    it('still reverts on blur when toggled to a lone "-" with nothing else typed', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} />)
      const input = screen.getByRole('textbox') as HTMLInputElement

      await user.clear(input)
      input.focus()
      input.setSelectionRange(0, 0)
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-')

      await user.tab()
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('5')
    })

    it('keeps the cursor next to the same digit when a leading "-" is added', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1) // cursor between "5" and "00"
      fireEvent.keyDown(input, { key: '-' })

      expect(input).toHaveValue('-500')
      // the "5" the cursor was after is now one character further along
      expect(input.selectionStart).toBe(2)
      expect(input.selectionEnd).toBe(2)
    })

    it('keeps the cursor next to the same digit when a leading "-" is removed', () => {
      render(<InputNumber value={-500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(2, 2) // cursor between "-5" and "00"
      fireEvent.keyDown(input, { key: '-' })

      expect(input).toHaveValue('500')
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(1)
    })

    it('keeps the cursor next to the same digit when "+" removes a leading "-"', () => {
      render(<InputNumber value={-500} onChange={() => {}} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      input.focus()
      input.setSelectionRange(2, 2) // cursor between "-5" and "00"
      fireEvent.keyDown(input, { key: '+' })

      expect(input).toHaveValue('500')
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(1)
    })
  })
})
