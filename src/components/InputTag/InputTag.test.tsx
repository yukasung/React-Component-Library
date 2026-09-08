import { createRef, useState } from 'react'
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
  it('does not raise the control above sticky application chrome', () => {
    render(<ControlledInputTag />)

    expect(screen.getByRole('combobox', { name: 'Tags' }).closest('.rc-input-tag')).not.toHaveClass('z-20')
  })

  it('uses a caller-specified layer for a portalled menu', async () => {
    const user = userEvent.setup()
    const props = {
      ariaLabel: 'Tags',
      options,
      portal: true,
      portalZIndex: 10,
      removeLabel: (tag: string) => `Remove ${tag}`,
    }
    render(<InputTag {...props} />)

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))

    expect(screen.getByRole('listbox', { name: 'Tags' }).parentElement).toHaveStyle({ zIndex: '10' })
  })

  // The application owns its own layer order; --rc-z-popup lets it place every
  // portalled popup at once instead of threading a prop through each field.
  it('takes its layer from the --rc-z-popup token', async () => {
    const user = userEvent.setup()
    const host = document.createElement('div')
    host.style.setProperty('--rc-z-popup', '1100')
    document.body.appendChild(host)

    try {
      render(
        <InputTag ariaLabel="Tags" options={options} portal removeLabel={(tag: string) => `Remove ${tag}`} />,
        { container: host },
      )
      await user.click(screen.getByRole('combobox', { name: 'Tags' }))

      expect(screen.getByRole('listbox', { name: 'Tags' }).parentElement).toHaveStyle({ zIndex: '1100' })
    } finally {
      host.remove()
    }
  })

  it('keeps a portalled menu below a caller-specified top inset', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(768)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(400)
    render(
      <InputTag
        ariaLabel="Tags"
        options={options}
        portal
        portalTopInset={100}
        removeLabel={(tag) => `Remove ${tag}`}
      />,
    )
    const trigger = screen.getByRole('combobox', { name: 'Tags' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      width: 300,
      height: 44,
      right: 400,
      bottom: 244,
      toJSON: () => ({}),
    })

    await user.click(trigger)
    const menu = screen.getByRole('listbox', { name: 'Tags' }).parentElement as HTMLDivElement
    Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: 160 })
    act(() => window.dispatchEvent(new Event('resize')))

    expect(menu).toHaveStyle({ top: '252px' })
  })

  it('controls multiple selections with the admin-template structure and neutral option rows', async () => {
    const user = userEvent.setup()
    render(<ControlledInputTag />)
    const trigger = screen.getByRole('combobox', { name: 'Tags' })

    await user.click(trigger)
    const important = screen.getByRole('option', { name: 'Important' })
    expect(trigger.parentElement).toHaveClass('relative', 'flex', 'flex-col', 'items-center')
    expect(trigger.querySelector('.flex-auto')).toBeInTheDocument()
    expect(important).not.toHaveClass('hover:bg-primary/5', 'bg-primary/10')
    expect(important).not.toHaveClass('rc-input-tag__option--active')

    await user.hover(important)
    expect(important).not.toHaveClass('rc-input-tag__option--active')

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

  it('enforces supplied custom-tag length and selection-count limits', async () => {
    const user = userEvent.setup()
    render(
      <InputTag
        ariaLabel="Tags"
        options={options}
        maxCustomTagLength={5}
        maxSelectedTags={1}
        addCustomTag={{ ariaLabel: 'Add tag', placeholder: 'Type a tag and press Enter' }}
        removeLabel={(tag) => `Remove ${tag}`}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Tags' }))
    const input = screen.getByRole('textbox', { name: 'Add tag' })
    expect(input).toHaveAttribute('maxLength', '5')
    await user.type(input, '123456{Enter}')
    expect(screen.getByRole('button', { name: 'Remove 12345' })).toBeVisible()

    await user.click(screen.getByRole('option', { name: 'Important' }))
    expect(screen.queryByRole('button', { name: 'Remove Important' })).not.toBeInTheDocument()
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
    // The layer is resolved (--rc-z-popup, else the library default) rather
    // than pinned by a utility class, so assert the value that actually lands.
    expect(menu).toHaveStyle({ zIndex: '100000' })
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


describe('InputTag form contract', () => {
  const props = {
    ariaLabel: 'Tags', options, removeLabel: (tag: string) => `Remove ${tag}`,
  }

  it('exposes the focusable combobox and validation associations', () => {
    const ref = createRef<HTMLDivElement>()
    const { unmount } = render(<>
      <span id="tag-label">Matter tags</span>
      <span id="tag-help">Choose tags</span>
      <span id="tag-error">A tag is required</span>
      <InputTag {...props} ref={ref} isRequired aria-labelledby="tag-label"
        aria-describedby="tag-help" aria-errormessage="tag-error" aria-invalid />
    </>)
    const control = screen.getByRole('combobox', { name: 'Matter tags' })
    expect(ref.current).toBe(control)
    ref.current?.focus()
    expect(control).toHaveFocus()
    expect(control).toHaveAttribute('aria-required', 'true')
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(control).toHaveAccessibleDescription('Choose tags')
    expect(control).toHaveAttribute('aria-errormessage', 'tag-error')
    unmount()
    expect(ref.current).toBeNull()
  })

  it('honors callback ref replacement and cleanup', () => {
    const cleanup = vi.fn()
    const first = vi.fn(() => cleanup)
    const second = vi.fn()
    const { rerender, unmount } = render(<InputTag {...props} ref={first} />)
    const control = screen.getByRole('combobox')
    expect(first).toHaveBeenCalledWith(control)
    rerender(<InputTag {...props} ref={second} />)
    expect(cleanup).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith(control)
    unmount()
    expect(second).toHaveBeenLastCalledWith(null)
  })

  it('serializes repeated names, updates values, and omits disabled tags', () => {
    const view = (value: readonly string[], isDisabled = false) => (
      <form aria-label="matter"><InputTag {...props} name="tags" value={value} isDisabled={isDisabled} /></form>
    )
    const { rerender } = render(view(['VIP', 'Important']))
    const data = () => new FormData(screen.getByRole('form') as HTMLFormElement).getAll('tags')
    expect(data()).toEqual(['VIP', 'Important'])
    rerender(view(['Monthly']))
    expect(data()).toEqual(['Monthly'])
    rerender(view(['Monthly'], true))
    expect(data()).toEqual([])
    rerender(view([]))
    expect(data()).toEqual([])
  })

  it.each([false, true])('reports blur only when focus leaves the composite (portal=%s)', async (portal) => {
    const user = userEvent.setup()
    const onBlur = vi.fn()
    render(<><InputTag {...props} portal={portal} onBlur={onBlur} defaultValue={['VIP']}
      addCustomTag={{ ariaLabel: 'Custom tag', placeholder: 'Add' }} /><button>Outside</button></>)
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    act(() => screen.getByRole('button', { name: 'Remove VIP' }).focus())
    act(() => screen.getByRole('textbox', { name: 'Custom tag' }).focus())
    act(() => screen.getByRole('option', { name: 'Monthly' }).focus())
    act(() => trigger.focus())
    expect(onBlur).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(onBlur).toHaveBeenCalledOnce()
    await user.click(trigger)
    act(() => screen.getByRole('textbox', { name: 'Custom tag' }).focus())
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(onBlur).toHaveBeenCalledTimes(2)
  })

  it('preserves touched tracking after removing the focused tag', async () => {
    const user = userEvent.setup()
    const onBlur = vi.fn()
    render(<><InputTag {...props} onBlur={onBlur} defaultValue={['VIP']} />
      <button>Outside</button></>)
    await user.click(screen.getByRole('button', { name: 'Remove VIP' }))
    expect(screen.queryByRole('button', { name: 'Remove VIP' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveFocus()
    expect(onBlur).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it('keeps read-only tags focusable and serializable while blocking changes and opening', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const view = (isReadOnly: boolean, isDisabled = false) => (
      <form aria-label="matter"><InputTag {...props} name="tags" defaultValue={['VIP']}
        onChange={onChange} isReadOnly={isReadOnly} isDisabled={isDisabled} /></form>
    )
    const { rerender } = render(view(true))
    const control = screen.getByRole('combobox')
    await user.click(control)
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter} ')
    expect(control).toHaveFocus()
    expect(control).toHaveAttribute('aria-readonly', 'true')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove VIP' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(new FormData(screen.getByRole('form') as HTMLFormElement).getAll('tags')).toEqual(['VIP'])
    rerender(view(false))
    await user.click(control)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    rerender(view(true))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    rerender(view(false))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.click(control)
    rerender(view(false, true))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(control).toHaveAttribute('tabindex', '-1')
  })
})

describe('InputTag keyboard focus contract', () => {
  const props = {
    ariaLabel: 'Tags', options, removeLabel: (tag: string) => `Remove ${tag}`,
  }

  it.each([
    ['{Enter}', false], [' ', false], ['{Enter}', true], [' ', true],
  ] as const)('allows native remove-button activation with %s (open=%s)', async (key, open) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onBlur = vi.fn()
    render(<><InputTag {...props} defaultValue={['VIP']} onChange={onChange} onBlur={onBlur} />
      <button>Outside</button></>)
    await user.tab()
    if (open) await user.keyboard('{Enter}{End}')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Remove VIP' })).toHaveFocus()
    await user.keyboard(key)
    expect(screen.queryByRole('button', { name: 'Remove VIP' })).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
    expect(screen.getByRole('combobox')).toHaveFocus()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', String(open))
    expect(screen.queryByRole('button', { name: 'Remove Monthly' })).not.toBeInTheDocument()
    expect(onBlur).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(onBlur).toHaveBeenCalledOnce()
  })

  describe.each([false, true])('portal=%s', (portal) => {
    it.each([false, true])('closes on keyboard focus exit without capturing outside Escape (reverse=%s)', async (reverse) => {
      const user = userEvent.setup()
      const onBlur = vi.fn()
      const outsideKey = vi.fn()
      render(<><button onKeyDown={outsideKey}>Before</button>
        <InputTag {...props} portal={portal} onBlur={onBlur} />
        <button onKeyDown={outsideKey}>After</button></>)
      await user.tab()
      await user.tab()
      const trigger = screen.getByRole('combobox')
      await user.keyboard('{ArrowDown}')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      await user.tab({ shift: reverse })
      const outside = screen.getByRole('button', { name: reverse ? 'Before' : 'After' })
      expect(outside).toHaveFocus()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(onBlur).toHaveBeenCalledOnce()
      outsideKey.mockClear()
      await user.keyboard('{Escape}')
      expect(outside).toHaveFocus()
      expect(outsideKey).toHaveBeenCalledOnce()
      expect(outsideKey.mock.calls[0][0].defaultPrevented).toBe(false)
      expect(onBlur).toHaveBeenCalledOnce()
    })

    it('keeps internal custom-input focus transfers open but closes on keyboard exit', async () => {
      const user = userEvent.setup()
      const onBlur = vi.fn()
      render(<><InputTag {...props} portal={portal} onBlur={onBlur}
        addCustomTag={{ ariaLabel: 'Custom tag', placeholder: 'Add' }} />
        <button>Outside</button></>)
      const trigger = screen.getByRole('combobox')
      await user.tab()
      await user.keyboard('{ArrowDown}')
      act(() => screen.getByRole('textbox', { name: 'Custom tag' }).focus())
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(onBlur).not.toHaveBeenCalled()
      // Portals follow body DOM order; inline menus precede the outside button.
      await user.tab({ shift: portal })
      expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(onBlur).toHaveBeenCalledOnce()
    })

    it.each(['mouse', 'touch'])('continues keyboard navigation after %s option selection', async (pointer) => {
      const user = userEvent.setup()
      const onBlur = vi.fn()
      render(<><InputTag {...props} portal={portal} onBlur={onBlur} /><button>Outside</button></>)
      const trigger = screen.getByRole('combobox')
      await user.click(trigger)
      const option = screen.getByRole('option', { name: 'VIP' })
      if (pointer === 'touch') {
        await user.pointer([{ keys: '[TouchA>]', target: option }, { keys: '[/TouchA]' }])
      } else {
        await user.pointer({ keys: '[MouseLeft>]', target: option })
        expect(trigger).toHaveFocus()
        await user.pointer({ keys: '[/MouseLeft]' })
      }
      expect(trigger).toHaveFocus()
      expect(trigger).toHaveAttribute('aria-activedescendant', option.id)
      expect(option).toHaveAttribute('aria-selected', 'true')
      await user.keyboard('{ArrowDown}{Enter}')
      expect(screen.getByRole('option', { name: 'Monthly' })).toHaveAttribute('aria-selected', 'true')
      await user.keyboard('{Home}{Enter}')
      expect(screen.getByRole('option', { name: 'Important' })).toHaveAttribute('aria-selected', 'true')
      await user.keyboard('{End} ')
      expect(screen.getByRole('option', { name: 'Monthly' })).toHaveAttribute('aria-selected', 'false')
      await user.keyboard('{ArrowUp}{Enter}')
      expect(option).toHaveAttribute('aria-selected', 'false')
      expect(onBlur).not.toHaveBeenCalled()
      await user.keyboard('{Escape}')
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Remove Important' })).toHaveFocus()
      expect(onBlur).not.toHaveBeenCalled()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
      expect(onBlur).toHaveBeenCalledOnce()
    })

    it('keeps custom input text editing separate and restores focus on Escape', async () => {
      const user = userEvent.setup()
      const onBlur = vi.fn()
      render(<><InputTag {...props} portal={portal} onBlur={onBlur}
        addCustomTag={{ ariaLabel: 'Custom tag', placeholder: 'Add' }} /><button>Outside</button></>)
      const trigger = screen.getByRole('combobox')
      await user.click(trigger)
      await user.keyboard('{End}')
      const activeId = trigger.getAttribute('aria-activedescendant')
      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.keyboard('Court date{Home}{ArrowDown}{ArrowUp}{End}{Enter}')
      expect(input).toHaveFocus()
      expect(screen.getByRole('button', { name: 'Remove Court date' })).toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-activedescendant', activeId)
      expect(screen.getByRole('option', { name: 'Monthly' })).toHaveAttribute('aria-selected', 'false')
      expect(onBlur).not.toHaveBeenCalled()
      await user.keyboard('{Escape}')
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(onBlur).not.toHaveBeenCalled()
      await user.tab()
      await user.tab()
      expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
      expect(onBlur).toHaveBeenCalledOnce()
    })
  })

  it.each([
    ['{ArrowDown}', 'Important'], ['{ArrowUp}', 'Monthly'], ['{Enter}', 'Important'], [' ', 'Important'],
  ])('opens with %s and an active %s option', async (key, label) => {
    const user = userEvent.setup()
    render(<InputTag {...props} />)
    await user.tab()
    await user.keyboard(key)
    const option = screen.getByRole('option', { name: label })
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option.id)
    await user.keyboard('{Enter}')
    expect(option).toHaveAttribute('aria-selected', 'true')
  })
})
