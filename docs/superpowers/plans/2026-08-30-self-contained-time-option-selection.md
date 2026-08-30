# Self-contained Time Option Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep selected time options visibly themed when the library is consumed by an application whose Tailwind build does not scan library source.

**Architecture:** `InputDateTime` and `InputTime` retain their existing utility-class layout and interaction styling. Each renderer applies the selected option's foreground and background as an inline style, using the library's existing `--rc-color-primary` theme hook.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- Change only the component library; do not modify frontend Tailwind source detection.
- Preserve the `--rc-color-primary` theme hook with fallback `#465fff`.
- Keep time-list ARIA, keyboard, hover, disabled, and highlight behavior unchanged.
- Build `components`, then force-refresh frontend's `file:` dependency.

---

### Task 1: Make selected time-option colors self-contained

**Files:**

- Modify: `components/src/components/InputDateTime/styles.ts:48-54`
- Modify: `components/src/components/InputDateTime/TimeList.tsx:47-62`
- Modify: `components/src/components/InputDateTime/InputDateTime.test.tsx:665-675`
- Modify: `components/src/components/InputTime/InputTime.tsx:143-148,713-725`
- Modify: `components/src/components/InputTime/InputTime.test.tsx:540-548`

**Interfaces:**

- Consumes: `isSelected` booleans computed by each time-list renderer.
- Produces: selected options with inline `backgroundColor: 'var(--rc-color-primary, #465fff)'` and `color: 'white'`.

- [ ] **Step 1: Write the failing tests**

Add assertions that the currently selected list option has:

```tsx
toHaveStyle({
  backgroundColor: 'var(--rc-color-primary, #465fff)',
  color: 'white',
})
```

- [ ] **Step 2: Verify the tests fail**

Run `npm test -- --run src/components/InputDateTime/InputDateTime.test.tsx src/components/InputTime/InputTime.test.tsx` in `components`. The new style assertions must fail because no inline style exists.

- [ ] **Step 3: Implement the minimal behavior**

Change each `optionClassName` selected branch to retain only `font-medium`. On the corresponding option element, apply:

```tsx
style={isSelected ? { backgroundColor: 'var(--rc-color-primary, #465fff)', color: 'white' } : undefined}
```

In `InputTime`, define `const isSelected = minutes === displayMinutes` inside the `times.map` callback and use it for `aria-selected`, `style`, and `optionClassName`.

- [ ] **Step 4: Verify the focused tests pass**

Run `npm test -- --run src/components/InputDateTime/InputDateTime.test.tsx src/components/InputTime/InputTime.test.tsx` in `components`.

- [ ] **Step 5: Refresh the consumer and run full verification**

Run `npm run build` in `components`, then `corepack pnpm install --force` in `frontend`. Run the component test suite and build; then run frontend test, typecheck, lint, build, and `git diff --check` for both repositories.
