# React Component Library

Internal reusable React 19 + TypeScript UI component library (`InputNumber`, `InputDate`, `Grid`) styled with Tailwind CSS v4.

React, ReactDOM, and Tailwind CSS are peer dependencies — this package does not bundle them.

## Requirements

- Node.js ≥ 20
- React ≥ 19
- Tailwind CSS ≥ 4

## Installation

```bash
npm install react-component-library
```

## Usage

```tsx
import { InputNumber } from 'react-component-library'

function Example() {
  const [value, setValue] = useState<number | null>(0)
  return <InputNumber value={value} onChange={setValue} min={0} max={100} />
}
```

Tailwind CSS v4 must be configured to scan this package's compiled output for utility classes, e.g.:

```css
@import "tailwindcss";
@source "../node_modules/react-component-library/dist";
```

## Development

```bash
npm install
npm run dev         # demo/playground app at localhost:5173
npm run build        # build the library (src/ -> dist/)
npm run typecheck    # type-check the whole project (tsc --build)
npm run lint          # eslint .
npm run test          # run the test suite once
npm run test:watch   # run the test suite in watch mode
```

## Documentation site

A separate Next.js + Nextra docs site lives in [`docs/`](docs/) with its own `package.json`/`node_modules`. It is not an npm workspace of the root — see [`docs/`](docs/) for its own setup.

```bash
cd docs
npm install
npm run dev   # docs site at localhost:3000
```

## Project structure

```
src/                  Library source, built into dist/
  components/          One folder per component (component + tests)
  hooks/                 Shared hooks (e.g. useSyncedState)
  lib/                    Pure helper functions (parsing, formatting, clamping)
demo/                 Vite playground app that imports the library from source
docs/                  Standalone Next.js + Nextra documentation site
```

## License

UNLICENSED — internal use only.
