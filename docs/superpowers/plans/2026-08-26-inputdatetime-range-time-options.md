# InputDateTime Range Time Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every time entry visible in paired event date-time fields, while disabling entries outside the other field's selected timestamp.

**Architecture:** `InputDateTime` derives an index-aligned disabled list from its whole-timestamp `min`/`max` bounds and the date currently displayed. `TimeList` renders that state, while the reusable dropdown hook skips disabled indices for opening, arrows, Home/End, and Enter. The client activity dialog supplies each event field the other's value as its dynamic bound.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- Preserve the existing `InputDateTime` public props; use its existing `min` and `max` rather than adding a new API.
- Keep `timeMin`/`timeMax` responsible for which entries exist; timestamp bounds only disable existing entries on their matching calendar day.
- Preserve typed-value clamping and the existing strict `endsAt > startsAt` form validation.
- Disabled options must be visible, have `aria-disabled="true"`, reject pointer selection, and be unreachable through keyboard selection.
- Do not add a production dependency.
- Component-library commands run in `components/`; after its build, refresh frontend's `file:../components` dependency with `corepack pnpm install --force` in `frontend/`.

---

## File structure

- Modify `components/src/components/InputDateTime/InputDateTime.tsx`: derive disabled time entries and pass them into list/dropdown behavior.
- Modify `components/src/components/InputDateTime/TimeList.tsx`: render disabled options semantically and prevent pointer activation.
- Modify `components/src/components/InputDateTime/styles.ts`: add disabled option styling without changing enabled states.
- Modify `components/src/components/InputTime/useTimeDropdown.ts`: accept disabled indices and keep the highlighted index on an enabled item.
- Modify `components/src/components/InputDateTime/InputDateTime.test.tsx`: verify same-day bounds, disabled ARIA/pointer behavior, and keyboard skipping.
- Modify `frontend/src/modules/entities/clients/components/ClientActivityDialog.tsx`: wire dynamic start/end bounds.
- Modify `frontend/src/modules/entities/clients/components/ClientActivityDialog.test.tsx`: verify the paired dropdown states in the dialog.

### Task 1: Add accessible disabled time options to the component library

**Files:**
- Modify: `components/src/components/InputTime/useTimeDropdown.ts`
- Modify: `components/src/components/InputDateTime/TimeList.tsx`
- Modify: `components/src/components/InputDateTime/styles.ts`
- Modify: `components/src/components/InputDateTime/InputDateTime.tsx`
- Test: `components/src/components/InputDateTime/InputDateTime.test.tsx`

**Interfaces:**
- Consumes: existing `min?: Date | null`, `max?: Date | null`, `times: number[]`, and `useTimeDropdown` navigation state.
- Produces: `disabled: boolean[]` on `TimeListProps`, and `disabledIndices: readonly number[]` on `UseTimeDropdownOptions`.

- [ ] **Step 1: Write failing component tests**

  Add tests in the `the two popups` suite. Use a same-day 09:00–10:00 bound with a 30-minute list and assert that all three entries remain rendered, but 09:00 is disabled for a `min` of 09:30 and 10:00 is disabled for a `max` of 09:30. Assert `aria-disabled="true"` and that clicking a disabled option does not call `onChange`.

  ```tsx
  render(
    <InputDateTime
      value={new Date(2026, 6, 15, 9, 30)}
      min={new Date(2026, 6, 15, 9, 30)}
      max={new Date(2026, 6, 15, 9, 30)}
      timeMin={new Date(2026, 0, 1, 9, 0)}
      timeMax={new Date(2026, 0, 1, 10, 0)}
      timeStep={30}
      onChange={onChange}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Toggle time list' }))
  expect(screen.getByRole('option', { name: '09:00' })).toHaveAttribute('aria-disabled', 'true')
  await user.click(screen.getByRole('option', { name: '09:00' }))
  expect(onChange).not.toHaveBeenCalled()
  ```

  Add a keyboard test where the selected 09:30 item is bounded by disabled 09:00 and 10:00, then verify Home/End keep the active descendant on 09:30 and Enter commits only 09:30. Add a separate next-day value test proving that the same 09:00 and 10:00 options are enabled when the displayed date does not equal either bound date.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npx vitest run src/components/InputDateTime/InputDateTime.test.tsx -t "disables time options outside same-day bounds"`

  Expected: FAIL because options do not yet expose `aria-disabled` and click still calls `onChange`.

- [ ] **Step 3: Implement disabled-entry derivation and interaction guards**

  In `InputDateTime.tsx`, derive a boolean for each generated time with local-calendar-day comparisons (year, month, and day) against `min` and `max`. A time is disabled when its displayed day equals `min`'s day and its minutes are less than `timeOfDayMinutes(min)`, or equals `max`'s day and its minutes are greater than `timeOfDayMinutes(max)`.

  ```tsx
  const disabledTimeIndices = useMemo(
    () => times.flatMap((minutes, index) => {
      const day = field.displayValue
      const beforeMin = day && min && sameLocalDay(day, min) && minutes < timeOfDayMinutes(min)
      const afterMax = day && max && sameLocalDay(day, max) && minutes > timeOfDayMinutes(max)
      return beforeMin || afterMax ? [index] : []
    }),
    [field.displayValue, max, min, times],
  )
  ```

  Define `sameLocalDay(left: Date, right: Date): boolean` beside the component constants using `getFullYear`, `getMonth`, and `getDate`. Pass `disabledTimeIndices` to `useTimeDropdown` and an index-aligned `disabled={times.map((_, index) => disabledTimeIndices.includes(index))}` to `TimeList`. Change `pickTime` to return before committing a disabled minute.

  Extend the hook options with `disabledIndices: readonly number[]`. Normalize open/highlight/home/end/move results to the nearest enabled index, returning `-1` only when no option is enabled. Keep `aria-activedescendant` undefined for `-1`; make the Enter branch close without calling `pickTime` when no enabled item is highlighted.

  ```ts
  function nextEnabledIndex(start: number, direction: 1 | -1): number {
    for (let index = start; index >= 0 && index < itemCount; index += direction) {
      if (!disabledIndices.includes(index)) return index
    }
    return -1
  }
  ```

  In `TimeList`, add `disabled: boolean[]`; render `aria-disabled={disabled[index] || undefined}`, prevent click for disabled items, and call `optionClassName(isSelected, isHighlighted, isDisabled)`. Update the style helper so disabled entries use muted text and `cursor-not-allowed`, with no hover styling; never mark a disabled entry selected or highlighted.

- [ ] **Step 4: Run the focused component tests to verify they pass**

  Run: `npx vitest run src/components/InputDateTime/InputDateTime.test.tsx`

  Expected: PASS, including existing popup, Arrow/Enter, and time-list tests.

- [ ] **Step 5: Run component quality checks and commit**

  Run:

  ```bash
  npm run typecheck
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: all commands exit 0. Commit only the five component-library files:

  ```bash
  git add src/components/InputDateTime/InputDateTime.tsx src/components/InputDateTime/TimeList.tsx src/components/InputDateTime/styles.ts src/components/InputTime/useTimeDropdown.ts src/components/InputDateTime/InputDateTime.test.tsx
  git commit -m "feat: disable unavailable datetime options"
  ```

