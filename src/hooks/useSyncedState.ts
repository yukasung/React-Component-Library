import { useRef, useState } from 'react'

// Lets a component hold a local draft (e.g. in-progress typing) that diverges
// from a controlled `value` prop, while still resyncing whenever `value`
// changes from outside. Compares during render (React's recommended
// alternative to a resync useEffect) to avoid an extra render/flicker.
export function useSyncedState<T>(value: T): [T, (next: T) => void] {
  const [localValue, setLocalValue] = useState(value)
  const previousValue = useRef(value)

  if (previousValue.current !== value) {
    previousValue.current = value
    if (localValue !== value) {
      setLocalValue(value)
    }
  }

  return [localValue, setLocalValue]
}
