# InputNumber Show Spin Buttons Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the `showSpinButtons` API and correct the `step` behavior description.

**Architecture:** Update the InputNumber MDX page only. The `step` section describes increments and keyboard/wheel behavior; a following `showSpinButtons` section describes visual opt-in and its centered text layout.

**Tech Stack:** MDX, Next.js, Nextra.

## Global Constraints

- Modify only `docs/app/components/input-number/page.mdx` for published documentation.
- State that `showSpinButtons` defaults to `false` and requires numeric `step` to render controls.
- Do not mention internal issue-tracking or implementation workflow in published docs.

---

### Task 1: Document explicit spinner visibility

**Files:**
- Modify: `components/docs/app/components/input-number/page.mdx:103-125`

**Interfaces:**
- Consumes: `InputNumberProps.step?: number | null` and `InputNumberProps.showSpinButtons?: boolean`.
- Produces: Accurate Thai-first API documentation and an opt-in usage example.

- [ ] **Step 1: Replace the stale `step` copy**

Replace the statement that `step` controls visibility with text saying that omitting `step` disables spinner-button, Arrow-key, and wheel increments because no increment amount is defined. Preserve the precision-inference explanation.

- [ ] **Step 2: Add the `showSpinButtons` section**

Insert this section after the `step` example:

```mdx
### showSpinButtons

<PropertySignature name="showSpinButtons" type="boolean" />

กำหนดว่าจะแสดงปุ่มลดและเพิ่มค่าหรือไม่ ค่าเริ่มต้นคือ false เมื่อเป็น true ต้องระบุ `step` เป็นตัวเลขด้วยจึงจะแสดงปุ่ม และตัวเลขใน input จะจัดกึ่งกลาง

```tsx
<InputNumber step={1} showSpinButtons defaultValue={1} />
```
```

- [ ] **Step 3: Verify MDX in the documentation build**

Run: `npm run build`

Working directory: `components/docs`

Expected: PASS with the InputNumber MDX page compiled successfully.

- [ ] **Step 4: Commit the documentation change**

```bash
git -C components add docs/app/components/input-number/page.mdx
git -C components commit -m "docs: document input number spin button visibility"
```
