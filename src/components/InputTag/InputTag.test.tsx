import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InputTag } from './InputTag'

const options = ['Important', 'VIP', 'Monthly'] as const

function ControlledInputTag({ portal = false }: { portal?: boolean }) {
  const [value, setValue] = useState<readonly string[]>([])
  return (
    <InputTag
      id="tags"
      ariaLabel="Tags"
      options={options}
      portal={portal}
      removeLabel={(tag) => `Remove ${tag}`}
      value={value}
      onChange={setValue}
    />
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('InputTag', () => {
  it('controls multiple selections with the admin-template structure and neutral option rows', async () => {
    const user = userEvent.setup()
    render(<ControlledInputTag />)
    const trigger = screen.getByRole('combobox', { name: 'Tags' })

    await user.click(trigger)
    const important = screen.getByRole('option', { name: 'Important' })
    expect(trigger.parentElement).toHaveClass('relative', 'flex', 'flex-col', 'items-center')
    expect(trigger.querySelector('.flex-auto')).toBeInTheDocument()
    expect(important).not.toHaveClass('hover:bg-primary/5', 'bg-primary/10')

    await user.click(important)
    await user.click(screen.getByRole('option', { name: 'VIP' }))
    expect(screen.getByRole('button', { name: 'Remove Important' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Remove Important' }))
    expect(screen.queryByRole('button', { name: 'Remove Important' })).not.toBeInTheDocument()
  })

  it('supports uncontrolled defaultValue and reports updates', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <InputTag
        ariaLabel="Tags"
        options={options}
        defaultValue={['VIP']}
        removeLabel={(tag) => `Remove ${tag}`}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    await user.click(screen.getByRole('option', { name: 'Monthly' }))

    expect(onChange).toHaveBeenLastCalledWith(['VIP', 'Monthly'])
    expect(screen.getByRole('button', { name: 'Remove Monthly' })).toBeVisible()
  })

  it('adds trimmed custom tags and rejects blank or case-insensitive duplicates', async () => {
    const user = userEvent.setup()
    render(
      <InputTag
        ariaLabel="Tags"
        options={options}
        addCustomTag={{ ariaLabel: 'Add tag', placeholder: 'Type a tag and press Enter' }}
        removeLabel={(tag) => `Remove ${tag}`}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    const input = screen.getByRole('textbox', { name: 'Add tag' })
    await user.type(input, '  Court date  {Enter}')
    expect(screen.getByRole('button', { name: 'Remove Court date' })).toBeVisible()
    expect(input).toHaveValue('')

    await user.type(input, '   {Enter}court date{Enter}')
    expect(screen.getAllByRole('button', { name: 'Remove Court date' })).toHaveLength(1)

    await user.clear(input)
    await user.type(input, 'vip{Enter}')
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Remove vip' })).not.toBeInTheDocument()
  })

  it('does not open or remove values while disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <InputTag
        ariaLabel="Tags"
        options={options}
        value={['VIP']}
        onChange={onChange}
        isDisabled
        removeLabel={(tag) => `Remove ${tag}`}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Tags' })
    expect(trigger).toHaveAttribute('aria-disabled', 'true')
    await user.click(trigger)
    expect(screen.queryByRole('listbox', { name: 'Tags' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove VIP' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes an open menu when it becomes disabled', async () => {
    const user = userEvent.setup()
    const props = {
      ariaLabel: 'Tags',
      options,
      removeLabel: (tag: string) => `Remove ${tag}`,
    }
    const { rerender } = render(<InputTag {...props} />)

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    expect(screen.getByRole('listbox', { name: 'Tags' })).toBeVisible()
    rerender(<InputTag {...props} isDisabled />)

    expect(screen.queryByRole('listbox', { name: 'Tags' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports trigger keyboard opening and active-option selection', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    render(<ControlledInputTag />)
    const trigger = screen.getByRole('combobox', { name: 'Tags' })

    trigger.focus()
    await user.keyboard('{Enter}{End}')
    expect(screen.getByRole('option', { name: 'Monthly' })).toHaveClass('rc-input-tag__option--active')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remove Monthly' })).toBeVisible()
    expect(trigger).toHaveAttribute('aria-activedescendant')

    await user.keyboard('{Escape} ')
    expect(screen.getByRole('listbox', { name: 'Tags' })).toBeVisible()
    expect(screen.getByRole('listbox', { name: 'Tags' })).toHaveAttribute('aria-multiselectable', 'true')
  })

  it('closes outside and restores trigger focus after Escape', async () => {
    const user = userEvent.setup()
    render(<ControlledInputTag />)
    const trigger = screen.getByRole('combobox', { name: 'Tags' })

    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: 'Tags' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('portals within the viewport and repositions when selected tags make the trigger taller', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(768)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(768)
    render(<ControlledInputTag portal />)
    const trigger = screen.getByRole('combobox', { name: 'Tags' })
    let triggerHeight = 44
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => ({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      width: 300,
      height: triggerHeight,
      right: 400,
      bottom: 100 + triggerHeight,
      toJSON: () => ({}),
    }))

    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Tags' })
    const menu = listbox.parentElement as HTMLDivElement
    expect(menu.parentElement).toBe(document.body)
    Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: 120 })
    act(() => window.dispatchEvent(new Event('resize')))
    expect(menu).toHaveStyle({ left: '100px', top: '152px', width: '300px' })

    await user.click(screen.getByRole('option', { name: 'Important' }))
    await user.click(screen.getByRole('option', { name: 'VIP' }))
    triggerHeight = 80
    await user.click(screen.getByRole('option', { name: 'Monthly' }))

    expect(menu).toHaveStyle({ top: '188px' })
  })
})
