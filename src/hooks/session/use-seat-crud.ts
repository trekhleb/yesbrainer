/**
 * Per-seat config update for `useCouncilSession`.
 *
 * Roster mutations (add / remove / model swap) are storage-driven from the
 * council-settings modal (`addSeat` / `removeSeat` / `updateSeat`), and the
 * live session re-syncs via `configRefreshKey` — so the only seat mutation
 * this hook owns is editing a seat's config from *inside* the session UI
 * (system prompt / temperature / tools). It validates against the local
 * council snapshot, hits Dexie via `@/storage/councils`, then mirrors the
 * change into local state. It doesn't touch the per-phase state machines
 * (streamingTurn / votingTurn / mediatingTurn / etc.) — config edits are
 * orthogonal to in-flight deliberation and allowed any time.
 *
 * Extracted from `use-council-session.ts` so the orchestrator file
 * stays focused on phase orchestration.
 */

import { useCallback } from 'react'
import { updateSeat } from '@/storage/councils'
import type { Council, SeatConfig } from '@/types/council'

export function useSeatCRUD({
  council,
  setCouncil,
}: {
  council: Council | null
  setCouncil: React.Dispatch<React.SetStateAction<Council | null>>
}): {
  updateSeatConfig: (
    seatId: string,
    partial: Partial<SeatConfig>,
  ) => Promise<void>
} {
  const updateSeatConfig = useCallback(
    async (seatId: string, partial: Partial<SeatConfig>) => {
      if (!council) return
      const seat = council.seats.find((s) => s.id === seatId)
      if (!seat) return
      const nextConfig: SeatConfig = { ...seat.config, ...partial }
      await updateSeat(council.id, seatId, { config: nextConfig })
      setCouncil((c) =>
        c
          ? {
              ...c,
              seats: c.seats.map((s) =>
                s.id === seatId ? { ...s, config: nextConfig } : s,
              ),
            }
          : c,
      )
    },
    [council, setCouncil],
  )

  return { updateSeatConfig }
}
