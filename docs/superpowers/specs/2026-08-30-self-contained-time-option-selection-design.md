# Self-contained time-option selection styling

## Goal

Ensure the selected option in `InputDateTime` and `InputTime` remains visible in every consuming application without requiring that application's Tailwind build to scan component-library source.

## Design

The two time-list renderers will keep their layout, hover, highlight, disabled, accessibility, and `--rc-color-primary` theme contract. Their selected-state colors will no longer be represented by Tailwind utility classes that consumers must generate. Instead, the selected option element will receive an inline style with `backgroundColor: 'var(--rc-color-primary, #465fff)'` and `color: 'white'`.

`optionClassName` will retain only the selected-state typography (`font-medium`) and all non-selected utility classes. `InputDateTime` applies the style in `TimeList`; `InputTime` applies the same style at its inline list option. This mirrors the existing intentional duplication between the two input implementations.

## Scope

- Modify only the component library's `InputDateTime` and `InputTime` sources and their tests.
- Do not change MatterSolv frontend Tailwind source detection or add dependencies.
- Build the component library and refresh the frontend's `file:` dependency after the library test cycle.

## Verification

Add regression tests that open each time list, find its selected option, and assert the option has the inline primary background and white text. Run the focused tests, then the relevant library and frontend verification commands.
