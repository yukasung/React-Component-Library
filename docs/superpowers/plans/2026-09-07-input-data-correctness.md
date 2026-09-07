# Input Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct controlled-value synchronization, numeric bounds/format round trips, and Thai datetime year parsing without changing the public component APIs.

**Architecture:** Keep the existing per-component commit model and pure helper boundaries. Add regression tests at the observable component or helper seam, then make the smallest local correction in each owner.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite.

## Global Constraints

- Preserve all existing public component and helper signatures.
- Do not add, remove, or replace dependencies.
- Preserve controlled and uncontrolled modes and the current explicit commit points.
- Preserve Gregorian `Date` values while presenting Thai years as Buddhist Era.
- Use test-first development and verify every regression fails before its fix.

---

### Task 1: Synchronize controlled commit baselines

**Files:**
- Modify: `src/components/InputNumber/InputNumber.tsx`
- Modify: `src/components/InputDate/InputDate.tsx`
- Modify: `src/components/InputTime/InputTime.tsx`
- Modify: `src/components/InputDateTime/useDateTimeField.ts`
- Test: the four corresponding component test files

**Interfaces:**
- Consumes: existing `value`, `committedValue`, and semantic Date comparison helpers.
- Produces: unchanged `onChange` contracts whose deduplication baseline follows external controlled values.

- [ ] Add one regression per component: render controlled value A, rerender with B, interact back to A, and expect `onChange(A)`.
- [ ] Run the four focused tests and confirm they fail because `lastCommittedRef` is stale.
- [ ] Track the previous controlled prop separately and update `lastCommittedRef` only when the authoritative controlled value changes externally.
- [ ] Run the focused tests and confirm they pass.
- [ ] Commit the task.

### Task 2: Enforce bounds after numeric precision

**Files:**
- Modify: `src/components/InputNumber/InputNumber.tsx`
- Test: `src/components/InputNumber/InputNumber.test.tsx`

**Interfaces:**
- Consumes: `applyPrecision(value, precision, truncate)` and `clamp(value, min, max)`.
- Produces: `clampToPrecision(raw)` whose returned number always satisfies `min` and `max`.

- [ ] Add a regression showing `0.2 + 0.1` with `max={0.25}` never emits `0.3`.
- [ ] Run the focused test and confirm it fails with the out-of-range emission.
- [ ] Change the pipeline to clamp both before and after precision: `clamp(applyPrecision(clamp(raw, min, max), effectivePrecision, truncate), min, max)`.
- [ ] Run the focused test and existing InputNumber suite.
- [ ] Commit the task.

### Task 3: Make every numeric format parse its own output

**Files:**
- Modify: `src/lib/number.ts`
- Test: `src/lib/number.test.ts`
- Test: `src/components/InputNumber/InputNumber.test.tsx`

**Interfaces:**
- Consumes: `formatWithSpec(value, spec)`.
- Produces: unchanged `parseFormattedInput(raw, spec)` accepting E/G/R exponent output and signed X output.

- [ ] Add round-trip regressions for E2, G2, R with a small exponent, and X with `-1`; include an untouched-blur InputNumber regression for signed X.
- [ ] Run the focused tests and confirm exponent parses are `undefined` and signed X changes value.
- [ ] Accept complete decimal scientific notation for E/G/R.
- [ ] Format negative X values with a leading minus so their text has an unambiguous inverse, matching the published documentation.
- [ ] Run both focused suites and confirm all round trips pass.
- [ ] Commit the task.

### Task 4: Correct Buddhist Era datetime parsing

**Files:**
- Modify: `src/lib/dateTime.ts`
- Test: `src/lib/dateTime.test.ts`
- Test: `src/components/InputDateTime/InputDateTime.test.tsx`

**Interfaces:**
- Consumes: `parseDateTimeDraft(raw, format, yearOffset)`.
- Produces: Gregorian `Date` values; four-digit explicit years subtract the offset, two-digit years map within the displayed era century, and omitted years retain the current Gregorian year.

- [ ] Add regressions for Thai `y` input `69` producing 2026 and a format without a year retaining the current Gregorian year.
- [ ] Run the focused tests and confirm the years are incorrectly shifted.
- [ ] Record whether a year token was captured; expand short years using the era century before subtracting the offset, and subtract only when a year was explicit.
- [ ] Run both focused suites and confirm the regressions pass.
- [ ] Commit the task.

### Task 5: Final validation and review

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: reviewed, buildable package artifacts.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm pack --dry-run`.
- [ ] Review the complete diff for scope, API compatibility, test quality, and generated artifacts.

