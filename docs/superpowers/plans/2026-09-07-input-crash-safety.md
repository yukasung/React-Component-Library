# Input Crash Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the reviewed mobile calendar, Thai 12-hour formatting, and numeric precision crashes.

**Architecture:** Keep each correction at the narrow owner boundary: calendar instance lifecycle in `useFlatpickrCalendar`, locale completion in `date.ts`, and precision acceptance in `parseNumericFormat`. Preserve existing component APIs and fallbacks.

**Tech Stack:** React 19, TypeScript, flatpickr 4.6.13, Vitest, Testing Library, Vite.

## Global Constraints

- Preserve all existing public component and helper signatures.
- Do not add, remove, or replace dependencies.
- Preserve English native mobile date picking and Thai JavaScript/Buddhist Era calendar behavior.
- Preserve controlled and uncontrolled modes and current explicit commit points.
- Invalid or unsafe numeric format strings must use the existing unsupported-format fallback and must not throw.
- Use test-first development and verify every regression fails before its fix.

---

### Task 1: Support flatpickr native mobile instances

**Files:**
- Modify: `src/components/InputDate/useFlatpickrCalendar.ts`
- Test: `src/components/InputDate/InputDate.test.tsx`
- Test: `src/components/InputDateTime/InputDateTime.test.tsx`

**Interfaces:**
- Consumes: flatpickr `Instance`, including mobile instances without a JavaScript calendar container.
- Produces: unchanged `useFlatpickrCalendar` result and component APIs.

- [ ] Add iPhone-user-agent regressions showing default English InputDate and InputDateTime mount and native selection reaches `onChange`.
- [ ] Run both focused suites and confirm mobile initialization fails at calendar-container decoration.
- [ ] Guard JavaScript-calendar-only DOM work and effects while retaining native mobile behavior.
- [ ] Run both suites and confirm mobile and desktop cases pass.
- [ ] Commit the task.

### Task 2: Complete partial locales before date/time formatting

**Files:**
- Modify: `src/lib/date.ts`
- Test: `src/lib/date.test.ts`
- Test: `src/components/InputDateTime/InputDateTime.test.tsx`

**Interfaces:**
- Consumes: `flatpickr.CustomLocale` partial overrides.
- Produces: unchanged `formatDateValue` that supplies a complete locale to flatpickr.

- [ ] Add pure and component regressions for Thai `Y-m-d h:i K` formatting at 14:30.
- [ ] Run the focused tests and confirm the missing `amPM` crash.
- [ ] Merge the custom locale over flatpickr's default locale at the formatting boundary.
- [ ] Run focused tests and existing Thai date/datetime coverage.
- [ ] Commit the task.

### Task 3: Reject unsafe numeric precision formats

**Files:**
- Modify: `src/lib/number.ts`
- Test: `src/lib/number.test.ts`
- Test: `src/components/InputNumber/InputNumber.test.tsx`

**Interfaces:**
- Consumes: standard numeric format strings in `parseNumericFormat(format)`.
- Produces: the existing `NumericFormatSpec | undefined` contract with per-specifier safe precision validation.

- [ ] Add parser boundary tests for accepted safe maxima and rejected unsafe values, including `F101` and `P99`.
- [ ] Add component regressions proving unsafe formats render and commit through the existing fallback without throwing.
- [ ] Run focused tests and confirm current unsafe formats throw or parse as accepted.
- [ ] Add explicit per-specifier limits covering fixed/exponential operations, percent's two extra commit digits, general-format branches, and padding allocation.
- [ ] Run both focused suites and confirm boundary behavior passes.
- [ ] Commit the task.

### Task 4: Validate and review the combined fixes

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: reviewed package artifacts with unchanged public contracts.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm pack --dry-run` with an isolated cache if the user cache remains unwritable.
- [ ] Run `git diff --check` and complete a whole-branch Astra review.
