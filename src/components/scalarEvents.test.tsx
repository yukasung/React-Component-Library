import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputNumber } from './InputNumber/InputNumber'
import { InputDate } from './InputDate/InputDate'
import { InputTime } from './InputTime/InputTime'
import { InputDateTime } from './InputDateTime/InputDateTime'

const cases = [
  { name: 'number', Component: InputNumber, draft: '15' },
  { name: 'date', Component: InputDate, draft: '2026-09-08', format: 'Y-m-d' },
  { name: 'time', Component: InputTime, draft: '15:30', format: 'HH:mm' },
  { name: 'datetime', Component: InputDateTime, draft: '2026-09-08 15:30', format: 'Y-m-d H:i' },
]

describe.each(cases)('$name native events', ({ Component, draft, format }) => {
  it('calls focus and blur once, committing before the consumer blur callback', () => {
    const calls: string[] = []
    const onFocus = vi.fn((event: React.FocusEvent<HTMLInputElement>) => event.preventDefault())
    const onBlur = vi.fn((event: React.FocusEvent<HTMLInputElement>) => {
      event.preventDefault()
      calls.push('blur')
    })
    render(<Component isRequired={false} format={format} onFocus={onFocus} onBlur={onBlur} onChange={() => calls.push('change')} />)
    const input = document.querySelector('input')!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: draft } })
    fireEvent.blur(input)
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['change', 'blur'])
  })

  it('lets consumer key cancellation prevent committing and still commits on blur', () => {
    const onChange = vi.fn()
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>) => event.preventDefault())
    render(<Component isRequired={false} format={format} onKeyDown={onKeyDown} onChange={onChange} />)
    const input = document.querySelector('input')!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: draft } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

// Number has no pointer behavior to compose; its native props pass through.
describe.each(cases.slice(1))('$name pointer events', ({ Component, draft, format }) => {
  it('calls pointer consumers once and lets a canceled click preserve the caret', async () => {
    const onMouseDown = vi.fn((event: React.MouseEvent<HTMLInputElement>) => event.preventDefault())
    let cancelClick = true
    const onClick = vi.fn((event: React.MouseEvent<HTMLInputElement>) => {
      if (cancelClick) event.preventDefault()
    })
    render(<Component isRequired={false} format={format} onMouseDown={onMouseDown} onClick={onClick} />)
    const input = document.querySelector('input')!
    fireEvent.mouseDown(input)
    act(() => input.focus())
    fireEvent.change(input, { target: { value: draft } })
    await waitFor(() => expect(input.selectionStart).not.toBeNull())
    input.setSelectionRange(1, 1)
    fireEvent.click(input)
    expect(onMouseDown).toHaveBeenCalledTimes(1)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
    cancelClick = false
    fireEvent.click(input)
    expect(onClick).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(input.selectionEnd! - input.selectionStart!).toBeGreaterThan(0))
  })
})
