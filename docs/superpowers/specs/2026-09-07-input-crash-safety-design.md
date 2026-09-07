# Input Crash Safety Design

## Scope

Fix three reviewed crash paths without changing component props, package exports, dependencies, or the established visual and interaction design:

- English `InputDate` and `InputDateTime` must mount when flatpickr selects its native mobile mode.
- Thai `InputDateTime` must format 12-hour values containing `K` without crashing.
- `InputNumber` must treat unsafe numeric precision formats as unsupported instead of allowing a later `RangeError`.

## Design

### Native mobile calendar lifecycle

Keep flatpickr's native mobile behavior for English and the forced JavaScript calendar for Thai Buddhist Era. Calendar-only DOM decoration must run only when `calendarContainer` exists. Effects that label or customize the JavaScript popup must also tolerate native mobile instances. Mobile selection must continue to flow through flatpickr's existing `onChange` callback.

### Complete locale formatting

Flatpickr localization objects are partial overrides. Before passing the Thai locale to the static formatter, merge it over flatpickr's complete default locale so missing time fields such as `amPM` remain available. Thai month and weekday overrides and Buddhist-year formatting remain unchanged.

### Precision validation

Reject unsafe precision at `parseNumericFormat`, the boundary shared by rendering, parsing, live formatting, and committing. Unsupported precision returns `undefined`, consistent with other unsupported format strings, and `InputNumber` follows its existing plain-number fallback.

The accepted maximum must account for every JavaScript numeric operation reached by that specifier. Fixed and exponential formatting cannot exceed the platform's supported digit range; percent precision must reserve the two extra underlying decimal places used during commits; general formatting must remain safe in both fixed and exponential branches. Padding-only formats must receive a bounded width to prevent unbounded output allocation.

## Testing

- Reproduce mobile mounting with an iPhone user agent for both date components and verify selection still commits.
- Reproduce Thai `h:i K` formatting through the pure helper and `InputDateTime`.
- Reproduce `F101` and `P99` without an error boundary crash, and test safe boundary values for each numeric specifier family.
- Run focused suites first, then lint, typecheck, all tests, build/package verification, and a dry-run package.
