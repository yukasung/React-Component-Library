import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const scalarStyles = readFileSync(resolve(process.cwd(), 'src/scalar-utilities.css'), 'utf8')
import { InputNumber, InputDate, InputTime, InputDateTime, InputMask, MultiSelect } from './index'

// Pre-built elements rather than a component-plus-props map: the components do
// not share a props type, so spreading a generic bag over the union does not
// type-check. Each element is checked at its own site instead, and the five that
// render from nothing are written exactly as they were.
const cases = {
  InputNumber: <InputNumber />,
  InputDate: <InputDate />,
  InputTime: <InputTime />,
  InputDateTime: <InputDateTime />,
  InputMask: <InputMask />,
  MultiSelect: <MultiSelect aria-label="Options" options={[{ value: 'a', label: 'A' }]} />,
}

describe('standalone scalar style scope', () => {
  for (const [name, element] of Object.entries(cases)) {
    it(`${name} scopes its input, buttons and popups`, async () => {
      const user = userEvent.setup()
      const { container } = render(element)
      const scope = container.querySelector('.rc-scalar')
      expect(scope).not.toBeNull()
      expect(scope).toContainElement(container.querySelector('input'))
      for (const button of screen.queryAllByRole('button')) expect(scope).toContainElement(button)
      const calendarButton = screen.queryByRole('button', { name: 'Toggle calendar' })
      if (calendarButton) {
        await user.click(calendarButton)
        expect(document.querySelector('.flatpickr-calendar.open')).toHaveClass('rc-scalar')
      }
      const timeButton = screen.queryByRole('button', { name: 'Toggle time list' })
      if (timeButton) {
        await user.click(timeButton)
        expect(screen.getByRole('listbox')).toHaveClass('rc-scalar')
        expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
      }
      // The option popup is the one surface whose scope would otherwise go
      // unverified, and it is portalled out of `container` when asked to be.
      const optionsButton = screen.queryByRole('button', { name: 'Toggle options' })
      if (optionsButton) {
        await user.click(optionsButton)
        expect(screen.getByRole('dialog')).toHaveClass('rc-scalar')
        expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
      }
    })
  }
})

// Vendor CSS includes a type selector; concatenating a scope before `span`
// creates invalid CSS even though the same transformation works for classes.
it('keeps the scoped weekday type selector valid and matching', () => {
  const { container } = render(<div className="dark"><div className="rc-scalar"><span className="flatpickr-weekday">Mon</span></div></div>)
  const selectors: string[] = []
  postcss.parse(scalarStyles).walkRules((rule) => {
    selectors.push(...rule.selectors.filter((selector) => selector.includes('span.flatpickr-weekday')))
  })
  expect(selectors.length).toBeGreaterThan(0)
  for (const selector of selectors) expect(container.querySelector(selector)).toHaveTextContent('Mon')
})

it('keeps calendar arrow pseudo-elements outside functional selectors', () => {
  const selectors: string[] = []
  postcss.parse(scalarStyles).walkRules((rule) => {
    selectors.push(...rule.selectors.filter((selector) => selector.includes('span.arrowUp')))
  })
  expect(selectors.some((selector) => selector.endsWith('):after'))).toBe(true)
  for (const selector of selectors) expect(selector).not.toMatch(/:after\)/)
})
