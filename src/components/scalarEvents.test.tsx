import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputNumber } from './InputNumber/InputNumber'
import { InputDate } from './InputDate/InputDate'
import { InputTime } from './InputTime/InputTime'
import { InputDateTime } from './InputDateTime/InputDateTime'
import { InputMask } from './InputMask/InputMask'
import { MultiSelect } from './MultiSelect/MultiSelect'

// `selectionOnClick` is what a non-cancelled click leaves behind. The group
// editors highlight the group the pointer landed in, so the selection has
// width; InputMask is a caret editor and collapses instead. Both still have
// to honour a cancelled click by preserving the caret, which is the contract
// this suite exists to protect — so the shape is per case rather than a
// reason to leave a control out.
const cases = [
  { name: 'number', Component: InputNumber, draft: '15' },
  { name: 'date', Component: InputDate, draft: '2026-09-08', format: 'Y-m-d' },
  { name: 'time', Component: InputTime, draft: '15:30', format: 'HH:mm' },
  { name: 'datetime', Component: InputDateTime, draft: '2026-09-08 15:30', format: 'Y-m-d H:i' },
  // A mask rather than a format, and a caret rather than a group highlight —
  // see selectionOnClick below.
  { name: 'mask', Component: InputMask, draft: '123456', mask: '000-000', selectionOnClick: 'caret' },
]

describe.each(cases)('$name native events', ({ Component, draft, format, mask }) => {
  it('calls focus and blur once, committing before the consumer blur callback', () => {
    const calls: string[] = []
    const onFocus = vi.fn((event: React.FocusEvent<HTMLInputElement>) => event.preventDefault())
    const onBlur = vi.fn((event: React.FocusEvent<HTMLInputElement>) => {
      event.preventDefault()
      calls.push('blur')
    })
    render(<Component isRequired={false} format={format} mask={mask} onFocus={onFocus} onBlur={onBlur} onChange={() => calls.push('change')} />)
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
    render(<Component isRequired={false} format={format} mask={mask} onKeyDown={onKeyDown} onChange={onChange} />)
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
describe.each(cases.slice(1))('$name pointer events', ({ Component, draft, format, mask, selectionOnClick }) => {
  it('calls pointer consumers once and lets a canceled click preserve the caret', async () => {
    const onMouseDown = vi.fn((event: React.MouseEvent<HTMLInputElement>) => event.preventDefault())
    let cancelClick = true
    const onClick = vi.fn((event: React.MouseEvent<HTMLInputElement>) => {
      if (cancelClick) event.preventDefault()
    })
    render(<Component isRequired={false} format={format} mask={mask} onMouseDown={onMouseDown} onClick={onClick} />)
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
    await waitFor(() => {
      const width = input.selectionEnd! - input.selectionStart!
      if (selectionOnClick === 'caret') expect(width).toBe(0)
      else expect(width).toBeGreaterThan(0)
    })
  })
})

// The cases above all commit by typing a draft into the field. MultiSelect has
// no draft — its <input> is readOnly and holds a derived header, and `change` is
// not a commit point for it — so forcing it into that array would assert a
// contract it is specified not to have. The event-composition contract §9.5
// exists to protect *does* apply to it, so it is asserted here rather than
// skipped.
//
// InputTag is deliberately absent: its `onBlur` is a declared prop rather than
// an InputHTMLAttributes passthrough and it takes required props of its own, so
// including it would mean changing or special-casing a shipped control.
describe('collection controls without a typed draft', () => {
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]

  it('runs focus and blur consumers once, with the commit before blur', () => {
    const calls: string[] = []
    const onFocus = vi.fn()
    const onBlur = vi.fn(() => calls.push('blur'))
    render(
      <MultiSelect
        aria-label="Options"
        options={options}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={() => calls.push('change')}
      />,
    )
    const input = document.querySelector('input')!
    fireEvent.focus(input)
    expect(onFocus).toHaveBeenCalledTimes(1)
    fireEvent.click(input)
    fireEvent.click(document.querySelectorAll('[role="option"]')[0])
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.blur(input, { relatedTarget: outside })
    outside.remove()
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['change', 'blur'])
  })

  it('lets consumer key cancellation prevent the popup opening', () => {
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLInputElement>) => event.preventDefault())
    render(<MultiSelect aria-label="Options" options={options} onKeyDown={onKeyDown} />)
    const input = document.querySelector('input')!
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('lets consumer click cancellation prevent the popup opening', () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLInputElement>) => event.preventDefault())
    render(<MultiSelect aria-label="Options" options={options} onClick={onClick} />)
    const input = document.querySelector('input')!
    fireEvent.click(input)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
