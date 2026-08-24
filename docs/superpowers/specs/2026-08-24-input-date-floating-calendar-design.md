# InputDate Floating Calendar Design

## Goal

Prevent the shared `InputDate` calendar popup from being clipped by a card or
other ancestor that uses `overflow: hidden`, while preserving Flatpickr's
automatic below/above placement.

## Root Cause

`InputDate` configures Flatpickr in static mode, which nests the calendar
inside the control's DOM subtree. The Client Create page places that subtree
inside `FormSectionCard`, whose `overflow-hidden` clips a calendar that
extends beyond the card.

## Design

The Flatpickr integration will use its non-static floating mode. Flatpickr
will append the calendar container to `document.body`, outside clipping card
ancestors, and position it relative to the visible React input rather than the
library's imperatively-created hidden bound input.

The calendar hook receives the visible input element as its positioning
element. `InputDate` supplies its existing visible input ref. The same hook
interface remains available to `InputDateTime`, so it can retain its current
behavior and migrate to the visible input position element as required by the
shared hook contract.

## Behavior and Accessibility

- The current calendar dialog ID, label, button `aria-expanded`, and
  `aria-controls` behavior remain unchanged.
- Flatpickr's built-in placement calculates available viewport space and opens
  above the field when there is not enough room below.
- The calendar remains visible above card borders and neighboring form
  sections; no page-specific overflow override is needed.
- Existing Thai locale, Buddhist Era, keyboard, selection, and disabled/read
  only behavior remain unchanged.

## Verification

Add a regression test that opens the calendar and asserts it is a direct child
of `document.body`, not nested in the input wrapper. Retain the existing
dialog and selection tests. Run the component library's focused and complete
test suites, typecheck, lint, and build. Then rebuild the library, refresh the
frontend's local file dependency, and run the Client Create test plus frontend
typecheck, lint, and build.
