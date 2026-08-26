# InputNumber Show Spin Buttons Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `showSpinButtons` in the InputNumber Properties index and provide a live comparison demo alongside its API documentation.

**Architecture:** Keep the property list in `property-index.tsx`, implement the interactive comparison in `demo.tsx`, and compose both from `page.mdx`. Both demo inputs use `step={1}` so the comparison isolates the `showSpinButtons` visibility behavior.

**Tech Stack:** MDX, Next.js, Nextra.

## Global Constraints

- Modify only the InputNumber page, property index, and demo module for published documentation.
- State that `showSpinButtons` defaults to `false` and requires numeric `step` to render controls.
- Place `showSpinButtons` immediately after `step` in the Properties index.
- Show a live two-column comparison of the false default and true opt-in.
- Do not mention internal issue-tracking or implementation workflow in published docs.

---

### Task 1: Add the property index entry and live comparison

**Files:**
- Modify: `components/docs/app/components/input-number/property-index.tsx:4-18`
- Modify: `components/docs/app/components/input-number/demo.tsx:141-170`
- Modify: `components/docs/app/components/input-number/page.mdx:1-130`

**Interfaces:**
- Consumes: `InputNumberProps.step?: number | null` and `InputNumberProps.showSpinButtons?: boolean`.
- Produces: `ShowSpinButtonsDemo(): JSX.Element`, a `#showspinbuttons` property link, and the rendered live demo.

- [x] **Step 1: Verify the missing docs contracts**

Run:

```bash
rg -n "name: 'showSpinButtons'" docs/app/components/input-number/property-index.tsx
rg -n "export function ShowSpinButtonsDemo" docs/app/components/input-number/demo.tsx
```

Working directory: `components`

Expected: both commands exit 1 because the property entry and live demo are missing.

- [x] **Step 2: Add `showSpinButtons` to the Properties index**

Insert immediately after `step`:

```tsx
{ name: 'showSpinButtons', href: '#showspinbuttons' },
```

- [x] **Step 3: Implement the live comparison demo**

Add after `StepDemo`:

```tsx
export function ShowSpinButtonsDemo() {
  const [hiddenValue, setHiddenValue] = useState<number | null>(1)
  const [visibleValue, setVisibleValue] = useState<number | null>(1)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-spin-buttons-hidden" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons={'{false}'} (default)
        </label>
        <InputNumber id="demo-spin-buttons-hidden" step={1} value={hiddenValue} onChange={setHiddenValue} />
      </div>
      <div>
        <label htmlFor="demo-spin-buttons-visible" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons
        </label>
        <InputNumber id="demo-spin-buttons-visible" step={1} showSpinButtons value={visibleValue} onChange={setVisibleValue} />
      </div>
    </div>
  )
}
```

- [x] **Step 4: Render the demo in the property section**

Import `ShowSpinButtonsDemo` from `./demo`, then render it before the static example:

```mdx
<ShowSpinButtonsDemo />

<InputNumber step={1} showSpinButtons defaultValue={1} />
```

- [x] **Step 5: Verify the contracts and documentation build**

Run the two `rg` commands from Step 1 again. Expected: both exit 0 and show one matching line.

Run: `npm run build`

Working directory: `components/docs`

Expected: PASS with the InputNumber MDX page compiled successfully.

- [x] **Step 6: Commit the documentation change**

```bash
git -C components add docs/app/components/input-number/page.mdx docs/app/components/input-number/property-index.tsx docs/app/components/input-number/demo.tsx docs/superpowers/plans/2026-08-26-input-number-show-spin-buttons-docs.md
git -C components commit -m "docs: add input number spin button demo"
```
