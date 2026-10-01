# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes.

## [0.4.0] - 2026-10-01

### Added

- `MultiSelect`, a closed-set multiple-choice field, published at
  `@yukasung/react-components/multi-select`. Options are `{ value, label }`
  objects and `onChange` reports the checked values in `options` order; the
  field itself shows a summary header (`"3 items selected"`) rather than growing
  with the selection, which is what distinguishes it from `InputTag`. Optional
  filter input, select-all checkbox, and a portalled popup.
- The `multi-select` spec under `specs/components/`, and `src/lib/optionList.ts`
  holding the option-list rules (ordering, filtering, header summary,
  select-all state) independently of the component.

### Fixed

- The package is linked to its repository again, which is what lets the release
  workflow publish it. The `repository` field had been removed in August 2026, so
  every tag after `v0.1.0` failed to publish with a `403 write_package` and the
  intervening versions reached the registry by hand.
- `package-lock.json` was left at `0.2.4` through the `0.3.0` release and is now
  in step with `package.json`, so `npm ci` resolves the version it should.

## [0.3.0] - 2026-09-29

### Added

- `InputMask`, a masked text field, published at `@yukasung/react-components/input-mask`.
  The mask vocabulary is `0 9 # L l A a` with `\` escapes and `> < |` case
  conversion; `onChange` reports the value with the mask's literals removed and
  one character per fillable position, so a value round-trips back through
  `value` unchanged. Positions hold grapheme clusters, which is what lets Thai
  be typed into them.
- Spec-driven development under `specs/`, with component standards and the
  `input-mask` requirements, plan and validation documents.

## [0.2.2] - 2026-09-08

### Fixed

- Release the calendar focus fix from a committed source revision and update
  installation documentation. No public API changes from 0.2.1.

## [0.2.1] - 2026-09-08

### Fixed

- Opening InputDate or InputDateTime calendars no longer scrolls the page when
  focus enters the calendar before its popup has been positioned.

## [0.2.0] - 2026-09-08

### Added

- Private GitHub Packages distribution with public component entry points,
  TypeScript declarations, and scoped styles.
