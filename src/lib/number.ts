// Parses a raw draft string into a value to commit.
// `null` means "empty, a valid cleared state"; `undefined` means the string
// isn't parseable as a finite number at all — callers use that distinction
// to decide between committing and reverting the draft.
export function parseDraft(raw: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function formatValue(value: number | null, precision?: number): string {
  if (value === null) return ''
  return typeof precision === 'number' ? value.toFixed(precision) : String(value)
}

export function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (typeof min === 'number') next = Math.max(min, next)
  if (typeof max === 'number') next = Math.min(max, next)
  return next
}

// Avoids float artifacts (e.g. 0.1 + 0.2 -> 0.30000000000000004) from
// repeated step arithmetic.
export function roundToPrecision(value: number, precision?: number): number {
  return typeof precision === 'number' ? Number(value.toFixed(precision)) : value
}

// Infers decimal places from a fractional `step` (e.g. 0.1 -> 1) so
// increment/decrement doesn't accumulate float garbage. Integer steps need
// no rounding.
export function resolvePrecision(step?: number): number | undefined {
  if (typeof step === 'number' && !Number.isInteger(step)) {
    return String(step).split('.')[1]?.length
  }
  return undefined
}

// Cuts off excess decimal digits instead of rounding them (e.g. 2.999 at
// precision 1 -> 2.9, not 3.0).
export function truncateToPrecision(value: number, precision?: number): number {
  if (typeof precision !== 'number') return value
  const factor = 10 ** precision
  return Math.trunc(value * factor) / factor
}

// Picks rounding vs. truncation for reducing a value to `precision` decimal
// places, per the `truncate` prop.
export function applyPrecision(value: number, precision?: number, truncate = false): number {
  return truncate ? truncateToPrecision(value, precision) : roundToPrecision(value, precision)
}

const DRAFT_PATTERN = /^-?\d*\.?\d*$/

// Structural check for an in-progress typed value: only a leading `-`,
// digits, and at most one `.` are allowed. Deliberately more permissive than
// parseDraft — "-" or "1." are valid partial input, not yet valid numbers;
// parseDraft still governs whether a draft can commit.
export function isValidDraft(raw: string): boolean {
  return DRAFT_PATTERN.test(raw.trim())
}

export function toggleSign(draft: string): string {
  return draft.startsWith('-') ? draft.slice(1) : `-${draft}`
}

export function stripSign(draft: string): string {
  return draft.startsWith('-') ? draft.slice(1) : draft
}
