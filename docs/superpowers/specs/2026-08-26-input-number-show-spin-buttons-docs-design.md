# InputNumber Show Spin Buttons Documentation Design

## Goal

Bring the published InputNumber documentation in line with the
`showSpinButtons` API.

## Content

Revise the `step` section so it documents the numeric increment, Arrow-key
stepping, optional wheel stepping, and precision inference only. Add a
`showSpinButtons` section directly afterward. It documents the false default,
the numeric-step prerequisite, and that visible buttons center the numeric
text. Add `showSpinButtons` immediately after `step` in the Properties index.

The property section includes a live, two-column comparison. Both inputs use
`step={1}`: the first leaves `showSpinButtons` at its false default and the
second opts in with `showSpinButtons`. This makes the visibility and centered
text behavior directly observable without conflating it with step support.
The static example continues to show `step={1} showSpinButtons`.

## Scope

Only the InputNumber documentation page, its property index, and its demo
module change. No component code, runtime behavior, or documentation-site
configuration changes are needed.
