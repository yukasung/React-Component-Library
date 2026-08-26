# React Components

Internal reusable React 19 + TypeScript UI component library (`InputNumber`, `InputDate`, `InputTime`, `InputDateTime`, `InputTag`) styled with Tailwind CSS v4.

React, ReactDOM, and Tailwind CSS are peer dependencies — this package does not bundle them.

## Requirements

- Node.js ≥ 20
- React ≥ 19
- Tailwind CSS ≥ 4

## Installation

Create an access token with the `read:packages` scope, then add the GitHub Packages registry and token to your user or project `.npmrc`:

```ini
@yukasung:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Install the published version:

```bash
npm install @yukasung/react-components@0.1.0
```

## Usage

```tsx
// Import this stylesheet exactly once from your application entry point.
import '@yukasung/react-components/style.css'

import { InputNumber } from '@yukasung/react-components/input-number'

function Example() {
  const [value, setValue] = useState<number | null>(0)
  return <InputNumber value={value} onChange={setValue} min={0} max={100} />
}
```

The package compiles the component utilities itself. Do not add its source or `dist/` directory to your Tailwind scanner; importing the stylesheet above is mandatory.

Published entry points at version `0.1.0` are:

```ts
import { InputNumber } from '@yukasung/react-components/input-number'
import { InputDate } from '@yukasung/react-components/input-date'
import { InputTime } from '@yukasung/react-components/input-time'
import { InputDateTime } from '@yukasung/react-components/input-date-time'
import { InputTag } from '@yukasung/react-components/input-tag'
// Or import every public API from '@yukasung/react-components'.
```

`InputTag` supports controlled and uncontrolled values, optional custom tags,
and a portaled dropdown for use inside popovers:

```tsx
const [tags, setTags] = useState<readonly string[]>([])

<InputTag
  ariaLabel="Tags"
  options={['Important', 'Urgent', 'Follow up']}
  value={tags}
  onChange={setTags}
  removeLabel={(tag) => `Remove ${tag}`}
  addCustomTag={{
    ariaLabel: 'Add a custom tag',
    placeholder: 'Type a tag and press Enter',
  }}
/>
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
