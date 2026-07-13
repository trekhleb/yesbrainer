/**
 * App routing on top of react-router (real paths, not a hash).
 *
 * Council state lives at `/council/:id`; the shareable explainer at
 * `/about`; home at `/`. A thin wrapper over react-router so callers keep
 * a small, intention-revealing API (`councilId`, `aboutOpen`, `navigate`)
 * instead of sprinkling `useMatch` / `useNavigate` everywhere.
 *
 * Paths are written without the base; react-router prepends the router
 * `basename` (the Vite `base`, `/` on yesbrainer.ai). Real paths (not a
 * `#hash`) need the `dist/404.html` SPA fallback to survive a direct load
 * / refresh — see `scripts/spa-fallback.mjs` and DEVELOPMENT.md.
 */

import { useCallback } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'

export const ABOUT_PATH = '/about'

/** Canonical path for a council id (the router applies the basename). */
export function councilPath(id: string): string {
  return `/council/${encodeURIComponent(id)}`
}

export function useAppRoute(): {
  councilId: string | null
  aboutOpen: boolean
  /** True on `/settings` or `/settings/:tab`. */
  settingsOpen: boolean
  /** The settings tab slug from `/settings/:tab`, or null on bare `/settings`. */
  settingsTab: string | null
  navigate: (id: string | null) => void
} {
  const navigate = useNavigate()
  // `useMatch` resolves against the path *after* the basename, and
  // react-router has already URL-decoded the captured param.
  const councilMatch = useMatch('/council/:councilId')
  const aboutMatch = useMatch(ABOUT_PATH)
  const settingsRootMatch = useMatch('/settings')
  const settingsTabMatch = useMatch('/settings/:tab')

  const navigateToCouncil = useCallback(
    // react-router v7's navigate returns a promise; callers treat this as
    // fire-and-forget navigation, hence the void.
    (id: string | null) => void navigate(id ? councilPath(id) : '/'),
    [navigate],
  )

  return {
    councilId: councilMatch?.params.councilId ?? null,
    aboutOpen: aboutMatch !== null,
    settingsOpen: settingsRootMatch !== null || settingsTabMatch !== null,
    settingsTab: settingsTabMatch?.params.tab ?? null,
    navigate: navigateToCouncil,
  }
}
