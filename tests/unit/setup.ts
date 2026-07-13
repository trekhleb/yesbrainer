/**
 * Shared unit-test environment (vitest `setupFiles`).
 *
 * - `fake-indexeddb/auto` gives Dexie a real (in-memory) IndexedDB, so
 *   storage tests run the actual transaction code, not mocks.
 * - RTL `cleanup` unmounts after every test (vitest runs without globals,
 *   so RTL's auto-cleanup hook doesn't self-register).
 * - jsdom lacks `matchMedia` and `ResizeObserver`; both are required at
 *   import/render time by the responsive hooks and Base Web. The stubs
 *   are inert (desktop layout, no resize events) — tests that care about
 *   breakpoints override `matchMedia` themselves.
 */

import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub
}

// jsdom has no working object-URL registry (it either lacks the API or
// throws "not implemented"); the download/share paths only need stable
// opaque strings and a non-throwing revoke — override unconditionally.
{
  let objectUrlSeq = 0
  URL.createObjectURL = () => `blob:vitest-${++objectUrlSeq}`
  URL.revokeObjectURL = () => {}
}

// jsdom implements neither smooth scrolling nor element scroll methods.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = (() => {}) as Element['scrollTo']
}
