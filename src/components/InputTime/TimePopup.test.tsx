import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputTime } from './InputTime'
import { InputDateTime } from '../InputDateTime/InputDateTime'

afterEach(() => vi.restoreAllMocks())

describe.each([['InputTime', InputTime], ['InputDateTime', InputDateTime]] as const)('%s popup placement', (_name, Component) => {
  it('escapes overflow, flips above the field, repositions, and keeps selection working', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400)
    const onChange = vi.fn()
    const { container, unmount } = render(<div style={{ overflow: 'hidden', height: 44 }}><Component maxDropdownHeight={120} onChange={onChange} /></div>)
    const anchor = container.querySelector('input')!.parentElement!
    const rect = vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top: 550, bottom: 594, left: 300, right: 620, width: 320, height: 44, x: 300, y: 550, toJSON() {} })
    await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
    const list = screen.getByRole('listbox')
    expect(container).not.toContainElement(list)
    expect(list).toHaveClass('rc-scalar')
    expect(list).toHaveStyle({ position: 'fixed', top: '422px', left: '72px', width: '320px', maxHeight: '120px' })

    rect.mockReturnValue({ top: 100, bottom: 144, left: 20, right: 340, width: 320, height: 44, x: 20, y: 100, toJSON() {} })
    fireEvent.scroll(window)
    expect(list).toHaveStyle({ top: '152px', left: '20px' })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(200)
    fireEvent.resize(window)
    expect(list).toHaveStyle({ width: '184px', left: '8px' })
    await user.click(within(list).getAllByRole('option')[1])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    unmount()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('supports inline mode and preserves a local dark theme in portal mode', async () => {
    const user = userEvent.setup()
    const { container, rerender } = render(<div className="dark"><Component portal={false} /></div>)
    await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
    expect(container).toContainElement(screen.getByRole('listbox'))
    expect(screen.getByRole('listbox')).toHaveStyle({ position: 'absolute' })
    rerender(<div className="dark"><Component portal portalZIndex={321} /></div>)
    expect(container).not.toContainElement(screen.getByRole('listbox'))
    expect(screen.getByRole('listbox').parentElement).toHaveClass('dark')
    expect(screen.getByRole('listbox')).toHaveStyle({ zIndex: '321' })
    await act(async () => container.firstElementChild!.classList.remove('dark'))
    expect(screen.getByRole('listbox').parentElement).not.toHaveClass('dark')
  })
})
