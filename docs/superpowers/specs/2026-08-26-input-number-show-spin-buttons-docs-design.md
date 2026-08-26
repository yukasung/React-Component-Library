# InputNumber Show Spin Buttons Documentation Design

## Goal

Bring the published InputNumber documentation in line with the
`showSpinButtons` API.

## Content

Revise the `step` section so it documents the numeric increment, Arrow-key
stepping, optional wheel stepping, and precision inference only. Add a
`showSpinButtons` section directly afterward. It documents the false default,
the numeric-step prerequisite, and that visible buttons center the numeric
text. Its example opts in with `step={1} showSpinButtons`.

## Scope

Only `docs/app/components/input-number/page.mdx` changes; no component code,
runtime behavior, or documentation-site configuration changes are needed.
