import { useSyncExternalStore } from 'react'
import { MOBILE_QUERY } from '@/styles/breakpoints'

/**
 * Re-renders when the viewport crosses the mobile breakpoint.
 *
 * Used by the shell to switch between the inline-sidebar (desktop) and
 * Drawer-overlay (mobile) presentations of `<CouncilSidebar>`.
 *
 * Built on `useSyncExternalStore` — the canonical way to subscribe React to
 * an external, mutable source like `matchMedia`. It reads the current match
 * during render (no first-paint flash, no tearing between concurrent
 * renders) and re-subscribes automatically, which an effect-plus-setState
 * approach can't guarantee.
 */
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

// SSR / non-DOM builds have no viewport — default to the desktop layout.
function getServerSnapshot(): boolean {
  return false
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
