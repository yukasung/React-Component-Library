# InputDate Floating Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the shared InputDate calendar outside clipping cards while retaining automatic viewport placement and all existing date-picker behavior.

**Architecture:** Keep Flatpickr bound to an imperatively-created hidden input inside its React-opaque host, avoiding React DOM-ownership conflicts. Switch Flatpickr from static to floating mode so its calendar is appended to `document.body`, and pass each component's visible input ref as Flatpickr's `positionElement` so placement and auto-flip use the actual field geometry.

**Tech Stack:** React 19, TypeScript, Flatpickr, Vitest, Testing Library, Vite, pnpm.

## Global Constraints

- Do not change `FormSectionCard` or introduce page-specific overflow styles.
- Preserve calendar dialog IDs and labels, combobox ARIA state, Thai/Buddhist Era behavior, keyboard controls, selection behavior, and disabled/read-only handling.
- Modify the shared hook so `InputDate` and `InputDateTime` provide their visible input refs.
- Rebuild the local component library and run `corepack pnpm install --force` in frontend before frontend verification.

---

## File Structure

- Modify `src/components/InputDate/useFlatpickrCalendar.ts`: accept a visible input ref and configure floating Flatpickr positioning.
- Modify `src/components/InputDate/InputDate.tsx`: pass its visible input ref to the shared calendar hook and remove the obsolete static-popup host positioning class.
- Modify `src/components/InputDateTime/InputDateTime.tsx`: pass `field.inputRef` to the shared calendar hook and remove the obsolete static-popup host positioning class.
- Modify `src/components/InputDate/InputDate.test.tsx`: prove an opened calendar is appended to `document.body` instead of the input wrapper.

### Task 1: Add a Floating-Calendar Regression Test

**Files:**

- Modify: `src/components/InputDate/InputDate.test.tsx`

**Interfaces:**

- Consumes: `InputDate` dropdown button with accessible name `Toggle calendar`.
- Produces: a regression assertion requiring the Flatpickr calendar to escape component ancestors.

- [ ] **Step 1: Write the failing test**

  Add a test in the calendar-popup describe block:

  ```tsx
  it('appends an opened calendar to document body so card overflow cannot clip it', async () => {
    const user = userEvent.setup()
    const { container } = render(<InputDate value={new Date(2026, 6, 15)} onChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Toggle calendar' }))

    const calendar = document.querySelector<HTMLElement>('.flatpickr-calendar')!
    expect(calendar.parentElement).toBe(document.body)
    expect(container).not.toContainElement(calendar)
  })
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npx vitest run src/components/InputDate/InputDate.test.tsx`

  Expected: FAIL because static Flatpickr nests `.flatpickr-calendar` in `.flatpickr-wrapper` inside the component host.

- [ ] **Step 3: Keep the existing interaction tests unchanged**

  Do not alter the dialog labelling, opening, closing, keyboard, Thai locale, or selection assertions; they continue to define the compatibility contract.

- [ ] **Step 4: Commit the red test only if the project convention allows incomplete commits**

  Do not commit a deliberately failing test in this repository. Proceed directly to Task 2 and commit the green implementation with its regression coverage.

### Task 2: Move Shared Calendars into Floating Mode

**Files:**

- Modify: `src/components/InputDate/useFlatpickrCalendar.ts`
- Modify: `src/components/InputDate/InputDate.tsx`
- Modify: `src/components/InputDateTime/InputDateTime.tsx`
- Test: `src/components/InputDate/InputDate.test.tsx`

**Interfaces:**

- Consumes: `RefObject<HTMLInputElement | null>` supplied by each calendar-owning input component.
- Produces: `UseFlatpickrCalendarOptions.positionElementRef`, used by Flatpickr as `positionElement` while the calendar remains a `document.body` child.

- [ ] **Step 1: Extend the hook contract**

  Add the position ref to the options interface:

  ```ts
  positionElementRef: RefObject<HTMLInputElement | null>
  ```

  Destructure it in `useFlatpickrCalendar` and pass the current visible input when creating Flatpickr:

  ```ts
  positionElement: positionElementRef.current ?? undefined,
  ```

- [ ] **Step 2: Switch Flatpickr to floating placement**

  Replace the static configuration with:

  ```ts
  static: false,
  ```

  Keep the hidden bound input inside the React-opaque `containerRef` host. In non-static mode Flatpickr appends `calendarContainer` to `document.body`; the hidden input remains untouched by React and safe to destroy.

- [ ] **Step 3: Wire both components to their visible input refs**

  In `InputDate`, add this option when calling the hook:

  ```tsx
  positionElementRef: inputElementRef,
  ```

  In `InputDateTime`, add:

  ```tsx
  positionElementRef: field.inputRef,
  ```

  Replace each now-unused static host class with a neutral empty host:

  ```tsx
  <div ref={containerRef} />
  ```

- [ ] **Step 4: Run focused tests to verify the implementation is green**

  Run: `npx vitest run src/components/InputDate/InputDate.test.tsx src/components/InputDateTime/InputDateTime.test.tsx`

  Expected: PASS, including the new body-parent assertion and all existing date/time calendar tests.

- [ ] **Step 5: Commit the component change**

  ```bash
  git add src/components/InputDate/useFlatpickrCalendar.ts src/components/InputDate/InputDate.tsx src/components/InputDateTime/InputDateTime.tsx src/components/InputDate/InputDate.test.tsx
  git commit -m "fix(input-date): float calendar above clipping containers"
  ```

### Task 3: Verify the Library and Client Create Integration

**Files:**

- Verify: component-library files from Task 2.
- Verify: `../frontend/src/modules/entities/clients/pages/ClientCreatePage.tsx` through its existing tests and build.

**Interfaces:**

- Consumes: the built `dist/` output from the component library.
- Produces: fresh evidence that frontend uses the rebuilt file dependency without regressions.

- [ ] **Step 1: Verify the complete component library**

  Run: `npm run test && npm run typecheck && npm run lint && npm run build`

  Expected: all commands exit 0.

- [ ] **Step 2: Refresh frontend's local library dependency**

  Run from `../frontend`: `corepack pnpm install --force`

  Expected: the package manager completes successfully and refreshes `file:../components` in its store.

- [ ] **Step 3: Verify Client Create and the frontend build**

  Run from `../frontend`:

  ```bash
  corepack pnpm test --run src/modules/entities/clients/pages/ClientCreatePage.test.tsx
  corepack pnpm typecheck
  corepack pnpm lint
  corepack pnpm build
  ```

  Expected: each command exits 0.

- [ ] **Step 4: Check the final component-library patch**

  Run: `git diff --check && git status --short`

  Expected: no whitespace errors and no uncommitted implementation files.
