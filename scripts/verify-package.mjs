import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const fail = (message) => {
  throw new Error(`Package verification failed: ${message}`)
}

const expectedEntries = ['.', './input-number', './input-date', './input-time']

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

const style = readFileSync(resolve(root, styleTarget), 'utf8')
for (const marker of ['.rounded-lg', '--rc-color-primary']) {
  if (!style.includes(marker)) {
    fail(`style.css is missing required ${marker} output`)
  }
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

console.log('Package artifact verification passed.')
