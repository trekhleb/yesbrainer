/**
 * The shareable `#about` route — the same `<AboutContent>` explainer the
 * first-run onboarding shows, plus the shared `<GetStartedKeys>` block, so a
 * visitor learns what Yes-Brainer is *and* how to start (BYOK + providers)
 * without needing an account or a configured key. The demo councils ride in
 * too — the get-started card is ONE component with one
 * behavior on both surfaces, "See it in action" rows included; like the
 * gate, the rows mirror the live DB, so they vanish here the moment the
 * demos are deleted.
 */

import { useEffect } from 'react'
import { AboutContent } from '@/components/about-content'
import { GetStartedKeys } from '@/components/get-started-keys'
import type { CouncilSummary } from '@/storage/councils'

export function AboutPage({
  demos = [],
}: {
  /** Seeded demo councils (sidebar order) — same prop the onboarding gate
   *  passes, so the shared card renders identically on both surfaces. */
  demos?: CouncilSummary[]
} = {}) {
  // The one shareable, search-indexable route — give it its own document
  // title so a shared tab / search result isn't a duplicate of the home
  // page's. Restores whatever title was set before on leave. Direct loads
  // get the same title prerendered into dist/about.html
  // (scripts/spa-fallback.mjs) — keep the two strings in sync.
  useEffect(() => {
    const previous = document.title
    document.title = 'About Yes-Brainer — a council of AI models'
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <AboutContent>
      <GetStartedKeys demos={demos} />
    </AboutContent>
  )
}
