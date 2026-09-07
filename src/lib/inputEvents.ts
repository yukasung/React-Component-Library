import type { SyntheticEvent } from 'react'

// Interaction callbacks can cancel the control's keyboard/pointer action.
export function composeInputEvent<E extends SyntheticEvent>(
  consumer: ((event: E) => void) | undefined,
  internal: (event: E) => void,
): (event: E) => void {
  return (event) => {
    consumer?.(event)
    if (!event.defaultPrevented) internal(event)
  }
}

// Focus bookkeeping and blur commits must run even if the consumer cancels.
// Value/text notifications precede blur; React still batches state updates.
export function afterInputEvent<E extends SyntheticEvent>(
  internal: (event: E) => void,
  consumer: ((event: E) => void) | undefined,
): (event: E) => void {
  return (event) => {
    internal(event)
    consumer?.(event)
  }
}
