import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const scalarStyles = readFileSync(resolve(process.cwd(), 'src/scalar-utilities.css'), 'utf8')
import { InputNumber, InputDate, InputTime, InputDateTime } from './index'

describe('standalone scalar style scope', () => {
  for (const [name, Component] of Object.entries({ InputNumber, InputDate, InputTime, InputDateTime })) {
    it(`${name} scopes its input, buttons and popups`, async () => {
      const user = userEvent.setup()
      const { container } = render(<Component />)
      const scope = container.querySelector('.rc-scalar')
      expect(scope).not.toBeNull()
      expect(scope).toContainElement(container.querySelector('input[role]'))
      for (const button of screen.queryAllByRole('button')) expect(scope).toContainElement(button)
      const calendarButton = screen.queryByRole('button', { name: 'Toggle calendar' })
      if (calendarButton) {
        await user.click(calendarButton)
        expect(document.querySelector('.flatpickr-calendar.open')).toHaveClass('rc-scalar')
      }
      const timeButton = screen.queryByRole('button', { name: 'Toggle time list' })
      if (timeButton) {
        await user.click(timeButton)
        expect(scope).toContainElement(screen.getByRole('listbox'))
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
