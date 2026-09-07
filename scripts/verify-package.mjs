import assert from 'node:assert/strict'
import postcss from 'postcss'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const fail = (message) => {
  throw new Error(`Package verification failed: ${message}`)
}

const expectedEntries = ['.', './input-number', './input-date', './input-time', './input-date-time', './input-tag']

for (const entry of expectedEntries) {
  const target = manifest.exports?.[entry]
  if (!target || typeof target !== 'object') {
    fail(`package.json exports is missing ${entry}`)
  }

  for (const condition of ['import', 'types']) {
    const path = target[condition]
    if (typeof path !== 'string' || !existsSync(resolve(root, path))) {
      fail(`${entry} ${condition} target is missing: ${path ?? '(undefined)'}`)
    }
  }
}

const styleTarget = manifest.exports?.['./style.css']
if (typeof styleTarget !== 'string' || !existsSync(resolve(root, styleTarget))) {
  fail(`style export target is missing: ${styleTarget ?? '(undefined)'}`)
}

// Check declarations, not marker substrings: an empty selector is not usable
// styling, and a scoped .flex must not be mistaken for a global utility.
const requiredStyles = [
  ['.flatpickr-calendar', 'position'],
  ['span.arrowUp):after', 'border-bottom'],
  ['.flatpickr-calendar.static', 'position', 'absolute', true],
  ['.rc-input-tag__surface', 'display', 'flex'],
  ['.rc-input-tag__menu--portal', 'position', 'fixed'],
  ['.rc-scalar', 'box-sizing', 'border-box'],
  ['.h-11', 'height', '2.75rem'],
  ['.w-full', 'width', '100%'],
  ['.flex-1', 'flex', '1'],
  ['.flex', 'display', 'flex'],
  ['.relative', 'position', 'relative'],
  ['.absolute', 'position', 'absolute'],
  ['.border', 'border-width', '1px'],
  ['.pr-18', 'padding-right', '4.5rem'],
  ['.overflow-y-auto', 'overflow-y', 'auto'],
  ['.shadow-theme-xs', 'box-shadow'],
  ['.focus\\:ring-3', 'box-shadow'],
  ['.focus-within\\:ring-brand-500', '--tw-ring-color'],
  ['.disabled\\:cursor-not-allowed', 'cursor', 'not-allowed'],
  ['.dark\\:bg-gray-900', 'background-color'],
  ['.hover\\:bg-gray-100', 'background-color'],
  ['.rc-scalar', '--tw-ring-offset-width', '0px'],
]
const verifyStyle = (style) => {
  const css = postcss.parse(style)
  const declarations = []
  css.walkAtRules((rule) => {
    if (rule.name === 'property' || (rule.name === 'layer' && rule.nodes && /\bbase\b/.test(rule.params))) {
      fail(`style.css contains forbidden global output: @${rule.name} ${rule.params}`)
    }
    if (rule.name === 'media' && /prefers-color-scheme\s*:\s*dark/.test(rule.params)) {
      fail('style.css contains forbidden automatic dark mode')
    }
  })
  css.walkRules((rule) => {
    let context = rule.selector
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'rule') context = `${parent.selector} ${context}`
    }
    const nestedInScope = context !== rule.selector && context.includes('.rc-scalar')
    for (const selector of rule.selectors) {
      const keyframe = rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')
      if (!nestedInScope && !selector.includes('.rc-scalar') && !selector.includes('.rc-input-tag') && !keyframe) {
        fail(`style.css contains forbidden unscoped selector: ${selector}`)
      }
    }
    rule.nodes?.filter((node) => node.type === 'decl').forEach((node) => {
      declarations.push({ selector: context, prop: node.prop, value: node.value, important: node.important })
    })
  })
  for (const [selector, property, value, important] of requiredStyles) {
    const matching = declarations.some((decl) =>
      decl.selector.includes(selector) && decl.prop === property &&
      decl.value.trim() !== '' && (!value || decl.value === value) &&
      (!important || decl.important),
    )
    if (!matching) fail(`style.css is missing usable ${selector} ${property} output`)
  }
  if (!style.includes(':is(.dark *)')) fail('style.css is missing class-based dark mode')
}

const style = readFileSync(resolve(root, styleTarget), 'utf8')
verifyStyle(style)

