import { getSeatDisplayLabel } from '@/utils/seat-label'
import type { Seat, TurnEvent, VoteEntry } from '@/types/council'

/**
 * Per-target aggregation of a Trial turn's vote events. The same shape
 * powers the in-chat `<Leaderboard>` UI and the `{leaderboard}` substitution
 * in the Judge prompt (`buildJudgeContext`) — single source of truth, so
 * what the user sees and what the Judge weighs is identical.
 *
 * Targets are seats that produced a Participant answer in this turn. A
 * target with no peer ratings still gets an entry (with `entries: []`) so
 * the UI / Judge can surface the gap explicitly rather than guessing.
 */

interface VoterRating {
  /** Voter's seat id. Useful for rendering the voter's model identity. */
  voterSeatId: string
  /** Voter's model id at the time of the vote (denormalised so model
   *  swaps don't break historical leaderboards). */
  voterModelId: string
  /** Disambiguated label — `"Llama 3.1 8B #2"` for duplicate models. */
  voterDisplayLabel: string
  vote: VoteEntry
}

/**
 * Per-dimension averages keyed by dimension name. Open-ended
 * because the council operator configures the dimension set in
 * Settings → Behavior. Empty when no voter rated this target.
 */
type DimensionAverages = Record<string, number>

export type AgreementLevel = 'strong' | 'mixed' | 'divergent' | 'insufficient'

export interface LeaderboardEntry {
  targetSeatId: string
  /** Model id of the target (at the time of the answer). Useful for the
   *  UI which renders `<ModelIdentity modelId={...} />`. */
  targetModelId: string
  /** Disambiguated label — `"Llama 3.1 8B #2"` for duplicate models. */
  targetDisplayLabel: string
  /** All vote entries pointing at this target, with voter metadata
   *  preserved for the comments expand. */
  ratings: VoterRating[]
  /** Mean rating per dimension. `null` when no voter rated this target. */
  averages: DimensionAverages | null
  /** Mean stdev across the three dimensions. `null` when fewer than two
   *  voters rated this target — agreement is undefined with N≤1. */
  meanStdev: number | null
  /** Coarse classification used by the agreement dot in the UI. */
  agreement: AgreementLevel
}

/** Identity of a rated answer (the card's subject). */
interface TargetInput {
  seatId: string
  modelId: string
}
/** A voter and the votes it cast (`null` until it finishes). */
interface VoterInput {
  seatId: string
  modelId: string
  vote: VoteEntry[] | null
}

/**
 * Core aggregation: one `LeaderboardEntry` per target, with the ratings any
 * voter pointed at it. A target with no ratings yet gets `averages: null` —
 * the UI surfaces that as "awaiting votes" mid-flight, or "no peer ratings"
 * once settled. Shared by the persisted (`aggregateVotesByTarget`) and
 * in-flight (`aggregateInflightVotes`) paths so both render identical cards.
 */
function buildLeaderboard(
  targets: TargetInput[],
  voters: VoterInput[],
  seats: Seat[],
): LeaderboardEntry[] {
  const seatById = new Map(seats.map((s) => [s.id, s]))
  return targets.map((target) => {
    const targetSeat = seatById.get(target.seatId)
    const ratings: VoterRating[] = []
    for (const voter of voters) {
      if (!voter.vote) continue
      const match = voter.vote.find((v) => v.targetSeatId === target.seatId)
      if (!match) continue
      const voterSeat = seatById.get(voter.seatId)
      ratings.push({
        voterSeatId: voter.seatId,
        voterModelId: voter.modelId,
        voterDisplayLabel: voterSeat
          ? getSeatDisplayLabel(voterSeat, seats)
          : voter.modelId,
        vote: match,
      })
    }
    const averages = ratings.length > 0 ? averageDimensions(ratings) : null
    const meanStdev =
      ratings.length >= 2 ? meanStdevAcrossDimensions(ratings) : null
    return {
      targetSeatId: target.seatId,
      targetModelId: targetSeat?.modelId ?? target.modelId,
      targetDisplayLabel: targetSeat
        ? getSeatDisplayLabel(targetSeat, seats)
        : target.modelId,
      ratings,
      averages,
      meanStdev,
      agreement: classifyAgreement(meanStdev, ratings.length),
    }
  })
}

/**
 * Build per-target entries from a turn's persisted events. Targets are the
 * seats that produced an answer; returns them in answer order (the natural
 * reading order for the UI).
 */
