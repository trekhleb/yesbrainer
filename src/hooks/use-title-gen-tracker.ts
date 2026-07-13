import { useCallback, useState } from 'react'
import type { CouncilSummary } from '@/storage/councils'

/**
 * Councils currently being LLM-titled (fire-and-forget after the
 * first turn). The sidebar reads the id set to dim the provisional
 * (truncated) title and put the row's ⋯ button into its loading state
 * (shared with in-flight runs — see `useStreamingTracker`).
 *
 * `onTitleGenFinish` is atomic in one render: it clears the busy state
 * AND swaps the sidebar title to the LLM-generated one (when present).
 * Without the optimistic title update, the busy-state removal and the
 * refreshList-driven title swap can land on consecutive renders,
 * producing a brief "old title, no longer marked provisional" flicker.
 */
export function useTitleGenTracker(
  setCouncils: React.Dispatch<React.SetStateAction<CouncilSummary[]>>,
): {
  generatingTitleIds: Set<string>
  onTitleGenStart: (councilId: string) => void
  onTitleGenFinish: (councilId: string, newTitle?: string) => void
} {
  const [generatingTitleIds, setGeneratingTitleIds] = useState<Set<string>>(
    () => new Set(),
  )
  const onTitleGenStart = useCallback((id: string) => {
    setGeneratingTitleIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])
  const onTitleGenFinish = useCallback(
    (id: string, newTitle?: string) => {
      setGeneratingTitleIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (newTitle) {
        setCouncils((cs) =>
          cs.map((c) => (c.id === id ? { ...c, title: newTitle } : c)),
        )
      }
    },
    [setCouncils],
  )
  return { generatingTitleIds, onTitleGenStart, onTitleGenFinish }
}
