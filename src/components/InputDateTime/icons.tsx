// The two drop-down icons, in their own file so styles.ts can hold plain values
// without breaking Fast Refresh (a module exporting both components and
// non-components is re-created on every edit).

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.75V8l2.25 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
