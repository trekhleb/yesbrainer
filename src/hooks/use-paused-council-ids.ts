/**
 * Ids of councils whose latest run stopped before it finished.
 *
 * The sidebar twin of `useStreamingCouncilIds`: that one reports councils
 * that are *working*, this one reports councils that stopped and are
 * waiting to be picked back up. Without it, a council interrupted while the
 * user was looking at a different one simply goes quiet — indistinguishable
 * from finished until they open it.
 *
 * Resolved from the localStorage hint index (`storage/unfinished-runs.ts`)
 * against the actual turn rows, because the hint alone can be stale: it
 * survives a run that finished in another tab, and it survives a council
 * being deleted. A hint that resolves to nothing is normal and simply
 * doesn't produce a dot.
 */

import { useEffect, useState } from 'react'
import { getUnfinishedTurns } from '@/storage/councils'
import {
  getUnfinishedRunTurnIds,
  unfinishedRunsAdapter,
} from '@/storage/unfinished-runs'

export function usePausedCouncilIds(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void (async () => {
        const unfinished = await getUnfinishedTurns(getUnfinishedRunTurnIds())
        if (cancelled) return
        const next = new Set(unfinished.map((u) => u.councilId))
        // Identity matters: the value feeds a `Set.has` in every sidebar
        // row, and a fresh Set on every storage event would re-render the
        // whole list for nothing.
        setIds((prev) =>
          prev.size === next.size && [...next].every((id) => prev.has(id))
            ? prev
            : next,
        )
      })()
    }
    refresh()
    // Both events: the custom one for this tab, the native `storage` one for
    // a run that finished (or started) in another.
    window.addEventListener('storage', refresh)
    window.addEventListener(unfinishedRunsAdapter.eventName, refresh)
    return () => {
      cancelled = true
      window.removeEventListener('storage', refresh)
      window.removeEventListener(unfinishedRunsAdapter.eventName, refresh)
    }
  }, [])

  return ids
}
