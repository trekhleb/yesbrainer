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
/** The standalone "no account, no server, your keys" explainer. */
export const PRIVATE_PATH = '/private'
/** Prefix for the head-to-head comparison pages (`/vs/:slug`). */
export const COMPARISON_PATH_PREFIX = '/vs'
/** Prefix for the public demo-council permalinks (`/demo/:slug`). */
export const DEMO_PATH_PREFIX = '/demo'

/** Canonical public path for a demo council slug. */
export function demoPath(slug: string): string {
  return `${DEMO_PATH_PREFIX}/${slug}`
}

/** Canonical path for a comparison page slug. */
export function comparisonPath(slug: string): string {
  return `${COMPARISON_PATH_PREFIX}/${slug}`
}

/** Canonical path for a council id (the router applies the basename). */
export function councilPath(id: string): string {
  return `/council/${encodeURIComponent(id)}`
}

export function useAppRoute(): {
  councilId: string | null
  aboutOpen: boolean
  /** True on `/private`. */
  privateOpen: boolean
  /** The slug from `/vs/:slug`, or null when not on a comparison page. */
  comparisonSlug: string | null
  /** True on the bare `/vs` comparison hub. */
  comparisonIndexOpen: boolean
  /** The slug from `/demo/:slug`, or null when not on a demo permalink. */
  demoSlug: string | null
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
  const privateMatch = useMatch(PRIVATE_PATH)
  const comparisonMatch = useMatch(`${COMPARISON_PATH_PREFIX}/:slug`)
  const comparisonIndexMatch = useMatch(COMPARISON_PATH_PREFIX)
  const demoMatch = useMatch(`${DEMO_PATH_PREFIX}/:slug`)
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
    privateOpen: privateMatch !== null,
    comparisonSlug: comparisonMatch?.params.slug ?? null,
    comparisonIndexOpen: comparisonIndexMatch !== null,
    demoSlug: demoMatch?.params.slug ?? null,
    settingsOpen: settingsRootMatch !== null || settingsTabMatch !== null,
    settingsTab: settingsTabMatch?.params.tab ?? null,
    navigate: navigateToCouncil,
  }
}
