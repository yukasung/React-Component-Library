import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import postcss from 'postcss'

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(value => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

describe('InputTag placeholder contrast', () => {
  const css = postcss.parse(readFileSync(resolve(process.cwd(), 'src/components/InputTag/input-tag.css'), 'utf8'))
  for (const dark of [false, true]) {
    for (const selector of ['.rc-input-tag__placeholder', '.rc-input-tag__custom-input::placeholder']) {
      it(`${dark ? 'dark' : 'light'} ${selector} meets normal-text contrast`, () => {
        let color = ''
        css.walkRules(rule => {
          if (rule.selectors.includes(`${dark ? '.dark ' : ''}${selector}`)) rule.walkDecls('color', declaration => { color = declaration.value })
        })
        expect(color).toMatch(/^#[\da-f]{6}$/i)
        for (const background of dark ? ['#101828', '#1d2939'] : ['#ffffff', '#f9fafb']) {
          const values = [luminance(color), luminance(background)].sort((a, b) => b - a)
          expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  }
})
