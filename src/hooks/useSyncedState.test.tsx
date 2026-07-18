import { describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { useSyncedState } from './useSyncedState'

function TestHarness({ value }: { value: number }) {
  const [localValue, setLocalValue] = useSyncedState(value)
  return (
    <button type="button" onClick={() => setLocalValue(localValue + 1)}>
      {localValue}
    </button>
  )
}

describe('useSyncedState', () => {
  it('reflects the initial value', () => {
    const { getByRole } = render(<TestHarness value={1} />)
    expect(getByRole('button').textContent).toBe('1')
  })

  it('diverges locally without being forced back by an unchanged prop', () => {
    const { getByRole, rerender } = render(<TestHarness value={1} />)

    act(() => {
      getByRole('button').click()
    })
    expect(getByRole('button').textContent).toBe('2')

    rerender(<TestHarness value={1} />)
    expect(getByRole('button').textContent).toBe('2')
  })

  it('resyncs when the external value changes', () => {
    const { getByRole, rerender } = render(<TestHarness value={1} />)

    act(() => {
      getByRole('button').click()
    })
    expect(getByRole('button').textContent).toBe('2')

    rerender(<TestHarness value={5} />)
    expect(getByRole('button').textContent).toBe('5')
  })
})
