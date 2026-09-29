# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No unreleased changes.

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
