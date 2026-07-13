import { useEffect, useRef } from 'react'
import { analytics } from '@/analytics'
import type { CouncilSummary } from '@/storage/councils'

/**
 * One `demo-opened` event per *entry* into a demo council — from another
 * council, from /about (null id), or a direct URL load. Matches pageview
 * semantics: leaving and coming back counts again; re-renders and
 * council-list refreshes don't re-fire (the ref tracks the last id whose
 * transition was recorded). While the summaries haven't loaded yet the
 * transition stays unrecorded, so a direct-load of a demo URL still counts
 * once the list arrives and the id can be classified.
 */
export function useTrackDemoOpened(
  activeId: string | null,
  councils: CouncilSummary[],
): void {
  const lastTrackedRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeId === lastTrackedRef.current) return
    if (activeId === null) {
      lastTrackedRef.current = null
      return
    }
    const council = councils.find((c) => c.id === activeId)
    if (!council) return
    lastTrackedRef.current = activeId
    if (council.isDemo) analytics.event('demo-opened')
  }, [activeId, councils])
}
