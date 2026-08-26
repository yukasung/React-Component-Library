# InputDateTime range time options

## Goal

For paired event start and end `InputDateTime` fields, show every configured
time in the dropdown while disabling entries that would make the selected
timestamp fall outside the field's `min`/`max` range.

## Design

`InputDateTime` keeps its existing `min` and `max` API. When its displayed date
is the same calendar date as a bound, it derives a disabled state for each time
entry:

- a time earlier than `min` is disabled when the displayed day equals the
  `min` day;
- a time later than `max` is disabled when the displayed day equals the
  `max` day;
- on all other days, `min`/`max` do not disable time entries;
- the independent `timeMin`/`timeMax` list bounds continue to decide which
  entries exist at all.

`TimeList` receives the disabled state and renders disabled options with the
appropriate ARIA state and visual treatment. Disabled options cannot be chosen
by pointer. Keyboard navigation skips them, and Enter cannot commit them.

`ClientActivityDialog` supplies each field's dynamic whole-timestamp bound:

- the start field gets `max={endsAt}` when an end is present;
- the end field gets `min={startsAt}` when a start is present.

The existing validation remains the final guard: an end must be strictly after
the start. Therefore an end exactly equal to the start can be selected by the
shared control but remains invalid on form submission, preserving the current
business rule without inventing a hidden minimum increment.

## Tests

- `InputDateTime` shows all generated entries but marks bound-violating times
  disabled on the bound's date only.
- Disabled entries cannot be picked by click or keyboard; keyboard movement
  reaches the next enabled entry.
- `ClientActivityDialog` passes the mutually dependent bounds so its start and
  end dropdowns expose the disabled options.

## Scope

This change does not alter typed-value clamping, time-list generation, calendar
date disablement, or activity validation messages.