export function aggregateVotesByTarget(
  events: TurnEvent[],
  seats: Seat[],
): LeaderboardEntry[] {
  const targets = events.flatMap((e) =>
    e.roleType === 'participant' && !e.error && e.output.length > 0 && e.seatId
      ? [{ seatId: e.seatId, modelId: e.modelId }]
      : [],
  )
  const voters = events.flatMap((e) =>
    e.roleType === 'vote' && e.vote && e.vote.length > 0 && e.seatId
      ? [{ seatId: e.seatId, modelId: e.modelId, vote: e.vote }]
      : [],
  )
  return buildLeaderboard(targets, voters, seats)
}

/**
 * Build per-target entries *mid-vote*, from the in-flight voter set, so the
 * cards are visible (and fill in) while voting is still running rather than
 * popping in only once it settles. In a Trial every participant both answers
 * and is rated, so the voters *are* the targets; ordered by seat order so the
 * cards don't reshuffle when the turn persists.
 */
export function aggregateInflightVotes(
  voters: VoterInput[],
  seats: Seat[],
): LeaderboardEntry[] {
  const order = new Map(seats.map((s, i) => [s.id, i]))
  const targets: TargetInput[] = voters
    .map((v) => ({ seatId: v.seatId, modelId: v.modelId }))
    .sort((a, b) => (order.get(a.seatId) ?? 0) - (order.get(b.seatId) ?? 0))
  return buildLeaderboard(targets, voters, seats)
}

/**
 * Mean of a target's per-dimension averages — the single number that picks
 * the voting "winner" AND renders as the score chip in each vote card's
 * header. One definition on purpose: the number the user sees is exactly
 * the number that awarded the ★ (an equal-weight mean across the
 * configured dimensions — displayed rather than implied, so the winner
 * marker isn't a black box). `null` when the target got no peer ratings.
 */
export function overallScore(entry: LeaderboardEntry): number | null {
  if (!entry.averages) return null
  const values = Object.values(entry.averages)
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Seat id of the highest-scoring target — the answer the peers rated best,
 * marked with a star in the voting pager + card. `null` when no target has
 * any peer ratings; on a tie at the top the first (answer-order) wins.
 */
export function winningTargetSeatId(
  entries: LeaderboardEntry[],
): string | null {
  let best: { id: string; score: number } | null = null
  for (const entry of entries) {
    const score = overallScore(entry)
    if (score === null) continue
    if (!best || score > best.score) best = { id: entry.targetSeatId, score }
  }
  return best?.id ?? null
}

function averageDimensions(ratings: VoterRating[]): DimensionAverages {
  // Build the dimension set from the *union* of all voters' rated keys.
  // A voter whose schema-driven response missed a dimension still
  // contributes to the others — better than failing the whole aggregate
  // because one model produced a partial object.
  const names = collectDimensionNames(ratings)
  const out: DimensionAverages = {}
  for (const dim of names) {
    let sum = 0
    let n = 0
    for (const r of ratings) {
      const v = r.vote.ratings[dim]
      if (typeof v === 'number') {
        sum += v
        n += 1
      }
    }
    if (n > 0) out[dim] = sum / n
  }
  return out
}

function meanStdevAcrossDimensions(ratings: VoterRating[]): number {
  // Same math as before; just iterates the dynamic dimension set instead
  // of the hardcoded triple. Dimensions with <2 raters contribute 0 to
  // the stdev (matches the previous behaviour for any single dimension
  // where one voter happened to leave the field blank).
  const names = collectDimensionNames(ratings)
  if (names.length === 0) return 0
  let total = 0
  for (const dim of names) {
    const values: number[] = []
    for (const r of ratings) {
      const v = r.vote.ratings[dim]
      if (typeof v === 'number') values.push(v)
    }
    total += populationStdev(values)
  }
  return total / names.length
}

function collectDimensionNames(ratings: VoterRating[]): string[] {
  const set = new Set<string>()
  for (const r of ratings) {
    for (const k of Object.keys(r.vote.ratings)) set.add(k)
  }
  return Array.from(set)
}

function populationStdev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Map mean stdev to a coarse agreement label. Thresholds are calibrated
 * for a 1–5 scale: under half a point of mean stdev → strong agreement,
 * up to a full point → mixed, beyond that → divergent. Tweak when we
 * have enough real turns to validate; the math is purely a UI signal,
 * not load-bearing for orchestration.
 */
function classifyAgreement(
  meanStdev: number | null,
  voterCount: number,
): AgreementLevel {
  if (meanStdev === null || voterCount < 2) return 'insufficient'
  if (meanStdev < 0.5) return 'strong'
  if (meanStdev < 1.0) return 'mixed'
  return 'divergent'
}
