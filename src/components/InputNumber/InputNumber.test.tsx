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
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveAttribute('id', 'qty')
    expect(input).toHaveAttribute('name', 'quantity')
    expect(input).toHaveAttribute('placeholder', 'Enter a number')
    // className now styles the wrapper (the bordered box around the input
    // and spin buttons), not the input itself.
    expect(input.parentElement?.className).toContain('custom')
  })

  it('displays a controlled value', () => {
    render(<InputNumber value={42} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue('42')
  })

  it('updates the displayed value while typing without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '12')

    expect(input).toHaveValue('12')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the parsed value on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={1} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')

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
    render(<InputNumber value={1} step={1} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.tab() // blurs without any further edit
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reverts an unparseable draft on blur without committing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '99')
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits null when the field is cleared and blurred', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('works uncontrolled via defaultValue', async () => {
    const user = userEvent.setup()
    render(<InputNumber defaultValue={3} />)
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue('3')

    await user.clear(input)
    await user.type(input, '9')
    await user.tab()

    expect(input).toHaveValue('9')
  })

  it('resyncs the displayed value when the external value prop changes', () => {
    const { rerender } = render(<InputNumber value={1} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue('1')

    rerender(<InputNumber value={9} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue('9')
  })

  it('forwards the ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputNumber ref={ref} value={1} onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('blocks a keystroke that would push the typed value above max', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} max={10} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '99')
    // "9" is accepted (<= max); the second "9" would make it 99 (> max) and
    // is rejected outright — it never reaches the screen even momentarily.
    expect(input).toHaveValue('9')

    await user.tab()

    expect(onChange).toHaveBeenCalledWith(9)
    expect(input).toHaveValue('9')
  })

  it('blocks a keystroke that would push the typed value below min', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // min is negative here (rather than 0) so the minus key isn't blocked
    // outright by the sign-toggle feature (DEV-51) — this test is about
    // live min/max keystroke blocking, not about whether "-" is typeable.
    // isRequired={false} so user.clear() actually empties the field with a
    // full selection, rather than the required-field immediate-block snap
    // (which leaves a collapsed cursor, not a selection — see DEV-54).
    render(<InputNumber value={5} min={-20} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '-99')
    // "-9" is accepted (>= min); the second "9" would make it -99 (< min)
    // and is rejected outright.
    expect(input).toHaveValue('-9')

    await user.tab()

    expect(onChange).toHaveBeenCalledWith(-9)
    expect(input).toHaveValue('-9')
  })

  it('allows typing any value within min/max normally', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={5} min={0} max={100} onChange={() => {}} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '42')

    expect(input).toHaveValue('42')
  })

  it('does not block an in-progress draft that is not yet a complete number', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={null} min={-10} max={10} onChange={() => {}} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.keyboard('-')

    // "-" alone isn't a parseable number yet, so it isn't rejected as
    // "out of bounds" — only a keystroke that completes a real number
    // outside min/max gets blocked.
    expect(input).toHaveValue('-')
  })

  it('blocks a sign-toggle keystroke that would push the value out of bounds', () => {
    render(<InputNumber value={5} min={-3} max={10} onChange={() => {}} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    input.focus()
    input.setSelectionRange(1, 1)

    fireEvent.keyDown(input, { key: '-' })

    // Toggling "5" to "-5" would go below min (-3) — the toggle is rejected
    // and the draft stays untouched.
    expect(input).toHaveValue('5')
  })

  it('does not clamp an empty (null) commit even when min/max are set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} min={0} max={10} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('increments by step on ArrowUp and commits immediately', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} step={1} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith(6)
    expect(input).toHaveValue('6')
  })

  it('decrements by a custom step on ArrowDown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} step={2} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.keyboard('{ArrowDown}')

    expect(onChange).toHaveBeenCalledWith(3)
    expect(input).toHaveValue('3')
  })

  it('clamps ArrowUp/ArrowDown stepping at min/max', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={10} min={0} max={10} step={1} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(0.2)

    await user.keyboard('{ArrowUp}')
    expect(onChange).toHaveBeenLastCalledWith(0.3)
  })

  it('steps from the in-progress typed draft, not the last committed value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} step={1} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '20')
    await user.keyboard('{ArrowUp}')

    expect(onChange).toHaveBeenCalledWith(21)
  })

  it('renders as a disabled input with disabled styling', () => {
    render(<InputNumber value={5} isDisabled onChange={() => {}} />)
    const input = screen.getByRole('spinbutton')

    expect(input).toBeDisabled()
    // Disabled styling (opacity, background) lives on the wrapper now.
    expect(input.parentElement).toHaveClass('opacity-40')
  })

  it('prevents typing and never calls onChange while disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} isDisabled onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

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
    render(<InputNumber value={5} isReadOnly onChange={() => {}} />)
    const input = screen.getByRole('spinbutton')

    expect(input).toHaveAttribute('readonly')
    expect(input).not.toBeDisabled()
    // Read-only styling (background) lives on the wrapper now.
    expect(input.parentElement).toHaveClass('bg-gray-50')

    input.focus()
    expect(input).toHaveFocus()
  })

  it('blocks typing and Arrow key stepping while read-only, and never calls onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} isReadOnly onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    await user.type(input, '9').catch(() => {})
    expect(input).toHaveValue('5')

    input.focus()
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Enter}')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')
  })

  it('allows clearing to null when isRequired is false', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(null)
    expect(input).toHaveValue('')
  })

  it('snaps to 0 immediately (not the previous value) when cleared while isRequired (default)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />) // isRequired defaults to true
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    // snapped before blur even happens — matches Wijmo's live-blocking
    // behavior (DEV-53), not a "revert to previous value" like DEV-43's
    // original commit-time-only revert.
    expect(input).toHaveValue('0')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()

    expect(onChange).toHaveBeenCalledWith(0)
    expect(input).toHaveValue('0')
  })

  it('still commits a valid non-empty value when isRequired', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} isRequired onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '8')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(8)
    expect(input).toHaveValue('8')
  })

  it('renders spin buttons when step is set and steps the value on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} step={1} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Increase value' }))
    expect(onChange).toHaveBeenCalledWith(6)

    await user.click(screen.getByRole('button', { name: 'Decrease value' }))
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('renders no spin buttons and ignores Arrow keys when step is not set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={5} onChange={onChange} />)

    expect(screen.queryByRole('button', { name: 'Increase value' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Decrease value' })).not.toBeInTheDocument()

    screen.getByRole('spinbutton').focus()
    await user.keyboard('{ArrowUp}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables spin buttons at min/max boundaries', () => {
    render(<InputNumber value={10} min={0} max={10} step={1} onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).not.toBeDisabled()
  })

  it('disables spin buttons when the field is disabled or read-only', () => {
    const { rerender } = render(<InputNumber value={5} step={1} onChange={() => {}} isDisabled />)
    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).toBeDisabled()

    rerender(<InputNumber value={5} step={1} onChange={() => {}} isReadOnly />)
    expect(screen.getByRole('button', { name: 'Increase value' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease value' })).toBeDisabled()
  })

  it('keeps focus on the input when clicking a spin button', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={5} step={1} onChange={() => {}} />)
    const input = screen.getByRole('spinbutton')

    input.focus()
    await user.click(screen.getByRole('button', { name: 'Increase value' }))

    expect(input).toHaveFocus()
  })

  it('displays the committed value fixed to the given precision', () => {
    render(<InputNumber value={3} precision={2} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue('3.00')
  })

  it('does not reformat the live draft to the given precision while typing', async () => {
    const user = userEvent.setup()
    render(<InputNumber value={3} precision={2} onChange={() => {}} isRequired={false} />)
    const input = screen.getByRole('spinbutton')

    await user.clear(input)
    await user.type(input, '3.1')

    expect(input).toHaveValue('3.1')
  })

  it('rounds a typed value to the given precision on commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<InputNumber value={3} precision={2} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')

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
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveAttribute('aria-label', 'Quantity input')
    expect(input).toHaveAttribute('aria-labelledby', 'qty-label')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders hint text wired to the input via aria-describedby', () => {
    render(<InputNumber value={5} onChange={() => {}} hint="Enter a whole number" />)
    const input = screen.getByRole('spinbutton')
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
    const input = screen.getByRole('spinbutton')
    const hint = screen.getByText('Enter a whole number')

    expect(input.getAttribute('aria-describedby')).toBe(`extra-desc ${hint.id}`)
  })

  it('omits aria-describedby entirely when there is no hint and no consumer value', () => {
    render(<InputNumber value={5} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).not.toHaveAttribute('aria-describedby')
  })

  describe('repeatButtons', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('repeats stepping while a spin button is held past the initial delay', () => {
      vi.useFakeTimers()
      const onChange = vi.fn()
      render(<InputNumber value={5} step={1} onChange={onChange} />)
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
      render(<InputNumber value={5} step={1} onChange={onChange} />)
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
      render(<InputNumber value={5} step={1} repeatButtons={false} onChange={onChange} />)
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
      render(<InputNumber value={9} max={10} step={1} onChange={onChange} />)
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
      const input = screen.getByRole('spinbutton')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps up on scroll-up and down on scroll-down when enabled and focused', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} step={1} handleWheel onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).toHaveBeenCalledWith(6)

      fireEvent.wheel(input, { deltaY: 100 })
      expect(onChange).toHaveBeenLastCalledWith(5)
    })

    it('does nothing when enabled but the field is not focused', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} handleWheel onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      // deliberately not focused
      fireEvent.wheel(input, { deltaY: -100 })

      expect(onChange).not.toHaveBeenCalled()
    })

    it('does nothing when enabled and focused but disabled or read-only', () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <InputNumber value={5} handleWheel isDisabled onChange={onChange} />,
      )
      let input = screen.getByRole('spinbutton')
      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()

      rerender(<InputNumber value={5} handleWheel isReadOnly onChange={onChange} />)
      input = screen.getByRole('spinbutton')
      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('respects clamping at min/max', () => {
      const onChange = vi.fn()
      render(<InputNumber value={10} min={0} max={10} step={1} handleWheel onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      fireEvent.focus(input)
      fireEvent.wheel(input, { deltaY: -100 })

      // already at max — the clamped step is a no-op, so onChange must not fire
      expect(onChange).not.toHaveBeenCalled()
    })

    it('stops applying once the field loses focus', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} handleWheel onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

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
      const input = screen.getByRole('spinbutton')

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
      const input = screen.getByRole('spinbutton')

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
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, 'abc')
      expect(input).toHaveValue('')

      await user.type(input, '12a3b')
      expect(input).toHaveValue('123')
    })

    it('still allows digits, a leading minus, and a single decimal point', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '-12.5')
      expect(input).toHaveValue('-12.5')
    })

    it('never inserts a second decimal point', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      // Typing "1.2.3": the second "." (DEV-52) jumps the cursor back to
      // just after the first "." instead of inserting one — so the
      // trailing "3" lands right after the dot, not at the end.
      await user.type(input, '1.2.3')
      expect(input).toHaveValue('1.32')
    })
  })

  describe('sign toggle (- and +)', () => {
    it('toggles a leading "-" on when pressed with no selection', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(3, 3) // cursor at the end of "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-500')
    })

    it('toggles a leading "-" off when pressed again', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
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
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1) // cursor between "5" and "00" in "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-500')
    })

    it('clears the whole draft to just "-" when a selection is active', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(0, 2) // select "50" out of "500"
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('-')
    })

    it('does nothing when min does not allow negative values', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} min={0} onChange={onChange} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1)
      fireEvent.keyDown(input, { key: '-' })
      expect(input).toHaveValue('5')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('"+" removes a leading "-" when present', () => {
      render(<InputNumber value={-500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      fireEvent.keyDown(input, { key: '+' })
      expect(input).toHaveValue('500')
    })

    it('"+" is a no-op when there is no leading "-"', () => {
      render(<InputNumber value={500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      fireEvent.keyDown(input, { key: '+' })
      expect(input).toHaveValue('500')
    })

    it('never inserts a literal "+" character via typing', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '+5')
      expect(input).toHaveValue('5')
    })

    it('still reverts on blur when toggled to a lone "-" with nothing else typed', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement

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
      const input = screen.getByRole('spinbutton') as HTMLInputElement
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
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(2, 2) // cursor between "-5" and "00"
      fireEvent.keyDown(input, { key: '-' })

      expect(input).toHaveValue('500')
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(1)
    })

    it('keeps the cursor next to the same digit when "+" removes a leading "-"', () => {
      render(<InputNumber value={-500} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(2, 2) // cursor between "-5" and "00"
      fireEvent.keyDown(input, { key: '+' })

      expect(input).toHaveValue('500')
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(1)
    })
  })

  describe('decimal point (.) key', () => {
    it('jumps the cursor to just after an existing "." instead of inserting a second one', () => {
      const onChange = vi.fn()
      render(<InputNumber value={12.5} onChange={onChange} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(4, 4) // cursor at the end of "12.5"
      fireEvent.keyDown(input, { key: '.' })

      expect(input).toHaveValue('12.5')
      expect(input.selectionStart).toBe(3) // right after the "." at index 2
      expect(input.selectionEnd).toBe(3)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('jumps to just after the existing "." even when part of the draft is selected', () => {
      render(<InputNumber value={12.5} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(0, 2) // select "12"
      fireEvent.keyDown(input, { key: '.' })

      expect(input).toHaveValue('12.5') // unchanged, nothing cleared
      expect(input.selectionStart).toBe(3)
      expect(input.selectionEnd).toBe(3)
    })

    it('is fully blocked when precision is 0', () => {
      const onChange = vi.fn()
      render(<InputNumber value={5} precision={0} onChange={onChange} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1)
      fireEvent.keyDown(input, { key: '.' })

      expect(input).toHaveValue('5')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('fills an empty draft with "0." padded to the configured precision', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} precision={2} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement

      await user.clear(input)
      fireEvent.keyDown(input, { key: '.' })

      expect(input).toHaveValue('0.00')
      expect(input.selectionStart).toBe(2)
      expect(input.selectionEnd).toBe(2)
    })

    it('fills an empty draft with "0." when no precision is set', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      fireEvent.keyDown(input, { key: '.' })

      expect(input).toHaveValue('0.')
    })

    it('still types an ordinary decimal point normally when there is no existing dot', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={5} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '12.5')
      expect(input).toHaveValue('12.5')
    })
  })

  describe('isRequired (default true) — immediate empty-block', () => {
    it('defaults to isRequired, reflected as the native "required" input attribute', () => {
      render(<InputNumber value={5} onChange={() => {}} />)
      expect(screen.getByRole('spinbutton')).toHaveAttribute('required')
    })

    it('displays "0" instead of blank when there is no value (controlled null)', () => {
      render(<InputNumber value={null} onChange={() => {}} />)
      expect(screen.getByRole('spinbutton')).toHaveValue('0')
    })

    it('displays "0" instead of blank when uncontrolled with no defaultValue', () => {
      render(<InputNumber onChange={() => {}} />)
      expect(screen.getByRole('spinbutton')).toHaveValue('0')
    })

    it('snaps to "0" immediately while backspacing one character at a time, not just on select-all', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={7} onChange={onChange} />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      await user.keyboard('{Backspace}')

      expect(input).toHaveValue('0')
      expect(onChange).not.toHaveBeenCalled() // snap is display-only until commit
    })

    it('selects the auto-inserted "0" so the next keystroke can replace it', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={7} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement

      input.focus()
      await user.keyboard('{Backspace}')

      // fully selected, not just a collapsed cursor after it — real
      // browsers replace a selection with the next typed character.
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe(1)
    })

    it('isRequired={false} still allows the field to go and stay empty', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={7} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      expect(input).toHaveValue('')
    })
  })

  describe('format', () => {
    it('displays the committed value formatted per the .NET-style spec', () => {
      render(<InputNumber value={1234.5} onChange={() => {}} format="n2" />)
      expect(screen.getByRole('spinbutton')).toHaveValue('1,234.50')
    })

    it('applies currency formatting, wrapping negative values in parentheses', () => {
      render(<InputNumber value={-1234.5} onChange={() => {}} format="C2" />)
      expect(screen.getByRole('spinbutton')).toHaveValue('($1,234.50)')
    })

    it('wraps negative currency in parentheses live while typing, not just on commit', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={null} onChange={() => {}} isRequired={false} format="c0" />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      await user.keyboard('-1234')

      expect(input).toHaveValue('($1,234)')
    })

    it('shows the parentheses immediately when typing "-" produces exactly -0, not just once another digit follows', async () => {
      // Regression test: a "$0" field with the cursor right after "$"
      // (before the "0") — typing "-" there inserts it between them,
      // producing raw "$-0", which parses to the JS value -0. -0 fails a
      // plain `< 0` check, so before the isNegative() fix this silently
      // stayed "$0" instead of "($0)" until a second digit was typed.
      const user = userEvent.setup()
      render(<InputNumber value={0} onChange={() => {}} format="c0" />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      expect(input).toHaveValue('$0')

      input.focus()
      input.setSelectionRange(1, 1)
      await user.keyboard('-')

      expect(input).toHaveValue('($0)')
    })

    it('backspacing the closing paren of a negative currency value un-negates it', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={-5} onChange={onChange} format="c0" />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      await user.keyboard('{End}{Backspace}')

      expect(input).toHaveValue('$5')

      await user.keyboard('{Enter}')
      expect(onChange).toHaveBeenLastCalledWith(5)
    })

    it('backspacing right after the opening paren of a negative currency value also un-negates it', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={-5} onChange={() => {}} format="c0" />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement

      input.focus()
      input.setSelectionRange(1, 1)
      await user.keyboard('{Backspace}')

      expect(input).toHaveValue('$5')
    })

    it('pressing "-" toggles the sign of a currency value from anywhere in the draft, not just before the first digit', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={1234.5} onChange={() => {}} format="c2" />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement

      // Cursor placed after the decimal point, well past where a literal
      // "-" character could ever be validly inserted.
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
      await user.keyboard('-')

      expect(input).toHaveValue('($1,234.50)')
    })

    it('pressing "-" again toggles a negative currency value back to positive', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={-1234.5} onChange={() => {}} format="c2" />)
      const input = screen.getByRole('spinbutton') as HTMLInputElement
      expect(input).toHaveValue('($1,234.50)')

      input.focus()
      input.setSelectionRange(1, 1)
      await user.keyboard('-')

      expect(input).toHaveValue('$1,234.50')
    })

    it('pressing "-" toggles percent and plain-number formats from anywhere in the draft too', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<InputNumber value={0.5} onChange={() => {}} format="p0" />)
      let input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(1, 1)
      await user.keyboard('-')
      expect(input).toHaveValue('-50%')

      rerender(<InputNumber value={1234.5} onChange={() => {}} format="n2" />)
      input = screen.getByRole('spinbutton') as HTMLInputElement
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
      await user.keyboard('-')
      expect(input).toHaveValue('-1,234.50')
    })

    it('applies percent formatting (multiplies the value by 100 for display)', () => {
      render(<InputNumber value={0.4268} onChange={() => {}} format="p1" />)
      expect(screen.getByRole('spinbutton')).toHaveValue('42.7%')
    })

    it('reformats live while typing, not just on commit', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={null} onChange={() => {}} isRequired={false} format="n0" />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '1234')

      expect(input).toHaveValue('1,234')
    })

    it('commits the true underlying number, not the decorated display string', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={null} onChange={onChange} isRequired={false} format="c2" />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '150{Enter}')

      expect(input).toHaveValue('$150.00')
      expect(onChange).toHaveBeenLastCalledWith(150)
    })

    it('divides typed percent input by 100 for the committed value', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={null} onChange={onChange} isRequired={false} format="p0" />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '50{Enter}')

      expect(onChange).toHaveBeenLastCalledWith(0.5)
    })

    it("format's own precision digit overrides the separate precision prop", () => {
      render(<InputNumber value={1.5} onChange={() => {}} format="n3" precision={0} />)
      expect(screen.getByRole('spinbutton')).toHaveValue('1.500')
    })

    it('rejects keystrokes that are not part of a parseable number', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={10} onChange={() => {}} format="n0" />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      await user.keyboard('x')

      expect(input).toHaveValue('10')
    })

    it('blocks keystrokes that would exceed min/max, live, under a format', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={5} onChange={onChange} format="n0" min={0} max={10} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '999{Enter}')

      expect(onChange).toHaveBeenLastCalledWith(9)
      expect(input).toHaveValue('9')
    })
  })

  describe('ARIA spinbutton attributes', () => {
    it('exposes role, aria-valuenow, and aria-valuetext for the committed value', () => {
      render(<InputNumber value={42} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton')

      expect(input).toHaveAttribute('aria-valuenow', '42')
      expect(input).toHaveAttribute('aria-valuetext', '42')
    })

    it('mirrors the formatted display text in aria-valuetext when format is set', () => {
      render(<InputNumber value={1234.5} onChange={() => {}} format="C2" />)
      const input = screen.getByRole('spinbutton')

      expect(input).toHaveAttribute('aria-valuenow', '1234.5')
      expect(input).toHaveAttribute('aria-valuetext', '$1,234.50')
    })

    it('omits aria-valuenow/aria-valuetext when there is no committed value', () => {
      render(<InputNumber value={null} onChange={() => {}} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      expect(input).not.toHaveAttribute('aria-valuenow')
      expect(input).not.toHaveAttribute('aria-valuetext')
    })

    it('sets aria-valuemin/aria-valuemax from the min/max props', () => {
      render(<InputNumber value={5} min={0} max={10} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton')

      expect(input).toHaveAttribute('aria-valuemin', '0')
      expect(input).toHaveAttribute('aria-valuemax', '10')
    })

    it('omits aria-valuemin/aria-valuemax when min/max are not set', () => {
      render(<InputNumber value={5} onChange={() => {}} />)
      const input = screen.getByRole('spinbutton')

      expect(input).not.toHaveAttribute('aria-valuemin')
      expect(input).not.toHaveAttribute('aria-valuemax')
    })

    it('updates aria-valuenow/aria-valuetext live while typing, before commit', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<InputNumber value={1} onChange={onChange} isRequired={false} />)
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '12')

      // Not committed yet — onChange hasn't fired — but the ARIA attributes
      // already reflect what's on screen, same as the visible text.
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveAttribute('aria-valuenow', '12')
      expect(input).toHaveAttribute('aria-valuetext', '12')
    })

    it('mirrors the live formatted draft in aria-valuetext while typing under a format', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={null} onChange={() => {}} isRequired={false} format="C2" />)
      const input = screen.getByRole('spinbutton')

      await user.type(input, '150')

      expect(input).toHaveAttribute('aria-valuenow', '150')
      expect(input).toHaveAttribute('aria-valuetext', '$150.00')
    })

    it('omits aria-valuenow while the draft is not yet a complete number', async () => {
      const user = userEvent.setup()
      render(<InputNumber value={null} onChange={() => {}} isRequired={false} min={-10} />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      await user.keyboard('-')

      expect(input).toHaveValue('-')
      expect(input).not.toHaveAttribute('aria-valuenow')
      expect(input).toHaveAttribute('aria-valuetext', '-')
    })
  })

  describe('text (two-way binding for the displayed draft)', () => {
    it('displays an externally-set text prop verbatim, without reformatting', () => {
      render(<InputNumber value={1234.5} onChange={() => {}} format="C2" text="not a number yet" />)
      expect(screen.getByRole('spinbutton')).toHaveValue('not a number yet')
    })

    it('overrides the draft when the text prop changes on rerender', () => {
      const { rerender } = render(<InputNumber value={5} onChange={() => {}} text="5" />)
      const input = screen.getByRole('spinbutton')
      expect(input).toHaveValue('5')

      rerender(<InputNumber value={5} onChange={() => {}} text="50" />)
      expect(input).toHaveValue('50')
    })

    it('does not force a commit — value/onChange are unaffected by an external text change', () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputNumber value={5} onChange={onChange} text="5" />)
      rerender(<InputNumber value={5} onChange={onChange} text="999" />)

      expect(screen.getByRole('spinbutton')).toHaveValue('999')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('calls onTextChange live while typing, not just on commit', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()
      render(
        <InputNumber value={null} onChange={() => {}} onTextChange={onTextChange} isRequired={false} />,
      )
      const input = screen.getByRole('spinbutton')

      await user.type(input, '12')

      expect(onTextChange).toHaveBeenCalledWith('1')
      expect(onTextChange).toHaveBeenCalledWith('12')
    })

    it('does not echo onTextChange back for a text prop change the consumer just made', () => {
      const onTextChange = vi.fn()
      const { rerender } = render(
        <InputNumber value={5} onChange={() => {}} text="5" onTextChange={onTextChange} />,
      )
      rerender(<InputNumber value={5} onChange={() => {}} text="50" onTextChange={onTextChange} />)

      expect(onTextChange).not.toHaveBeenCalled()
    })

    it('calls onTextChange on commit reformat (e.g. Enter padding out precision)', async () => {
      const user = userEvent.setup()
      const onTextChange = vi.fn()
      render(
        <InputNumber value={1} onChange={() => {}} onTextChange={onTextChange} precision={2} />,
      )
      const input = screen.getByRole('spinbutton')

      await user.clear(input)
      await user.type(input, '5{Enter}')

      expect(onTextChange).toHaveBeenLastCalledWith('5.00')
      expect(input).toHaveValue('5.00')
    })

    it('lets stepping and commit read off of an externally-set text value', async () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputNumber value={5} onChange={onChange} text="5" step={1} min={0} max={10} />)
      rerender(<InputNumber value={5} onChange={onChange} text="7" step={1} min={0} max={10} />)
      const input = screen.getByRole('spinbutton')

      input.focus()
      fireEvent.keyDown(input, { key: 'ArrowUp' })

      expect(onChange).toHaveBeenLastCalledWith(8)
    })
  })
})
