/**
 * Row-level council actions the app root wires into the sidebar — delete
 * (with its confirm dialog), rename, and share — plus the modal state
 * each one drives. Extracted from `app.tsx` so the root stays a
 * routing/layout composer; the domain rules live where they're named:
 * shareability in `utils/shareability.ts`, the delete-abort contract in
 * `utils/session/active-streams.ts`.
 */

import { useCallback, useMemo, useState } from 'react'
import { toaster } from 'baseui/toast'
import { analytics } from '@/analytics'
import type { ShareVerdictModalProps } from '@/components/share-verdict-modal'
import {
  deleteCouncil as apiDeleteCouncil,
  getCouncil,
  patchCouncilTitle,
  type CouncilSummary,
} from '@/storage/councils'
import { logRedactedError } from '@/utils/extract-error'
import { abortCouncilStreams } from '@/utils/session/active-streams'
import { clearRunUnfinished } from '@/storage/unfinished-runs'
import { latestShareableTurn } from '@/utils/shareability'

export type SharePayload = Omit<ShareVerdictModalProps, 'onClose'>

export function useCouncilActions(args: {
  councils: CouncilSummary[]
  setCouncils: React.Dispatch<React.SetStateAction<CouncilSummary[]>>
  /** The council currently open (deleting it must clear the route). */
  activeId: string | null
  navigateToCouncil: (id: string | null) => void
  refreshList: () => Promise<void>
}): {
  // Delete (two-step: request opens the confirm dialog).
  pendingDeleteId: string | null
  pendingDeleteCouncil: CouncilSummary | null
  requestDelete: (id: string) => void
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
  // Rename modal.
  pendingRenameId: string | null
  pendingRenameCouncil: CouncilSummary | null
  openRename: (id: string) => void
  closeRename: () => void
  renameCouncil: (id: string, title: string) => Promise<void>
  // Share modal ("share without opening the chat" — the in-chat triggers
  // render their own modal inside TurnView).
  sharePayload: SharePayload | null
  shareCouncil: (id: string) => Promise<void>
  closeShare: () => void
} {
  const { councils, setCouncils, activeId, navigateToCouncil, refreshList } =
    args

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null)
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)

  const pendingDeleteCouncil = useMemo(
    () => councils.find((c) => c.id === pendingDeleteId) ?? null,
    [councils, pendingDeleteId],
  )
  const pendingRenameCouncil = useMemo(
    () => councils.find((c) => c.id === pendingRenameId) ?? null,
    [councils, pendingRenameId],
  )

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id)
  }, [])
  const cancelDelete = useCallback(() => setPendingDeleteId(null), [])
  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    // Cancel anything the council still has in flight (turn fan-out,
    // retries, titler) — the results could only land on rows this delete
    // is about to drop, so letting them finish just burns the user's
    // provider tokens.
    abortCouncilStreams(id)
    // …and drop the unfinished-run hint pointing at it. Harmless if missed
    // (it would resolve to no row, so no sidebar dot), but this is already
    // the one place that cleans up council-scoped device state on delete.
    clearRunUnfinished(id)
    analytics.event('council-deleted')
    setCouncils((cs) => cs.filter((c) => c.id !== id))
    // Clear the route when the active council is the one being deleted —
    // the app's auto-select effect picks the next council (or falls
    // through to the onboarding empty state) from there.
    if (id === activeId) navigateToCouncil(null)
    try {
      await apiDeleteCouncil(id)
    } finally {
      await refreshList()
    }
  }, [pendingDeleteId, activeId, navigateToCouncil, refreshList, setCouncils])

  const openRename = useCallback((id: string) => {
    setPendingRenameId(id)
  }, [])
  const closeRename = useCallback(() => setPendingRenameId(null), [])
  // Optimistic local update + patch; on error, the refreshList rollback
  // re-fetches the canonical title (whatever the store still has).
  const renameCouncil = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim().slice(0, 60)
      if (!trimmed) return
      setCouncils((cs) =>
        cs.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
      )
      try {
        await patchCouncilTitle(id, trimmed)
      } catch (err) {
        logRedactedError('renameCouncil', err)
        await refreshList()
      }
    },
    [refreshList, setCouncils],
  )

  const shareCouncil = useCallback(async (id: string) => {
    const c = await getCouncil(id)
    if (!c) return
    // Latest turn with a shareable result — the same rule the in-chat
    // trigger applies within a turn (`utils/shareability.ts`).
    const turn = latestShareableTurn(c.turns, c.socialStructure)
    if (!turn) {
      toaster.info('Nothing to share yet — no finished result in this council.')
      return
    }
    setSharePayload({
      structure: c.socialStructure,
      question: turn.userMsg,
      ...(turn.userImages && turn.userImages.length > 0
        ? { userImages: turn.userImages }
        : {}),
      events: turn.events,
      seats: c.seats,
    })
  }, [])
  const closeShare = useCallback(() => setSharePayload(null), [])

  return {
    pendingDeleteId,
    pendingDeleteCouncil,
    requestDelete,
    cancelDelete,
    confirmDelete,
    pendingRenameId,
    pendingRenameCouncil,
    openRename,
    closeRename,
    renameCouncil,
    sharePayload,
    shareCouncil,
    closeShare,
  }
}