if (process.argv.includes('--self-test')) {
  // Start with a known-good full artifact; each negative changes only the
  // condition under test and asserts its specific diagnostic.
  assert.doesNotThrow(() => verifyStyle(style))
  for (const [addition, message] of [
    ['@layer base { html, :host { line-height: 1.5; } }', /forbidden global output: @layer base/],
    ['.flex { display: flex; }', /forbidden unscoped selector: .flex/],
    ['.rc-scalar, .flex { display: flex; }', /forbidden unscoped selector: .flex/],
    [':root { --color-gray-500: red; }', /forbidden unscoped selector: :root/],
    ['@property --tw-ring-color { syntax: "*"; inherits: false; }', /forbidden global output: @property/],
    ['@media (prefers-color-scheme: dark) { .rc-scalar { color: white; } }', /forbidden automatic dark mode/],
  ]) assert.throws(() => verifyStyle(style + addition), message)
  for (const [selector, property] of requiredStyles) {
    const broken = postcss.parse(style)
    broken.walkRules((rule) => {
      let context = rule.selector
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule') context = `${parent.selector} ${context}`
      }
      if (context.includes(selector)) rule.walkDecls(property, (decl) => decl.remove())
    })
    assert.throws(() => verifyStyle(broken.toString()),
      (error) => error.message === `Package verification failed: style.css is missing usable ${selector} ${property} output`,
      `guard must reject missing ${selector} ${property}`)
  }
  console.log('Package verifier self-test passed (positive artifact and isolated negative fixtures).')
}

const findTestDeclarations = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return findTestDeclarations(path)
    return entry.name.endsWith('.test.d.ts') ? [path] : []
  })

const testDeclarations = findTestDeclarations(resolve(root, 'dist'))
if (testDeclarations.length > 0) {
  fail(`dist contains test declarations: ${testDeclarations.map((path) => path.slice(root.length + 1)).join(', ')}`)
}

const importPattern = /(?:import|export)\s*(?:[^'";]*?from\s*)?["']([^"']+)["']/g
const graph = [resolve(root, manifest.exports['./input-number'].import)]
const visited = new Set()

while (graph.length > 0) {
  const file = graph.pop()
  if (!file || visited.has(file)) continue
  visited.add(file)

  const source = readFileSync(file, 'utf8')
  if (source.includes('flatpickr')) {
    fail(`InputNumber dependency graph includes flatpickr: ${file.slice(root.length + 1)}`)
  }

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    if (specifier.startsWith('.')) {
      graph.push(resolve(dirname(file), specifier))
    } else if (specifier === 'flatpickr' || specifier.startsWith('flatpickr/')) {
      fail(`InputNumber dependency graph includes flatpickr import: ${specifier}`)
    }
  }
}

// Import the public built entry points, not source aliases. This also walks
// every component's runtime dependency graph and fails on missing chunks.
const components = ['InputNumber', 'InputDate', 'InputTime', 'InputDateTime', 'InputTag']
const barrel = await import(pathToFileURL(resolve(root, manifest.exports['.'].import)).href)
for (const [index, entry] of expectedEntries.slice(1).entries()) {
  const name = components[index]
  const exported = await import(pathToFileURL(resolve(root, manifest.exports[entry].import)).href)
  if (!exported[name] || exported[name] !== barrel[name]) fail(`${entry} does not export the barrel's ${name}`)
  for (const typeEntry of [entry, '.']) {
    const types = readFileSync(resolve(root, manifest.exports[typeEntry].types), 'utf8')
    for (const symbol of [name, `${name}Props`]) {
      if (!new RegExp(`export (?:declare )?(?:const|function|interface|type|class) ${symbol}\\b`).test(types)) {
        fail(`${typeEntry} declaration is missing public ${symbol}`)
      }
    }
  }
  const html = renderToStaticMarkup(createElement(exported[name], name === 'InputTag'
    ? { ariaLabel: 'Tags', options: [], removeLabel: (tag) => `Remove ${tag}` }
    : { 'aria-label': name, defaultValue: null }))
  if (!html.includes(name === 'InputTag' ? 'rc-input-tag' : 'rc-scalar')) {
    fail(`${entry} renders without its component style scope`)
  }
  if (!html.includes(name === 'InputTag' ? 'role="combobox"' : '<input')) {
    fail(`${entry} does not render its public control`)
  }
}

console.log('Package artifact verification passed.')
