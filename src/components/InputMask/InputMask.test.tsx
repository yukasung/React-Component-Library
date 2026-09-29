import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InputMask } from './InputMask'

// Typing goes through keydown, because that is where the editor lives: the
// rendered text is ambiguous about what changed once prompt characters are in
// it, so `onChange` is left for input the keyboard cannot see.
function typeKeys(input: HTMLElement, keys: string) {
  for (const key of Array.from(keys)) fireEvent.keyDown(input, { key })
}

// Focusing starts the editing session, which is a state update — so it has
// to be flushed before the field shows anything.
function focus(input: HTMLElement) {
  act(() => {
    input.focus()
  })
}

function field(props: Partial<Parameters<typeof InputMask>[0]> = {}) {
  render(<InputMask aria-label="Field" mask="000-000" {...props} />)
  const input = screen.getByLabelText('Field') as HTMLInputElement
  focus(input)
  return input
}

describe('InputMask', () => {
  it('is a plain textbox, with no popup or spinbutton role', () => {
    render(<InputMask aria-label="Field" mask="000" />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('shows the mask shape as its placeholder when empty', () => {
    render(<InputMask aria-label="Field" mask="000-000" />)
    expect(screen.getByLabelText('Field')).toHaveAttribute('placeholder', '___-___')
  })

  it('lets a consumer placeholder win', () => {
    render(<InputMask aria-label="Field" mask="000-000" placeholder="phone" />)
    expect(screen.getByLabelText('Field')).toHaveAttribute('placeholder', 'phone')
  })

  describe('typing', () => {
    it('fills positions and steps over literals', () => {
      const input = field()
      typeKeys(input, '123456')
      expect(input).toHaveValue('123-456')
    })

    it('lets the literal be typed straight through', () => {
      const input = field()
      typeKeys(input, '123-456')
      expect(input).toHaveValue('123-456')
    })

    it('refuses a character the position will not take', () => {
      const onInvalidInput = vi.fn()
      const input = field({ onInvalidInput })
      typeKeys(input, '1a')
      expect(input).toHaveValue('1__-___')
      expect(onInvalidInput).toHaveBeenCalledWith({ reason: 'character', input: 'a', position: 1 })
    })
  })

  describe('the commit model', () => {
    it('does not fire onChange while typing', () => {
      const onChange = vi.fn()
      const input = field({ onChange })
      typeKeys(input, '123456')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('commits the raw value on blur', () => {
      const onChange = vi.fn()
      const input = field({ onChange })
      typeKeys(input, '123456')
      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledWith('123456')
    })

    it('commits on Enter', () => {
      const onChange = vi.fn()
      const input = field({ onChange })
      typeKeys(input, '123456')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onChange).toHaveBeenCalledWith('123456')
    })

    it('reverts an incomplete field rather than committing null', () => {
      const onChange = vi.fn()
      render(<InputMask aria-label="Field" mask="000-000" value="123456" onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      expect(input).toHaveValue('123-456')
      focus(input)
      fireEvent.keyDown(input, { key: 'Backspace' })
      fireEvent.blur(input)
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('123-456')
    })

    it('commits null for an emptied optional field', () => {
      const onChange = vi.fn()
      render(<InputMask aria-label="Field" mask="000" value="123" isRequired={false} onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      fireEvent.keyDown(input, { key: 'End' })
      for (let i = 0; i < 3; i++) fireEvent.keyDown(input, { key: 'Backspace' })
      expect(input).toHaveValue('___')
      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('reverts an emptied required field', () => {
      const onChange = vi.fn()
      render(<InputMask aria-label="Field" mask="000" value="123" onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      fireEvent.keyDown(input, { key: 'End' })
      for (let i = 0; i < 3; i++) fireEvent.keyDown(input, { key: 'Backspace' })
      fireEvent.blur(input)
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('123')
    })
  })

  describe('controlled and uncontrolled', () => {
    it('renders a controlled value positionally', () => {
      render(<InputMask aria-label="Field" mask="99-00" value="1 23" />)
      expect(screen.getByLabelText('Field')).toHaveValue('1_-23')
    })

    it('distinguishes values that differ only in a blank position', () => {
      const { rerender } = render(<InputMask aria-label="Field" mask="99-00" value="1 23" />)
      expect(screen.getByLabelText('Field')).toHaveValue('1_-23')
      rerender(<InputMask aria-label="Field" mask="99-00" value=" 123" />)
      expect(screen.getByLabelText('Field')).toHaveValue('_1-23')
    })

    it('does not re-fire onChange for an external value change', () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputMask aria-label="Field" mask="000" value="123" onChange={onChange} />)
      rerender(<InputMask aria-label="Field" mask="000" value="456" onChange={onChange} />)
      expect(onChange).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Field')).toHaveValue('456')
    })

    it('keeps its own value when uncontrolled', () => {
      const input = field({ mask: '000', defaultValue: null })
      typeKeys(input, '123')
      fireEvent.blur(input)
      expect(input).toHaveValue('123')
    })

    it('round-trips a committed value back through the value prop', () => {
      function Controlled() {
        const [value, setValue] = useState<string | null>(null)
        return <InputMask aria-label="Field" mask="99-00" value={value} onChange={setValue} />
      }
      render(<Controlled />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      fireEvent.keyDown(input, { key: 'ArrowRight' })
      typeKeys(input, '123')
      fireEvent.blur(input)
      expect(input).toHaveValue('_1-23')
    })
  })

  describe('states', () => {
    it('sets the native required attribute by default', () => {
      render(<InputMask aria-label="Field" mask="000" />)
      expect(screen.getByLabelText('Field')).toBeRequired()
    })

    it('blocks every change while read-only but stays focusable', () => {
      const onChange = vi.fn()
      render(<InputMask aria-label="Field" mask="000" value="123" isReadOnly onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      expect(input).toHaveFocus()
      typeKeys(input, '9')
      fireEvent.blur(input)
      expect(input).toHaveValue('123')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('is excluded from submission while disabled', () => {
      render(<InputMask aria-label="Field" mask="000" value="123" name="code" isDisabled />)
      expect(screen.getByLabelText('Field')).toBeDisabled()
    })
  })

  describe('inputMode', () => {
    it('is numeric for a digit-only mask', () => {
      render(<InputMask aria-label="Field" mask="000-0000" />)
      expect(screen.getByLabelText('Field')).toHaveAttribute('inputmode', 'numeric')
    })

    it('is text when the mask can take a sign', () => {
      render(<InputMask aria-label="Field" mask="+66 #########" />)
      expect(screen.getByLabelText('Field')).toHaveAttribute('inputmode', 'text')
    })

    it('lets a consumer override it', () => {
      render(<InputMask aria-label="Field" mask="000-0000" inputMode="tel" />)
      expect(screen.getByLabelText('Field')).toHaveAttribute('inputmode', 'tel')
    })
  })

  describe('keyboard shortcuts are not swallowed', () => {
    for (const key of ['c', 'v', 'x', 'a', 'z']) {
      it(`leaves Ctrl+${key} to the browser`, () => {
        const input = field()
        const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })
        act(() => {
          input.dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(false)
        expect(input).toHaveValue('___-___')
      })
    }

    it('still treats Shift as an ordinary modifier', () => {
      const input = field({ mask: '>LLL' })
      fireEvent.keyDown(input, { key: 'a', shiftKey: true })
      expect(input).toHaveValue('A__')
    })

    it('leaves a composing keydown alone', () => {
      const input = field()
      const event = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true })
      Object.defineProperty(event, 'isComposing', { value: true })
      act(() => {
        input.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('unmasked', () => {
    it('takes any text and commits it verbatim', () => {
      const onChange = vi.fn()
      render(<InputMask aria-label="Field" onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'anything at all' } })
      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledWith('anything at all')
    })

    it('has no placeholder and no prompt characters', () => {
      render(<InputMask aria-label="Field" />)
      const input = screen.getByLabelText('Field')
      expect(input).not.toHaveAttribute('placeholder')
      expect(input).toHaveValue('')
    })

    it('falls back to unmasked for a mask it cannot read', () => {
      render(<InputMask aria-label="Field" mask={'000\\'} />)
      const input = screen.getByLabelText('Field')
      expect(input).not.toHaveAttribute('placeholder')
      expect(input).toHaveAttribute('inputmode', 'text')
    })
  })

  describe('consumer event composition', () => {
    it('runs the consumer blur after the commit', () => {
      const calls: string[] = []
      const input = field({
        onChange: () => calls.push('change'),
        onBlur: () => calls.push('blur'),
      })
      typeKeys(input, '123456')
      fireEvent.blur(input)
      expect(calls).toEqual(['change', 'blur'])
    })

    it('lets a consumer cancel a keystroke', () => {
      const input = field({ onKeyDown: (event) => event.preventDefault() })
      typeKeys(input, '123')
      expect(input).toHaveValue('___-___')
    })
  })

  describe('the field stays masked while it is focused', () => {
    // Dropping the entry on Enter sent the next commit down the unmasked
    // branch, where the formatted text is itself a value.
    it('commits once on Enter and once more on blur, with the same value', () => {
      const onChange = vi.fn()
      const input = field({ mask: '00-00', onChange })
      typeKeys(input, '1234')
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.blur(input)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('1234')
    })

    it('keeps refusing what the mask refuses after Enter', () => {
      const onChange = vi.fn()
      const input = field({ mask: '00-00', onChange })
      typeKeys(input, '1234')
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.keyDown(input, { key: 'Home' })
      typeKeys(input, 'AB')
      fireEvent.blur(input)
      expect(input).toHaveValue('12-34')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    // Deleting a position is the proof, not typing one: the field is full,
    // and insert mode has nowhere to shift to, so a digit is rightly refused.
    it('keeps editing after Escape', () => {
      const input = field({ mask: '00-00', value: '1234' })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input).toHaveValue('12-34')
      fireEvent.keyDown(input, { key: 'Home' })
      fireEvent.keyDown(input, { key: 'Delete' })
      expect(input).toHaveValue('_2-34')
    })
  })

  describe('an external value change while focused', () => {
    it('replaces what the field is showing', () => {
      const { rerender } = render(<InputMask aria-label="Field" mask="00" value="12" />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      expect(input).toHaveValue('12')
      rerender(<InputMask aria-label="Field" mask="00" value="34" />)
      expect(input).toHaveValue('34')
    })

    it('is what the next commit reads', () => {
      const onChange = vi.fn()
      const { rerender } = render(<InputMask aria-label="Field" mask="00" value="12" onChange={onChange} />)
      const input = screen.getByLabelText('Field') as HTMLInputElement
      focus(input)
      rerender(<InputMask aria-label="Field" mask="00" value="34" onChange={onChange} />)
      fireEvent.blur(input)
      expect(onChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('34')
    })
  })

  it('does not report a separator it swallowed as invalid', () => {
    const onInvalidInput = vi.fn()
    const input = field({ mask: '00-00', onInvalidInput })
    typeKeys(input, '12-34')
    expect(input).toHaveValue('12-34')
    expect(onInvalidInput).not.toHaveBeenCalled()
  })

  describe('text', () => {
    it('is applied through the mask, not written verbatim', () => {
      render(<InputMask aria-label="Field" mask="00" text="AB" />)
      expect(screen.getByLabelText('Field')).toHaveValue('__')
    })

    it('is what editing starts from', () => {
      const input = field({ mask: '00', text: '9' })
      expect(input).toHaveValue('9_')
    })

    it('reports the text again when a revert puts it back', () => {
      const onTextChange = vi.fn()
      const input = field({ mask: '00', value: '12', overwriteMode: true, onTextChange })
      typeKeys(input, '3')
      expect(input).toHaveValue('32')
      onTextChange.mockClear()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input).toHaveValue('12')
      expect(onTextChange).toHaveBeenCalledWith('12')
    })
  })

  describe('keys the editor does not claim', () => {
    it('leaves Enter during a composition to the IME', () => {
      const onChange = vi.fn()
      const input = field({ mask: '00-00', onChange })
      typeKeys(input, '1234')
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      Object.defineProperty(event, 'isComposing', { value: true })
      act(() => {
        input.dispatchEvent(event)
      })
      expect(onChange).not.toHaveBeenCalled()
    })

    it('leaves a modified movement or deletion key to the browser', () => {
      const input = field({ mask: '000', value: '123' })
      for (const init of [{ key: 'Backspace', ctrlKey: true }, { key: 'ArrowLeft', metaKey: true }]) {
        const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
        act(() => {
          input.dispatchEvent(event)
        })
        expect(event.defaultPrevented).toBe(false)
      }
      expect(input).toHaveValue('123')
    })

    it('leaves Shift+Arrow to the browser so it can extend the selection', () => {
      const input = field({ mask: '000', value: '123' })
      fireEvent.keyDown(input, { key: 'End' })
      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true, cancelable: true })
      act(() => {
        input.dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
    })
  })

  it('forwards a ref to the input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputMask aria-label="Field" mask="000" ref={ref} />)
    expect(ref.current).toBe(screen.getByLabelText('Field'))
  })

  it('carries the scalar style scope and the consumer className', () => {
    render(<InputMask aria-label="Field" mask="000" className="custom" />)
    const input = screen.getByLabelText('Field')
    expect(input).toHaveClass('rc-scalar')
    expect(input).toHaveClass('custom')
  })

  describe('text the field is given rather than typed', () => {
    it('applies a paste through the mask', async () => {
      const user = userEvent.setup()
      const input = field()
      await user.paste('123456')
      expect(input).toHaveValue('123-456')
    })

    it('takes a formatted paste positionally', async () => {
      const user = userEvent.setup()
      const input = field({ mask: '99-00' })
      await user.paste('1_-23')
      expect(input).toHaveValue('1_-23')
    })
  })
})
