import { getModel } from '@/models/registry'
import type { Seat } from '@/types/council'

/**
 * Disambiguated display name for a seat. When the council has more than
 * one seat using the same `modelId`, the label gets a `#N` suffix (in
 * seat order) so the user — and the Judge prompt — can tell them apart.
 * Singleton models keep their plain registry label.
 *
 * Used everywhere a seat is rendered (roster chips, voting columns,
 * leaderboard rows, target cards) and inside `buildJudgeContext` so the
 * Judge sees the same disambiguated names the user sees.
 *
 * Falls back to `seat.modelId` if the model isn't in the registry (a
 * historical seat using a since-removed model entry). That's better than
 * crashing the row.
 */
export function getSeatDisplayLabel(seat: Seat, allSeats: Seat[]): string {
  const baseLabel = safeRegistryLabel(seat.modelId)
  const sameModel = allSeats.filter((s) => s.modelId === seat.modelId)
  if (sameModel.length <= 1) return baseLabel
  const idx = sameModel.findIndex((s) => s.id === seat.id)
  // findIndex returns -1 for seats not in the array — shouldn't happen in
  // practice (caller passes the full council seats list) but stay defensive.
  if (idx < 0) return baseLabel
  return `${baseLabel} #${idx + 1}`
}

/**
 * Variant for code paths that have a seat id but not the seat object —
 * e.g. inside `aggregateVotesByTarget` looping over events. Looks up the
 * seat in the provided list; falls through to the modelId argument if
 * not found.
 */
export function getSeatDisplayLabelById(
  seatId: string | undefined,
  allSeats: Seat[],
  fallbackModelId: string,
): string {
  if (!seatId) return safeRegistryLabel(fallbackModelId)
  const seat = allSeats.find((s) => s.id === seatId)
  if (!seat) return safeRegistryLabel(fallbackModelId)
  return getSeatDisplayLabel(seat, allSeats)
}

function safeRegistryLabel(modelId: string): string {
  try {
    return getModel(modelId).label
  } catch {
    return modelId
  }
}
