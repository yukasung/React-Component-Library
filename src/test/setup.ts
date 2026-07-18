import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// RTL's automatic cleanup only self-registers when it detects a global
// `afterEach` (Vitest `globals: true`); since we use explicit imports
// instead, unmount manually so each test starts from an empty DOM.
afterEach(cleanup)
