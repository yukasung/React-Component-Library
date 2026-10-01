import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelect } from './MultiSelect'
import type { MultiSelectOption } from './MultiSelect'

const options: readonly MultiSelectOption[] = [
  { value: 'th', label: 'Thailand' },
  { value: 'us', label: 'United States' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ae', label: 'United Arab Emirates' },
  { value: 'jp', label: 'Japan' },
]

const field = () => screen.getByRole('combobox')
const popup = () => screen.getByRole('dialog')
const listbox = () => screen.getByRole('listbox')
const rows = () => screen.getAllByRole('option')
const rowFor = (label: string) => screen.getByRole('option', { name: new RegExp(label) })
const filterInput = () => screen.getByRole('textbox', { name: 'Filter' })
const selectAll = () => screen.getByRole('checkbox', { name: /Select All/ })

function setup(props: Partial<React.ComponentProps<typeof MultiSelect>> = {}) {
  const onChange = vi.fn()
  const result = render(
    <MultiSelect aria-label="Countries" options={options} onChange={onChange} {...props} />,
  )
  return { onChange, ...result }
}

describe('options', () => {
  it('renders one row per option, showing labels', () => {
    setup()
    fireEvent.click(field())
    expect(rows()).toHaveLength(5)
    expect(rows()[0]).toHaveTextContent('Thailand')
  })

  it('renders only the first of two options sharing a value', () => {
    setup({ options: [{ value: 'a', label: 'First' }, { value: 'a', label: 'Second' }] })
    fireEvent.click(field())
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('First')
  })

  it('opens with an empty list rather than refusing to open', () => {
    setup({ options: [] })
    fireEvent.click(field())
    expect(popup()).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('value / defaultValue', () => {
  it('works uncontrolled from defaultValue', () => {
    setup({ defaultValue: ['th'] })
    expect(field()).toHaveValue('Thailand')
  })

  it('works controlled and ignores internal state', () => {
    setup({ value: ['jp'] })
    fireEvent.click(field())
    fireEvent.click(rowFor('Thailand'))
    expect(field()).toHaveValue('Japan')
  })

  it('does not fire onChange when value changes from outside', () => {
    const { onChange, rerender } = setup({ value: ['th'] })
    rerender(<MultiSelect aria-label="Countries" options={options} value={['jp']} onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not fire onChange when options change', () => {
    const { onChange, rerender } = setup({ value: ['th'] })
    rerender(
      <MultiSelect aria-label="Countries" options={options.slice(1)} value={['th']} onChange={onChange} />,
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a value matching no option, counting it in the header', () => {
    setup({ value: ['zz'], maxHeaderItems: 2 })
    expect(field()).toHaveValue('zz')
  })

  it('does not drop an unmatched value when toggling another', () => {
    const { onChange } = setup({ value: ['zz'] })
    fireEvent.click(field())
    fireEvent.click(rowFor('Japan'))
    expect(onChange).toHaveBeenCalledWith(['jp', 'zz'])
  })
})

describe('onChange', () => {
  it('fires once per toggle, without waiting for blur', () => {
    const { onChange } = setup()
    fireEvent.click(field())
    fireEvent.click(rowFor('Thailand'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['th'])
  })

  it('reports values in options order, not selection order', () => {
    const { onChange } = setup()
    fireEvent.click(field())
    fireEvent.click(rowFor('Japan'))
    fireEvent.click(rowFor('Thailand'))
    expect(onChange).toHaveBeenLastCalledWith(['th', 'jp'])
  })

  it('keeps every toggle when Escape closes the popup — there is no undo', () => {
    const { onChange } = setup()
    fireEvent.click(field())
    fireEvent.click(rowFor('Thailand'))
    fireEvent.click(rowFor('United Kingdom'))
    fireEvent.click(rowFor('Japan'))
    expect(onChange).toHaveBeenCalledTimes(3)
    fireEvent.keyDown(listbox(), { key: 'Escape' })
    expect(field()).toHaveValue('3 items selected')
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('removes a value when its row is toggled again', () => {
    const { onChange } = setup({ defaultValue: ['th'] })
    fireEvent.click(field())
    fireEvent.click(rowFor('Thailand'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})

describe('header', () => {
  it('is empty with nothing selected so the placeholder shows', () => {
    setup({ placeholder: 'Pick some' })
    expect(field()).toHaveValue('')
    expect(field()).toHaveAttribute('placeholder', 'Pick some')
  })

  it('lists labels up to maxHeaderItems', () => {
    setup({ value: ['th', 'us'] })
    expect(field()).toHaveValue('Thailand, United States')
  })

  it('summarises beyond maxHeaderItems', () => {
    setup({ value: ['th', 'us', 'gb'] })
    expect(field()).toHaveValue('3 items selected')
  })

  it('substitutes a custom headerFormat', () => {
    setup({ value: ['th', 'us', 'gb'], headerFormat: '{count} countries' })
    expect(field()).toHaveValue('3 countries')
  })

  it('leaves a culture-formatted token verbatim', () => {
    setup({ value: ['th', 'us', 'gb'], headerFormat: '{count:n0} countries' })
    expect(field()).toHaveValue('{count:n0} countries')
  })

  it('summarises from the first option when maxHeaderItems is 0', () => {
    setup({ value: ['th'], maxHeaderItems: 0 })
    expect(field()).toHaveValue('1 items selected')
  })

  it('updates when value changes from outside', () => {
    const { rerender, onChange } = setup({ value: ['th'] })
    rerender(<MultiSelect aria-label="Countries" options={options} value={['jp']} onChange={onChange} />)
    expect(field()).toHaveValue('Japan')
  })
})

describe('headerFormatter', () => {
  it('replaces the header entirely, including the empty case', () => {
    setup({ headerFormatter: (checked) => `${checked.length} picked` })
    expect(field()).toHaveValue('0 picked')
  })

  it('receives matched options in committed order', () => {
    const formatter = vi.fn(() => 'x')
    setup({ value: ['jp', 'th'], headerFormatter: formatter })
    expect(formatter).toHaveBeenCalledWith([
      { value: 'th', label: 'Thailand' },
      { value: 'jp', label: 'Japan' },
    ])
  })

  it('receives an unmatched value labelled with itself', () => {
    const formatter = vi.fn(() => 'x')
    setup({ value: ['zz'], headerFormatter: formatter })
    expect(formatter).toHaveBeenCalledWith([{ value: 'zz', label: 'zz' }])
  })

  it('shows the placeholder when it returns an empty string', () => {
    setup({ placeholder: 'Pick', headerFormatter: () => '' })
    expect(field()).toHaveValue('')
  })
})

describe('filter', () => {
  it('is absent by default', () => {
    setup()
    fireEvent.click(field())
    expect(screen.queryByRole('textbox', { name: 'Filter' })).toBeNull()
  })

  it('narrows the rows, case-insensitively', async () => {
    const user = userEvent.setup()
    setup({ showFilterInput: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'united')
    expect(rows()).toHaveLength(3)
  })

  it('respects caseSensitiveSearch', async () => {
    const user = userEvent.setup()
    setup({ showFilterInput: true, caseSensitiveSearch: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'united')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('keeps a hidden selected option selected and committed', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ defaultValue: ['th'], showFilterInput: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'japan')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(rowFor('Japan'))
    expect(onChange).toHaveBeenCalledWith(['th', 'jp'])
  })

  it('uses customFilter in place of the default test', async () => {
    const user = userEvent.setup()
    setup({
      showFilterInput: true,
      customFilter: (option, text) => option.value.startsWith(text),
    })
    fireEvent.click(field())
    await user.type(filterInput(), 'j')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('Japan')
  })

  it('consults customFilter for an empty filter too', () => {
    setup({ showFilterInput: true, customFilter: () => false })
    fireEvent.click(field())
    expect(filterInput()).toHaveValue('')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('ignores caseSensitiveSearch while a customFilter is supplied', async () => {
    const user = userEvent.setup()
    setup({
      showFilterInput: true,
      caseSensitiveSearch: true,
      customFilter: (option, text) => option.label.toLowerCase().includes(text.toLowerCase()),
    })
    fireEvent.click(field())
    await user.type(filterInput(), 'UNITED')
    expect(rows()).toHaveLength(3)
  })

  it('is cleared when the popup closes', async () => {
    const user = userEvent.setup()
    setup({ showFilterInput: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'japan')
    fireEvent.keyDown(filterInput(), { key: 'Escape' })
    fireEvent.click(field())
    expect(filterInput()).toHaveValue('')
    expect(rows()).toHaveLength(5)
  })

  it('moves the active row to the first visible row on an edit', async () => {
    const user = userEvent.setup()
    setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(filterInput(), { key: 'ArrowDown' })
    await user.type(filterInput(), 'united')
    expect(filterInput()).toHaveAttribute('aria-activedescendant', rows()[0].id)
  })
})

describe('checkOnFilter', () => {
  const typeFilter = (text: string) => fireEvent.change(filterInput(), { target: { value: text } })

  it('commits nothing by default', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ showFilterInput: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'united')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the union when the filter narrows', () => {
    const { onChange } = setup({ showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('united')
    expect(onChange).toHaveBeenCalledWith(['us', 'gb', 'ae'])
  })

  it('never removes an option outside the match set', () => {
    const { onChange } = setup({ defaultValue: ['jp'], showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('united')
    expect(onChange).toHaveBeenCalledWith(['us', 'gb', 'ae', 'jp'])
  })

  it('commits nothing when Escape clears the filter', () => {
    const { onChange } = setup({ showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('united kingdom')
    onChange.mockClear()
    fireEvent.keyDown(filterInput(), { key: 'Escape' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits nothing when a deletion widens the match set', () => {
    const { onChange } = setup({ showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('united k')
    onChange.mockClear()
    typeFilter('united')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits nothing when the last character is deleted', () => {
    const { onChange } = setup({ showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('japan')
    onChange.mockClear()
    typeFilter('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits nothing when the match set adds nothing new', () => {
    const { onChange } = setup({
      value: ['us', 'gb', 'ae'],
      showFilterInput: true,
      checkOnFilter: true,
    })
    fireEvent.click(field())
    typeFilter('united')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('compares against the previous filter match set, not the new one', () => {
    const { onChange } = setup({ showFilterInput: true, checkOnFilter: true })
    fireEvent.click(field())
    typeFilter('united')
    expect(onChange).toHaveBeenCalledWith(['us', 'gb', 'ae'])
    onChange.mockClear()
    // {jp} is disjoint from {us, gb, ae}, so this commits nothing. An
    // implementation comparing N against itself would always commit.
    typeFilter('japan')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits nothing on mount with a defaultValue', () => {
    const { onChange } = setup({ defaultValue: ['th'], showFilterInput: true, checkOnFilter: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('select all', () => {
  it('is absent by default', () => {
    setup()
    fireEvent.click(field())
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('checks every visible row in one onChange', () => {
    const { onChange } = setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.click(selectAll())
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['th', 'us', 'gb', 'ae', 'jp'])
  })

  it('unchecks every visible row when all are checked', () => {
    const { onChange } = setup({
      defaultValue: options.map((option) => option.value),
      showSelectAllCheckbox: true,
    })
    fireEvent.click(field())
    expect(selectAll()).toBeChecked()
    fireEvent.click(selectAll())
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('is indeterminate and aria-checked mixed when some are checked', () => {
    setup({ defaultValue: ['th'], showSelectAllCheckbox: true })
    fireEvent.click(field())
    expect((selectAll() as HTMLInputElement).indeterminate).toBe(true)
    expect(selectAll()).toHaveAttribute('aria-checked', 'mixed')
  })

  it('acts only on the filtered set', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ showFilterInput: true, showSelectAllCheckbox: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'united')
    fireEvent.click(selectAll())
    expect(onChange).toHaveBeenCalledWith(['us', 'gb', 'ae'])
  })

  it('leaves hidden and unmatched values alone when unchecking', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({
      defaultValue: ['th', 'us', 'gb', 'ae', 'zz'],
      showFilterInput: true,
      showSelectAllCheckbox: true,
    })
    fireEvent.click(field())
    await user.type(filterInput(), 'united')
    fireEvent.click(selectAll())
    expect(onChange).toHaveBeenCalledWith(['th', 'zz'])
  })

  it('activates on Enter as well as Space', () => {
    const { onChange, unmount } = setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.keyDown(selectAll(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['th', 'us', 'gb', 'ae', 'jp'])
    unmount()
    const second = setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.click(selectAll())
    expect(second.onChange).toHaveBeenCalledTimes(1)
  })

  it('is aria-disabled rather than natively disabled when nothing is visible', () => {
    setup({ options: [], showSelectAllCheckbox: true })
    fireEvent.click(field())
    expect(selectAll()).toHaveAttribute('aria-disabled', 'true')
    expect(selectAll()).not.toBeDisabled()
  })

  it('does nothing when activated while unavailable', () => {
    const { onChange } = setup({ options: [], showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.click(selectAll())
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('focus', () => {
  it('moves focus into the popup, to the listbox by default', () => {
    setup()
    fireEvent.click(field())
    expect(document.activeElement).toBe(listbox())
  })

  it('moves focus to the filter input when there is one', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    expect(document.activeElement).toBe(filterInput())
  })

  it('moves focus to select-all when there is no filter input', () => {
    setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    expect(document.activeElement).toBe(selectAll())
  })

  it('focuses an unavailable select-all rather than losing focus', () => {
    setup({ options: [], showSelectAllCheckbox: true })
    fireEvent.click(field())
    // aria-disabled, so still focusable and still announced — the point of
    // using it over the native attribute.
    expect(selectAll()).toHaveAttribute('aria-disabled', 'true')
    expect(document.activeElement).toBe(selectAll())
  })

  it('reaches an unavailable select-all by Tab rather than skipping it', () => {
    setup({ showFilterInput: true, showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.change(filterInput(), { target: { value: 'nothing matches this' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    fireEvent.keyDown(filterInput(), { key: 'Tab' })
    expect(document.activeElement).toBe(selectAll())
  })

  it('returns focus to the field on Escape', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'Escape' })
    expect(document.activeElement).toBe(field())
  })

  it('returns focus to the field on Alt+ArrowUp', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'ArrowUp', altKey: true })
    expect(document.activeElement).toBe(field())
  })
})

describe('keyboard', () => {
  it('opens on ArrowDown with the first row active', () => {
    setup()
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[0].id)
  })

  it('opens on ArrowUp with the last row active', () => {
    setup()
    fireEvent.keyDown(field(), { key: 'ArrowUp' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[4].id)
  })

  it('opens on Enter and on Space', () => {
    const { unmount } = setup()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(popup()).toBeInTheDocument()
    unmount()
    setup()
    fireEvent.keyDown(field(), { key: ' ' })
    expect(popup()).toBeInTheDocument()
  })

  it('moves the active row and clamps at both ends', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[0].id)
    for (let i = 0; i < 10; i++) fireEvent.keyDown(listbox(), { key: 'ArrowDown' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[4].id)
  })

  it('toggles the active row on Space and Enter without closing', () => {
    const { onChange } = setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(['th'])
    expect(popup()).toBeInTheDocument()
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' })
    fireEvent.keyDown(listbox(), { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['th', 'us'])
  })

  it('moves to the first and last row on Home and End', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'End' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[4].id)
    fireEvent.keyDown(listbox(), { key: 'Home' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[0].id)
  })

  it('hands focus to select-all on ArrowUp at the first row', () => {
    setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.keyDown(selectAll(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(listbox())
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(selectAll())
  })

  it('leaves the active row where it was when focus transfers up', () => {
    setup({ showSelectAllCheckbox: true })
    fireEvent.click(field())
    fireEvent.keyDown(selectAll(), { key: 'ArrowDown' })
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' })
    fireEvent.keyDown(selectAll(), { key: 'ArrowDown' })
    expect(listbox()).toHaveAttribute('aria-activedescendant', rows()[0].id)
  })

  it('clamps rather than transferring when there is no select-all', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(listbox())
  })

  it('types a printable character into the filter from the closed field', () => {
    setup({ showFilterInput: true })
    fireEvent.keyDown(field(), { key: 'u' })
    expect(filterInput()).toHaveValue('u')
    expect(document.activeElement).toBe(filterInput())
  })

  it('types a printable character into the filter from the listbox', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'Tab' })
    fireEvent.keyDown(listbox(), { key: 'j' })
    expect(filterInput()).toHaveValue('j')
    expect(document.activeElement).toBe(filterInput())
  })

  it('does nothing for a printable key with no filter input', () => {
    setup()
    fireEvent.keyDown(field(), { key: 'u' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('keyboard in the filter input', () => {
  it('inserts a space rather than toggling a row', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ showFilterInput: true })
    fireEvent.click(field())
    await user.type(filterInput(), 'New York')
    expect(filterInput()).toHaveValue('New York')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggles the active row on Enter', () => {
    const { onChange } = setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['th'])
    expect(popup()).toBeInTheDocument()
  })

  it('leaves Home and End to the caret', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    const before = listbox().getAttribute('aria-activedescendant')
    fireEvent.keyDown(filterInput(), { key: 'End' })
    fireEvent.keyDown(filterInput(), { key: 'Home' })
    expect(filterInput()).toHaveAttribute('aria-activedescendant', before ?? rows()[0].id)
  })
})

describe('Tab', () => {
  it('walks the popup stops in order', () => {
    setup({ showFilterInput: true, showSelectAllCheckbox: true })
    fireEvent.click(field())
    expect(document.activeElement).toBe(filterInput())
    fireEvent.keyDown(filterInput(), { key: 'Tab' })
    expect(document.activeElement).toBe(selectAll())
    fireEvent.keyDown(selectAll(), { key: 'Tab' })
    expect(document.activeElement).toBe(listbox())
  })

  it('closes and returns to the field off the last stop', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'Tab' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('closes and returns to the field off the first stop with Shift', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'Tab', shiftKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('skips a stop that does not exist', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'Tab' })
    expect(document.activeElement).toBe(listbox())
  })
})

describe('ARIA', () => {
  it('is a combobox with a dialog popup', () => {
    setup()
    expect(field()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(field()).toHaveAttribute('aria-expanded', 'false')
    expect(field()).toHaveAttribute('aria-autocomplete', 'none')
    expect(field()).toHaveAttribute('readonly')
  })

  it('keeps aria-haspopup dialog whatever the popup contains', () => {
    setup({ showFilterInput: true, showSelectAllCheckbox: true })
    expect(field()).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('points aria-controls at the open popup', () => {
    setup()
    fireEvent.click(field())
    expect(field()).toHaveAttribute('aria-expanded', 'true')
    expect(field()).toHaveAttribute('aria-controls', popup().id)
  })

  it('marks the listbox multiselectable and rows selected', () => {
    setup({ defaultValue: ['th'] })
    fireEvent.click(field())
    expect(listbox()).toHaveAttribute('aria-multiselectable', 'true')
    expect(rowFor('Thailand')).toHaveAttribute('aria-selected', 'true')
    expect(rowFor('Japan')).toHaveAttribute('aria-selected', 'false')
  })

  it('never puts aria-activedescendant on the field', () => {
    setup()
    fireEvent.click(field())
    fireEvent.keyDown(listbox(), { key: 'ArrowDown' })
    expect(field()).not.toHaveAttribute('aria-activedescendant')
  })

  it('gives the filter input aria-controls naming the listbox', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    expect(filterInput()).toHaveAttribute('aria-controls', listbox().id)
  })

  it('omits aria-activedescendant when no row is visible', () => {
    setup({ options: [] })
    fireEvent.click(field())
    expect(listbox()).not.toHaveAttribute('aria-activedescendant')
  })

  it('names the dialog from the field aria-label by default', () => {
    setup()
    fireEvent.click(field())
    expect(popup()).toHaveAttribute('aria-label', 'Countries')
  })

  it('lets popupAriaLabel win', () => {
    setup({ popupAriaLabel: 'Pick countries' })
    fireEvent.click(field())
    expect(popup()).toHaveAttribute('aria-label', 'Pick countries')
  })

  it('falls back to Options when the field has no aria-label', () => {
    render(<MultiSelect options={options} />)
    fireEvent.click(field())
    expect(popup()).toHaveAttribute('aria-label', 'Options')
  })

  it('names the listbox from optionsAriaLabel', () => {
    setup({ optionsAriaLabel: 'Country list' })
    fireEvent.click(field())
    expect(listbox()).toHaveAttribute('aria-label', 'Country list')
  })

  it('names the dropdown button overridably', () => {
    setup({ dropdownAriaLabel: 'Show countries' })
    expect(screen.getByRole('button', { name: 'Show countries' })).toBeInTheDocument()
  })

  it('sets no inputMode', () => {
    setup()
    expect(field()).not.toHaveAttribute('inputmode')
  })

  it('passes the error-state attributes through', () => {
    setup({
      'aria-invalid': true,
      'aria-describedby': 'hint',
      'aria-errormessage': 'err',
    })
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveAttribute('aria-describedby', 'hint')
    expect(field()).toHaveAttribute('aria-errormessage', 'err')
  })
})

describe('isRequired', () => {
  it('sets aria-required and not the native attribute', () => {
    setup({ isRequired: true })
    expect(field()).toHaveAttribute('aria-required', 'true')
    expect(field()).not.toHaveAttribute('required')
  })

  it('defaults to false', () => {
    setup()
    expect(field()).toHaveAttribute('aria-required', 'false')
  })

  it('changes no behaviour: an empty field blurs without a snap-back', () => {
    const { onChange } = setup({ isRequired: true })
    fireEvent.focus(field())
    fireEvent.blur(field())
    expect(field()).toHaveValue('')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('isReadOnly', () => {
  it('keeps the field focusable but does not open the popup', () => {
    setup({ isReadOnly: true })
    fireEvent.click(field())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(field()).toHaveAttribute('aria-readonly', 'true')
  })

  it('blocks the keyboard from opening it', () => {
    setup({ isReadOnly: true })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('isDisabled', () => {
  it('disables the field and removes it from the tab order', () => {
    setup({ isDisabled: true })
    expect(field()).toBeDisabled()
    expect(field()).toHaveAttribute('aria-disabled', 'true')
  })

  it('does not open', () => {
    setup({ isDisabled: true })
    fireEvent.click(field())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('name', () => {
  it('renders one hidden input per value, in committed order', () => {
    const { container } = setup({ name: 'countries', value: ['jp', 'th'] })
    const hidden = container.querySelectorAll('input[type="hidden"]')
    expect([...hidden].map((input) => (input as HTMLInputElement).value)).toEqual(['th', 'jp'])
  })

  it('renders none when nothing is selected', () => {
    const { container } = setup({ name: 'countries' })
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0)
  })

  it('disables them with the field', () => {
    const { container } = setup({ name: 'countries', value: ['th'], isDisabled: true })
    expect(container.querySelector('input[type="hidden"]')).toBeDisabled()
  })
})

describe('ref', () => {
  it('forwards to the input', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<MultiSelect aria-label="Countries" options={options} ref={ref} />)
    expect(ref.current).toBe(field())
  })
})

describe('portal', () => {
  it('renders the popup in document.body', () => {
    const { container } = setup({ portal: true })
    fireEvent.click(field())
    expect(container.contains(popup())).toBe(false)
    expect(document.body.contains(popup())).toBe(true)
  })

  it('still carries the scalar scope', () => {
    setup({ portal: true })
    fireEvent.click(field())
    expect(popup()).toHaveClass('rc-scalar')
  })

  it('applies an explicit portalZIndex', () => {
    setup({ portal: true, portalZIndex: 42 })
    fireEvent.click(field())
    expect(popup().style.zIndex).toBe('42')
  })
})

// jsdom has no layout engine — every offsetTop and scrollHeight is 0 — which is
// why the collapsing popup reached a browser with 119 green tests behind it. The
// geometry is therefore stubbed, and stubbed in the shape that *caused* the bug:
// the root's scrollHeight reports its own clamped height, as a real clamped flex
// column does, so a measurement that reads it feeds back on itself.
describe('popup height measurement', () => {
  const CHROME = 50
  const CONTENT = 1000

  function stubGeometry() {
    const popupNode = popup()
    const listNode = listbox()
    Object.defineProperty(listNode, 'offsetTop', { configurable: true, value: CHROME })
    Object.defineProperty(listNode, 'scrollHeight', { configurable: true, value: CONTENT })
    // The shape of the defect: once the root is clamped, it reports the clamped
    // height rather than the content height.
    Object.defineProperty(popupNode, 'scrollHeight', {
      configurable: true,
      get() {
        const applied = parseFloat(popupNode.style.maxHeight)
        return Number.isNaN(applied) ? CHROME + CONTENT : applied
      },
    })
    return popupNode
  }

  it('does not shrink the popup on repeated remeasurement', () => {
    setup({ showFilterInput: true, maxDropdownHeight: 240 })
    fireEvent.click(field())
    const popupNode = stubGeometry()

    // Asserted as a value, not merely as "unchanged": the defect collapses to 0
    // on the first pass and then sits there, so a stability-only check passes
    // against the bug it exists to catch.
    const expected = CHROME + 240
    for (let i = 0; i < 4; i++) {
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })
      expect(parseFloat(popupNode.style.maxHeight)).toBe(expected)
    }
  })

  it('asks for the chrome plus the capped list, not the whole list', () => {
    setup({ showFilterInput: true, maxDropdownHeight: 240 })
    fireEvent.click(field())
    const popupNode = stubGeometry()
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    // CHROME + min(CONTENT, 240) = 290, clamped only by viewport space.
    expect(parseFloat(popupNode.style.maxHeight)).toBeLessThanOrEqual(CHROME + 240)
    expect(parseFloat(popupNode.style.maxHeight)).toBeGreaterThan(0)
  })
})

describe('consumer events', () => {
  it('reports focus and blur only across the control boundary', () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    setup({ onFocus, onBlur, showFilterInput: true })
    fireEvent.focus(field())
    expect(onFocus).toHaveBeenCalledTimes(1)
    fireEvent.click(field())
    // Focus moved from the field into the popup: internal, so nothing reported.
    expect(onBlur).not.toHaveBeenCalled()
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it('reports blur when focus leaves the whole control', () => {
    const onBlur = vi.fn()
    const { container } = setup({ onBlur })
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    fireEvent.focus(field())
    fireEvent.blur(field(), { relatedTarget: outside })
    expect(onBlur).toHaveBeenCalledTimes(1)
    outside.remove()
    expect(container).toBeTruthy()
  })

  it('lets a consumer cancel the opening keystroke', () => {
    const onKeyDown = vi.fn((event: React.KeyboardEvent) => event.preventDefault())
    setup({ onKeyDown })
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lets a consumer cancel the opening click', () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault())
    setup({ onClick })
    fireEvent.click(field())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('tab stops', () => {
  it('contributes exactly one tab stop to the page', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button>before</button>
        <MultiSelect aria-label="Countries" options={options} />
        <button>after</button>
      </>,
    )
    screen.getByRole('button', { name: 'before' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(field())
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }))
  })

  it('keeps the dropdown button and every row out of the tab order', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Toggle options' })).toHaveAttribute('tabindex', '-1')
    fireEvent.click(field())
    expect(listbox()).toHaveAttribute('tabindex', '-1')
    for (const row of rows()) expect(row).not.toHaveAttribute('tabindex')
  })
})

describe('clicking outside', () => {
  const surface = () => field().parentElement!

  function outsideButton() {
    const button = document.createElement('button')
    button.textContent = 'outside'
    document.body.appendChild(button)
    return button
  }

  it('closes the popup, clears the focus ring and reports blur once', () => {
    const onBlur = vi.fn()
    setup({ onBlur })
    const outside = outsideButton()
    fireEvent.focus(field())
    fireEvent.click(field())
    expect(popup()).toBeInTheDocument()
    expect(surface().className).toContain('ring-3')

    // A real pointer-down outside closes the popup, and the browser then moves
    // focus to whatever was pressed.
    fireEvent.mouseDown(outside)
    act(() => outside.focus())

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(surface().className).not.toContain('ring-3')
    expect(onBlur).toHaveBeenCalledTimes(1)
    outside.remove()
  })

  it('lets the pointer target keep focus rather than pulling it back', () => {
    setup()
    const outside = outsideButton()
    fireEvent.click(field())
    fireEvent.mouseDown(outside)
    act(() => outside.focus())
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('leaves focus on the field when the pointer target takes none', () => {
    setup()
    const inert = document.createElement('div')
    document.body.appendChild(inert)
    fireEvent.click(field())
    fireEvent.mouseDown(inert)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(field())
    inert.remove()
  })
})

describe('modifier chords are not filter text', () => {
  it('ignores Ctrl+A on the closed field', () => {
    setup({ showFilterInput: true })
    fireEvent.keyDown(field(), { key: 'a', ctrlKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Cmd+A on the closed field', () => {
    setup({ showFilterInput: true })
    fireEvent.keyDown(field(), { key: 'a', metaKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Ctrl+A in the listbox rather than filtering by "a"', () => {
    setup({ showFilterInput: true })
    fireEvent.click(field())
    fireEvent.keyDown(filterInput(), { key: 'Tab' })
    fireEvent.keyDown(listbox(), { key: 'a', ctrlKey: true })
    expect(filterInput()).toHaveValue('')
    expect(document.activeElement).toBe(listbox())
  })

  it('still accepts an unmodified character', () => {
    setup({ showFilterInput: true })
    fireEvent.keyDown(field(), { key: 'a' })
    expect(filterInput()).toHaveValue('a')
  })
})

describe('long labels', () => {
  it('truncates the header and wraps the row', () => {
    const long = [{ value: 'a', label: 'A'.repeat(120) }]
    setup({ options: long, value: ['a'] })
    expect(field()).toHaveClass('truncate')
    fireEvent.click(field())
    expect(within(rows()[0]).getByText('A'.repeat(120))).toHaveClass('break-words')
  })
})

describe('StrictMode', () => {
  it('mounts and unmounts without leaving the popup behind', () => {
    const { unmount } = render(
      <StrictMode>
        <MultiSelect aria-label="Countries" options={options} portal />
      </StrictMode>,
    )
    fireEvent.click(field())
    expect(popup()).toBeInTheDocument()
    unmount()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