### Task 2: Wire event start/end bounds in the client dialog

**Files:**
- Modify: `frontend/src/modules/entities/clients/components/ClientActivityDialog.tsx`
- Test: `frontend/src/modules/entities/clients/components/ClientActivityDialog.test.tsx`

**Interfaces:**
- Consumes: built `InputDateTime` support for `min`/`max`-derived disabled options.
- Produces: event start control with `max={draft.endsAt}` and end control with `min={draft.startsAt}`.

- [ ] **Step 1: Refresh the local component dependency and write a failing dialog test**

  From `frontend/`, run `corepack pnpm install --force` after Task 1's library build. In the English dialog test suite, enter a start of `08/26/2026 09:30`, open the end time list, and assert that 09:00 has `aria-disabled="true"` while 09:30 and later times remain enabled. Then set an end of `08/26/2026 10:00`, open the start list, and assert that 10:15 is disabled while 10:00 remains enabled.

  ```tsx
  await enterDateTime(user, within(dialog).getByRole('combobox', { name: 'Starts at' }), '08/26/2026 09:30')
  await user.click(within(dialog).getByRole('button', { name: 'Toggle time list for Ends at' }))
  expect(within(dialog).getByRole('option', { name: '09:00' })).toHaveAttribute('aria-disabled', 'true')
  ```

- [ ] **Step 2: Run the dialog test to verify it fails**

  Run: `corepack pnpm vitest run src/modules/entities/clients/components/ClientActivityDialog.test.tsx -t "disables event times outside the paired range"`

  Expected: FAIL because the dialog currently passes no dynamic timestamp bounds.

- [ ] **Step 3: Pass the cross-field bounds into the two controls**

  Add `max={draft.endsAt}` to the start `InputDateTime` and `min={draft.startsAt}` to the end `InputDateTime`; leave the task's `dueAt` control unchanged.

  ```tsx
  <InputDateTime
    id="client-activity-starts-at"
    value={draft.startsAt}
    max={draft.endsAt}
    onChange={(startsAt) => setDraft((current) => ({ ...current, startsAt }))}
    {...dateTimeAria(t('create.activities.startsAt'))}
  />
  ```

  ```tsx
  <InputDateTime
    id="client-activity-ends-at"
    value={draft.endsAt}
    min={draft.startsAt}
    onChange={(endsAt) => setDraft((current) => ({ ...current, endsAt }))}
    {...dateTimeAria(t('create.activities.endsAt'))}
  />
  ```

- [ ] **Step 4: Run dialog tests to verify they pass**

  Run: `corepack pnpm vitest run src/modules/entities/clients/components/ClientActivityDialog.test.tsx`

  Expected: PASS; the prior test that submits an invalid equal/earlier end still demonstrates the strict submit validation is unchanged.

- [ ] **Step 5: Run frontend verification and commit**

  Run:

  ```bash
  corepack pnpm typecheck
  corepack pnpm lint
  corepack pnpm test --run
  corepack pnpm build
  git diff --check
  ```

  Expected: all commands exit 0. Commit only the client dialog files:

  ```bash
  git add src/modules/entities/clients/components/ClientActivityDialog.tsx src/modules/entities/clients/components/ClientActivityDialog.test.tsx
  git commit -m "feat: constrain activity datetime ranges"
  ```

## Plan self-review

- Spec coverage: Task 1 covers visible disabled entries, same-day range behavior, ARIA, pointer, and keyboard behavior; Task 2 wires reciprocal event bounds while preserving strict validation.
- Placeholder scan: no unresolved tasks, vague test instructions, or undefined interfaces remain.
- Type consistency: `disabledIndices` is produced by `InputDateTime` and consumed by `useTimeDropdown`; the aligned `disabled` boolean array is consumed only by `TimeList`.
