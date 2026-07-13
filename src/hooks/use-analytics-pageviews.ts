import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { analytics } from '@/analytics'

/**
 * One pageview per route change, initial load included. Must render inside
 * `<BrowserRouter>`; `pathname` is basename-relative. The façade dedupes
 * repeats (StrictMode double-effects, re-renders) and never throws, so this
 * hook has no failure mode of its own.
 */
export function useAnalyticsPageviews(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    analytics.pageview(pathname)
  }, [pathname])
}
