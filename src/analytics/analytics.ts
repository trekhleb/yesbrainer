/**
 * First-party analytics core — provider-agnostic on purpose (the Umami
 * adapter is one implementation, see `umami.ts`; the composition root that
 * picks a provider from build-time env is `index.ts`).
 *
 * Two invariants carry the whole design:
 *
 *  - **Closed payload.** `PageviewEvent` has no index signature and its
 *    `path` is the `TrackedPath` union — six fixed strings. Raw URLs,
 *    council ids, query params, and titles cannot be sent *by construction*;
 *    widening what analytics may see means widening these types in review.
 *  - **Failure is invisible.** Nothing awaits analytics, nothing retries,
 *    and no error may escape into the render path — a down collector, an
 *    adblocker, or a CSP block must change nothing about the app.
 */

import type { ProviderId } from '@/models/registry'
import type { SocialStructure } from '@/types/council'

/** The only values that may ever leave as a tracked page. Settings tabs are
 * app-defined slugs (not user data), so the known ones pass as literals —
 * but only via the exact-match list in `routePattern`, never the raw URL
 * segment: an unknown `/settings/<anything>` still collapses to the pattern.
 * Mirrors `TABS` in settings-page.tsx; a renamed tab degrades to
 * `/settings/:tab` in the dashboard rather than breaking anything. */
export type TrackedPath =
  | '/'
  | '/about'
  | '/settings'
  | '/settings/keys'
  | '/settings/storage'
  | '/settings/appearance'
  | '/settings/councils'
  | '/settings/:tab'
  | '/council/:id'
  | '/other'

/**
 * The only values that may ever leave as a feature-usage event — counts of
 * app-level actions, never content or identity. The structure suffix is a
 * config enum (which social structure), carried in the name so the Umami
 * Events panel shows the per-structure split without an open-ended `data`
 * payload (deliberately unsupported here — it's the door PII would walk
 * through). README/SECURITY.md point at this union as the full disclosure.
 */
export type AppEventName =
  | `council-created:${SocialStructure}`
  | 'council-deleted'
  | `verdict-shared:${SocialStructure}`
  | 'demo-opened'
  | `key-added:${ProviderId}`
  | 'ollama-enabled'
  | 'pwa-installed'
  | 'data-exported'
  | 'data-imported'
  | 'wipe-everything'
  | 'wipe-keys'
  | 'wipe-councils'
  | 'storage-persist-granted'
  | 'storage-persist-denied'

type PageContext = {
  /** Route *pattern*, never the raw pathname. */
  path: TrackedPath
  /** Serving host — lets the dashboard split prod / localhost / rehosts. */
  hostname: string
  language: string
  /** Device class signal, `1920x1080` form. */
  screen: string
}

export type PageviewEvent = PageContext & {
  /** External arrival source; only present on the first pageview. */
  referrer?: string
}

export type ActionEvent = PageContext & {
  name: AppEventName
}

export interface AnalyticsProvider {
  /** Must never throw and must not return work a caller could await. */
  trackPageview(event: PageviewEvent): void
  /** Same contract as trackPageview. */
  trackEvent(event: ActionEvent): void
}

/** Fork/test default: analytics off is a first-class configuration. */
export const nullProvider: AnalyticsProvider = {
  trackPageview: () => {},
  trackEvent: () => {},
}

/** Dev default: show the event instead of sending it anywhere. */
export const consoleProvider: AnalyticsProvider = {
  // console.debug, not console.log: hidden behind the devtools "Verbose"
  // level, and this provider is only ever wired in dev builds.
  trackPageview: (event) => {
    console.debug('[analytics] pageview', event)
  },
  trackEvent: (event) => {
    console.debug('[analytics] event', event)
  },
}

/** Collapse a pathname to its tracked pattern (query/hash never get here —
 * react-router's `pathname` excludes them). Unknown shapes collapse to
 * `/other` rather than passing through: a mistyped or crafted URL is not
 * ours to report. */
export function routePattern(pathname: string): TrackedPath {
  if (pathname === '/') return '/'
  if (pathname === '/about') return '/about'
  if (pathname === '/settings') return '/settings'
  if (pathname === '/settings/keys') return '/settings/keys'
  if (pathname === '/settings/storage') return '/settings/storage'
  if (pathname === '/settings/appearance') return '/settings/appearance'
  if (pathname === '/settings/councils') return '/settings/councils'
  if (/^\/settings\/[^/]+$/.test(pathname)) return '/settings/:tab'
  if (/^\/council\/[^/]+$/.test(pathname)) return '/council/:id'
  return '/other'
}

/**
 * Owner/self-visit opt-out, mirroring the official tracker's
 * `umami.disabled` switch: set this key to `1` in devtools and this browser
 * stops reporting entirely — no reload needed (checked per call). Lives
 * under the `yesbrainer:*` prefix by convention, which means the factory
 * reset wipes it too: re-set it after a wipe-everything.
 */
export const ANALYTICS_DISABLED_KEY = 'yesbrainer:analytics-disabled'

function isDisabled(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_DISABLED_KEY) === '1'
  } catch {
    return false // storage blocked (strict private mode) → default posture
  }
}

/** The arrival source, or nothing: internal hops and same-host referrers
 * say nothing about "where do visitors come from". */
function externalReferrer(): string | undefined {
  try {
    if (!document.referrer) return undefined
    const ref = new URL(document.referrer)
    return ref.host === window.location.host ? undefined : ref.href
  } catch {
    return undefined
  }
}

export class Analytics {
  private lastPathname: string | null = null
  private readonly provider: AnalyticsProvider

  constructor(provider: AnalyticsProvider) {
    this.provider = provider
  }

  /**
   * Report a route as viewed. Idempotent per pathname — StrictMode re-runs
   * effects and re-renders repeat, but a pageview is "the URL changed".
   * Navigating between two councils still counts (pathnames differ) even
   * though both report the `/council/:id` pattern.
   */
  pageview(pathname: string): void {
    try {
      if (isDisabled()) return
      if (pathname === this.lastPathname) return
      const first = this.lastPathname === null
      this.lastPathname = pathname
      const referrer = first ? externalReferrer() : undefined
      this.provider.trackPageview({
        ...this.context(),
        ...(referrer !== undefined ? { referrer } : {}),
      })
    } catch {
      // Swallowed by design: there is no user-visible failure mode for
      // analytics, and the render path must never inherit one.
    }
  }

  /**
   * Count a feature-usage action (see `AppEventName` for the closed list).
   * Every occurrence counts — no dedupe; the current route pattern rides
   * along so the dashboard can slice events by page.
   */
  event(name: AppEventName): void {
    try {
      if (isDisabled()) return
      this.provider.trackEvent({ name, ...this.context() })
    } catch {
      // Same swallow-everything contract as pageview().
    }
  }

  private context(): PageContext {
    return {
      path: routePattern(this.lastPathname ?? window.location.pathname),
      hostname: window.location.hostname,
      language: navigator.language,
      screen: `${window.screen.width}x${window.screen.height}`,
    }
  }
}
