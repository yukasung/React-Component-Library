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

The package compiles the component utilities itself. Do not add its source or `dist/` directory to your Tailwind scanner; importing the stylesheet above is mandatory. Styles are scoped to the controls, including their popups, and do not install a global reset or Tailwind theme.

Library development: after editing scalar utility classes or the calendar theme, run `npm run generate:styles` to refresh the checked-in stylesheet used by the demo and docs. `npm run build` also regenerates it; `node scripts/generate-scalar-styles.mjs --check` checks for stale generated output.

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

### Scalar input event integration

Scalar inputs preserve their existing value-based `onChange` callbacks.
Consumer `onFocus` and `onBlur` handlers run after internal handling, including
any commit-time `onChange` before `onBlur`; React state batching is unchanged.
For composed `onKeyDown`, `onClick`, and `onMouseDown` handlers, the consumer
runs first and can call `preventDefault()` to skip the internal action.
Numeric drafts may temporarily exceed `min` / `max`; committed values and
stepping remain bounded.

### InputTag form integration

`InputTag` keeps its array-based `value` / `onChange` API. Its `ref` accepts
an object or callback and points to the focusable `HTMLDivElement` combobox,
so form libraries can focus an invalid field. `onBlur` fires when focus leaves
the whole field, including a portalled menu; focus transfers between the
combobox, remove buttons, options, and custom-tag input do not mark it touched.
The event's `currentTarget` is the field root and `target` is the element losing
focus. Closing the menu alone does not mark the field touched.

Pass `name="tags"` to serialize one hidden input per selected tag. Read values
with `new FormData(form).getAll('tags')`; an empty selection contributes no
entries. `isDisabled` excludes those inputs from submission and disables user
interaction. `isReadOnly` prevents opening, adding, or removing tags while
keeping the combobox focusable and selected tags included in submission.
Controlled `value` updates still work in either state.

`isRequired` sets `aria-required` only. The combobox and hidden inputs do not
provide native required-field constraint validation; validate the selected
array in your form. Pass `aria-invalid`, `aria-describedby`,
`aria-errormessage`, and `aria-labelledby` to associate validation feedback and
labels with the combobox. These do not replace its internal popup ARIA state.
The existing `ariaLabel` and `removeLabel` props remain supported and required.

### InputTag keyboard interaction

Focus stays on the combobox while navigating options, including after mouse or
touch selection. Arrow Down opens at the first option; Arrow Up opens at the
last. Enter or Space opens at the first option. While open, arrows move the
active option, Home/End move to the first/last option, and Enter/Space toggle
its selection. `aria-activedescendant` identifies the active option.

Remove buttons use native Enter/Space activation and return focus to the
combobox after removal. The optional custom-tag input remains independently
focusable: spaces and navigation keys edit text, and Enter adds a tag.
Escape closes the menu and returns focus to the combobox. Tab follows the
normal focus order through remove buttons and the custom-tag input; leaving
the whole field reports one `onBlur`. Inline and portalled menus share this
keyboard contract.

### Date validation and popup behavior

Numeric date drafts must match their whole format and name a real calendar
date. Impossible dates, incomplete input, wrong separators, and trailing text
are rejected rather than normalized. Single-digit months/days remain accepted;
Buddhist-era dates are validated against their underlying Gregorian year.
Named-month and weekday formats remain picker-only.

The JavaScript calendar moves focus to an enabled day when opened. Arrow keys
navigate, Enter/Space selects, and Escape returns to the opening control. Tab
closes the calendar and continues the form's natural focus order. Native mobile
pickers retain the operating system's interactions. InputNumber announces a
spinbutton only when `step` is configured; otherwise it is a numeric textbox.

InputTime and InputDateTime time lists use a body portal by default to escape
overflow containers. They open above or below according to available viewport
space, constrain their size, and follow scrolling/resizing. `portalZIndex`
defaults to 50. Set `portal={false}` to keep a list inside its field's container
(for example, inside a native dialog's top layer). Portalled lists retain the
field's local dark theme and `--rc-color-primary` value. The demo includes an
overflow-container example.

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
