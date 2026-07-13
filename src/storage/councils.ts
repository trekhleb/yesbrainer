/**
 * Council storage API — Dexie / IndexedDB on the user's device.
 *
 * Same logical shape as the old server-side SQLite store
 * (`councils` ──< `seats` and `councils` ──< `turns` with embedded
 * `events` JSON), now persisted client-side. Same function names and
 * return shapes as the old `fetch('/api/councils/...')` wrappers
 * — only the storage substrate changes.
 *
 * Semantics preserved from the server era: idempotent create (re-posting
 * the same id returns the existing council), atomic token-total
 * re-aggregation inside a Dexie transaction whenever turn events
 * mutate, refusal to delete the last seat, and Trial/Consensus guards
 * on the Judge / Mediator setters.
 */

import { db } from '@/storage/db'
import type { CouncilRow, SeatRow, TurnRow } from '@/storage/db'
import {
  addTokens,
  EMPTY_TOKENS,
  subtractTokens,
  summarizeEvents,
} from '@/utils/token-totals'
import {
  normalizeSeatConfig,
  normalizeSocialStructure,
  normalizeSynthesiser,
} from '@/types/council'
import type {
  Council,
  CouncilDeliberation,
  Judge,
  Mediator,
  Seat,
  SeatConfig,
  SocialStructure,
  TokenTotals,
  Turn,
  TurnEvent,
} from '@/types/council'

export interface CouncilSummary {
  id: string
  title: string | null
  createdAt: number
  socialStructure: SocialStructure
  /** modelId per seat, in registration order; used by the sidebar to
   *  render participant logos without fetching the full council. */
  modelIds: string[]
  tokenTotal: TokenTotals
  /** Seeded demo council — drives the sidebar Demo tag and the gate /
   *  auto-select exclusions (see `Council.isDemo`). */
  isDemo?: boolean
}

export interface CreateCouncilInput {
  id: string
  socialStructure: SocialStructure
  seats: Seat[]
  /** Required when `socialStructure === 'trial'`. */
  judge?: Judge
  /** Required when `socialStructure === 'consensus'`. */
  mediator?: Mediator
  /** Optional per-council deliberation overrides chosen at creation
   *  (New-council modal). Sanitized before persisting so an all-empty
   *  bag never lands. */
  deliberation?: CouncilDeliberation
  /** Marks a seeded demo council (set only by the demo seeder / import
   *  of an exported demo — never by the New-council modal). */
  isDemo?: boolean
}

export interface UpdateSeatInput {
  modelId?: string
  config?: SeatConfig
}

/** Roster order: `pos` ascending; rows predating the field sort first in
 *  their existing (uuid) order — JS sort is stable. */
function byPos(a: { pos?: number }, b: { pos?: number }): number {
  return (a.pos ?? -1) - (b.pos ?? -1)
}

/** Seat rows → the roster, in `pos` order. Shared by `getCouncil` and the
 *  export path (`storage/transfer.ts`) so the two can't drift on which
 *  fields round-trip — and so an export's seat order *is* the roster order
 *  (import recreates `pos` from array order). */
export function seatRowsToRoster(seatRows: SeatRow[]): Seat[] {
  return [...seatRows].sort(byPos).map((s) => ({
    id: s.id,
    modelId: s.modelId,
    // Read-boundary normalization: stale enum values in persisted config
    // degrade to unset instead of reaching keyed lookups (see
    // `normalizeSeatConfig`).
    config: normalizeSeatConfig(s.config),
  }))
}

/** Turn row → domain turn. Shared with the export path (same drift
 *  argument as `seatRowsToRoster`); ordering is the caller's job. */
export function turnRowToTurn(t: TurnRow): Turn {
  return {
    id: t.id,
    idx: t.idx,
    userMsg: t.userMsg,
    events: t.events,
    tokenTotal: t.tokenTotal,
    ...(t.votingLabels ? { votingLabels: t.votingLabels } : {}),
    ...(t.userImages ? { userImages: t.userImages } : {}),
  }
}

export async function listCouncils(): Promise<CouncilSummary[]> {
  // Recency sort lives on the index — Dexie reverses the natural
  // ascending order in O(N) without re-reading the data.
  const rows = await db.councils.orderBy('createdAt').reverse().toArray()
  if (rows.length === 0) return []

  // One additional read pulls every seat for the listed councils.
  // Group in-memory rather than per-council to avoid N+1 IDB reads.
  const ids = rows.map((r) => r.id)
  const seatRows = (
    await db.seats.where('councilId').anyOf(ids).toArray()
  ).sort(byPos)
  const modelIdsByCouncil = new Map<string, string[]>()
  for (const s of seatRows) {
    let arr = modelIdsByCouncil.get(s.councilId)
    if (!arr) {
      arr = []
      modelIdsByCouncil.set(s.councilId, arr)
    }
    arr.push(s.modelId)
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    socialStructure: normalizeSocialStructure(r.socialStructure),
    modelIds: modelIdsByCouncil.get(r.id) ?? [],
    tokenTotal: r.tokenTotal,
    ...(r.isDemo ? { isDemo: true } : {}),
  }))
}

/** One council's raw rows (council + seats + turns; turns idx-ascending
 *  via the compound index), or null when the id is unknown. The shared
 *  fetch under `getCouncil` and the per-council export. */
export async function fetchCouncilRows(id: string): Promise<{
  row: CouncilRow
  seatRows: SeatRow[]
  turnRows: TurnRow[]
} | null> {
  const row = await db.councils.get(id)
  if (!row) return null
  const seatRows = await db.seats.where('councilId').equals(id).toArray()
  const turnRows = await db.turns
    .where('[councilId+idx]')
    .between([id, 0], [id, Infinity])
    .toArray()
  return { row, seatRows, turnRows }
}

export async function getCouncil(id: string): Promise<Council | null> {
  const rows = await fetchCouncilRows(id)
  if (!rows) return null
  const { row, seatRows, turnRows } = rows

  const council: Council = {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    socialStructure: normalizeSocialStructure(row.socialStructure),
    seats: seatRowsToRoster(seatRows),
    turns: turnRows.map(turnRowToTurn),
    tokenTotal: row.tokenTotal,
    ...(row.judge ? { judge: normalizeSynthesiser(row.judge) } : {}),
    ...(row.mediator ? { mediator: normalizeSynthesiser(row.mediator) } : {}),
    ...(row.deliberation ? { deliberation: row.deliberation } : {}),
    ...(row.isDemo ? { isDemo: true } : {}),
  }
  return council
}

export async function createCouncil(
  input: CreateCouncilInput,
): Promise<Council> {
  // Trial → Judge, Consensus → Mediator; Roundtable / Custom strip
  // both even if the caller included them, so the row stays clean.
  if (input.socialStructure === 'trial' && !input.judge) {
    throw new Error('createCouncil: judge_required_for_trial')
  }
  if (input.socialStructure === 'consensus' && !input.mediator) {
    throw new Error('createCouncil: mediator_required_for_consensus')
  }
  const judgeOnCreate =
    input.socialStructure === 'trial' ? input.judge : undefined
  const mediatorOnCreate =
    input.socialStructure === 'consensus' ? input.mediator : undefined
  const deliberationOnCreate = sanitizeDeliberation(input.deliberation)

  // Idempotent: re-creating with the same id (typically React strict
  // mode double-firing the bootstrap effect) returns the existing
  // council instead of throwing.
  const existing = await db.councils.get(input.id)
  if (existing) {
    const current = await getCouncil(input.id)
    if (!current) throw new Error('createCouncil: ghost row')
    return current
  }

  const createdAt = Date.now()
  await db.transaction('rw', db.councils, db.seats, async () => {
    await db.councils.put({
      id: input.id,
      title: null,
      createdAt,
      socialStructure: input.socialStructure,
      tokenTotal: EMPTY_TOKENS,
      ...(judgeOnCreate ? { judge: judgeOnCreate } : {}),
      ...(mediatorOnCreate ? { mediator: mediatorOnCreate } : {}),
      ...(deliberationOnCreate ? { deliberation: deliberationOnCreate } : {}),
      ...(input.isDemo ? { isDemo: true } : {}),
    })
    for (const [pos, seat] of input.seats.entries()) {
      await db.seats.put({
        id: seat.id,
        councilId: input.id,
        modelId: seat.modelId,
        config: seat.config,
        pos,
      })
    }
  })

  const council: Council = {
    id: input.id,
    title: null,
    createdAt,
    socialStructure: input.socialStructure,
    seats: input.seats,
    turns: [],
    tokenTotal: EMPTY_TOKENS,
    ...(judgeOnCreate ? { judge: judgeOnCreate } : {}),
    ...(mediatorOnCreate ? { mediator: mediatorOnCreate } : {}),
    ...(deliberationOnCreate ? { deliberation: deliberationOnCreate } : {}),
    ...(input.isDemo ? { isDemo: true } : {}),
  }
  return council
}

/**
 * Persist a turn — insert on first call, **upsert on re-persist of the same
 * turn id**. The orchestrator checkpoints a turn mid-run (after
 * the answer fan-out, before the long synthesis phases) so a tab discard /
 * reload / crash keeps the already-finished answers; the final call then
 * replaces the row's events with the complete set. Only the *same id* takes
 * the update path — a different turn id at the same idx still conflicts,
 * which is the guard that catches double-sends (React StrictMode races).
 */
export async function appendTurn(
  councilId: string,
  turn: Turn,
): Promise<void> {
  await db.transaction('rw', db.councils, db.turns, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('appendTurn: council_not_found')

    const existing = await db.turns.get(turn.id)
    if (existing) {
      // uuid collision across councils is effectively impossible — but a
      // silent overwrite of another council's turn would be data loss, so
      // fail loudly instead.
      if (existing.councilId !== councilId) {
        throw new Error('appendTurn: turn_id_taken')
      }
      // Checkpoint upsert: swap in the fuller event set and re-aggregate
      // both token totals (shared helper with `replaceEvent`). Fields that
      // arrive after the first checkpoint (the voting labels) land here.
      await applyTurnEventsUpdate(
        councilId,
        turn.id,
        owner.tokenTotal,
        existing.tokenTotal,
        turn.events,
      )
      if (turn.votingLabels) {
        await db.turns.update(turn.id, { votingLabels: turn.votingLabels })
      }
      return
    }

    // Server-side guard: refused duplicate idx for the same council.
    // Same check here so a concurrent retry can't double-insert.
    const idxTaken = await db.turns
      .where('[councilId+idx]')
      .equals([councilId, turn.idx])
      .first()
    if (idxTaken) throw new Error('appendTurn: conflict_idx')

    // Auto-title from the first user message — kept as the fallback
    // when the LLM titler chain has no reachable model. The LLM
    // titler still runs fire-and-forget from the orchestrator and
    // PATCHes a better title moments later.
    const nextTitle =
      !owner.title && turn.idx === 0
        ? truncateForTitle(turn.userMsg)
        : null

    const tokenTotal = summarizeEvents(turn.events)
    const nextCouncilTotal = addTokens(owner.tokenTotal, tokenTotal)

    await db.turns.put({
      id: turn.id,
      councilId,
      idx: turn.idx,
      userMsg: turn.userMsg,
      events: turn.events,
      tokenTotal,
      ...(turn.votingLabels ? { votingLabels: turn.votingLabels } : {}),
      ...(turn.userImages ? { userImages: turn.userImages } : {}),
    })
    await db.councils.update(councilId, {
      tokenTotal: nextCouncilTotal,
      ...(nextTitle ? { title: nextTitle } : {}),
    })
  })
}

function truncateForTitle(s: string, max = 60): string {
  const trimmed = s.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1) + '…'
}

/**
 * Recompute the turn's `tokenTotal`, apply the delta to
 * `councils.tokenTotal`, and write both — atomically inside whatever
 * transaction the caller opened. Pulls the three-step pattern out of
 * `replaceEvent` so the "tokens are always re-aggregated alongside the
 * events update" invariant lives in one place.
 */
async function applyTurnEventsUpdate(
  councilId: string,
  turnId: string,
  prevCouncilTotal: TokenTotals,
  prevTurnTotal: TokenTotals,
  nextEvents: TurnEvent[],
): Promise<void> {
  const nextTotal = summarizeEvents(nextEvents)
  const nextCouncilTotal = addTokens(
    subtractTokens(prevCouncilTotal, prevTurnTotal),
    nextTotal,
  )
  await db.turns.update(turnId, {
    events: nextEvents,
    tokenTotal: nextTotal,
  })
  await db.councils.update(councilId, { tokenTotal: nextCouncilTotal })
}

export async function replaceEvent(
  councilId: string,
  turnId: string,
  event: TurnEvent,
): Promise<void> {
  await db.transaction('rw', db.councils, db.turns, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('replaceEvent: council_not_found')
    const row = await db.turns.get(turnId)
    if (!row || row.councilId !== councilId) {
      throw new Error('replaceEvent: turn_not_found')
    }
    const idx = row.events.findIndex((e) => e.id === event.id)
    if (idx < 0) throw new Error('replaceEvent: event_not_found')
    const nextEvents = row.events.map((e, i) => (i === idx ? event : e))
    await applyTurnEventsUpdate(
      councilId,
      turnId,
      owner.tokenTotal,
      row.tokenTotal,
      nextEvents,
    )
  })
}

export async function updateSeat(
  councilId: string,
  seatId: string,
  input: UpdateSeatInput,
): Promise<void> {
  if (input.modelId === undefined && input.config === undefined) {
    throw new Error('updateSeat: at_least_one_field_required')
  }
  await db.transaction('rw', db.councils, db.seats, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('updateSeat: council_not_found')
    const existing = await db.seats.get(seatId)
    if (!existing || existing.councilId !== councilId) {
      throw new Error('updateSeat: seat_not_found')
    }
    const updates: Partial<Pick<typeof existing, 'modelId' | 'config'>> = {}
    if (input.modelId !== undefined) updates.modelId = input.modelId
    if (input.config !== undefined) updates.config = input.config
    await db.seats.update(seatId, updates)
  })
}

/**
 * Seat an additional Participant on an existing council (council-settings
 * modal roster editing). Only *future* turns fan out to it — past turns'
 * events are self-contained (each snapshots its own `modelId`).
 */
export async function addSeat(councilId: string, seat: Seat): Promise<void> {
  await db.transaction('rw', db.councils, db.seats, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('addSeat: council_not_found')
    const existing = await db.seats.get(seat.id)
    if (existing) throw new Error('addSeat: seat_id_taken')
    const siblings = await db.seats.where('councilId').equals(councilId).toArray()
    const nextPos = siblings.reduce((m, s) => Math.max(m, s.pos ?? -1), -1) + 1
    await db.seats.put({
      id: seat.id,
      councilId,
      modelId: seat.modelId,
      config: seat.config,
      pos: nextPos,
    })
  })
}

/**
 * Unseat a Participant. Refuses to remove the last seat (a council with no
 * Participants can't run a turn). Past turns keep rendering — their events
 * snapshot `modelId` and never resolve through the live roster.
 */
export async function removeSeat(
  councilId: string,
  seatId: string,
): Promise<void> {
  await db.transaction('rw', db.councils, db.seats, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('removeSeat: council_not_found')
    const existing = await db.seats.get(seatId)
    if (!existing || existing.councilId !== councilId) {
      throw new Error('removeSeat: seat_not_found')
    }
    const count = await db.seats.where('councilId').equals(councilId).count()
    if (count <= 1) throw new Error('removeSeat: last_seat')
    await db.seats.delete(seatId)
  })
}

export async function setJudge(
  councilId: string,
  judge: Judge,
): Promise<void> {
  await db.transaction('rw', db.councils, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('setJudge: council_not_found')
    if (owner.socialStructure !== 'trial') {
      throw new Error('setJudge: judge_requires_trial')
    }
    await db.councils.update(councilId, { judge })
  })
}

export async function setMediator(
  councilId: string,
  mediator: Mediator,
): Promise<void> {
  await db.transaction('rw', db.councils, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('setMediator: council_not_found')
    if (owner.socialStructure !== 'consensus') {
      throw new Error('setMediator: mediator_requires_consensus')
    }
    await db.councils.update(councilId, { mediator })
  })
}

/**
 * Drop empty/whitespace strings and empty dimension arrays so absence is
 * unambiguous — the orchestrator's `council ?? global ?? DEFAULT` cascade
 * must see `undefined`, never `""` or `[]`, for a knob the user cleared.
 * Returns undefined when nothing survives, so the row never carries an empty
 * `deliberation: {}` bag (mirrors the localStorage adapters' `sanitize`).
 */
/** The free-text prompt/template overrides `sanitizeDeliberation` handles
 *  generically (empty/whitespace → dropped). */
const DELIBERATION_STRING_KEYS = [
  'participant',
  'votingSystem',
  'votingTemplate',
  'reanswerSystem',
  'reanswerTemplate',
  'judgeTemplate',
  'mediatorTemplate',
] as const satisfies readonly (keyof CouncilDeliberation)[]

// Completeness check (compile-time): every `CouncilDeliberation` field must
// be handled below — either as a string key above or as one of the
// explicitly-sanitized structural knobs. A field added to the type but
// missed here would be silently stripped on every save. Both directions
// assert, so the two lists and the type can't drift apart.
type SanitizedStructuralKey = Exclude<
  keyof CouncilDeliberation,
  (typeof DELIBERATION_STRING_KEYS)[number]
>
void (undefined as unknown as SanitizedStructuralKey satisfies
  | 'votingDimensions'
  | 'minCommentLength'
  | 'mediatorMaxRounds'
  | 'passDivergence'
  | 'passPeerAnswers')
void (undefined as unknown as
  | 'votingDimensions'
  | 'minCommentLength'
  | 'mediatorMaxRounds'
  | 'passDivergence'
  | 'passPeerAnswers' satisfies SanitizedStructuralKey)

function sanitizeDeliberation(
  d: CouncilDeliberation | undefined,
): CouncilDeliberation | undefined {
  if (!d) return undefined
  const clean: CouncilDeliberation = {}
  if (d.votingDimensions && d.votingDimensions.length > 0) {
    clean.votingDimensions = d.votingDimensions
  }
  if (d.minCommentLength !== undefined) {
    clean.minCommentLength = d.minCommentLength
  }
  if (d.mediatorMaxRounds !== undefined) {
    clean.mediatorMaxRounds = d.mediatorMaxRounds
  }
  if (d.passDivergence !== undefined) clean.passDivergence = d.passDivergence
  if (d.passPeerAnswers !== undefined) {
    clean.passPeerAnswers = d.passPeerAnswers
  }
  for (const key of DELIBERATION_STRING_KEYS) {
    const v = d[key]
    if (typeof v === 'string' && v.trim().length > 0) clean[key] = v
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/**
 * Replace the council's deliberation overrides. Sanitizes first; if nothing
 * survives, clears the field entirely (back to the full global cascade).
 * Unlike `setJudge` / `setMediator` there's no structure guard — the knobs
 * are inert on a structure that doesn't consult them (e.g. a round cap on a
 * Trial council), and the UI only surfaces the relevant ones per structure.
 */
export async function setDeliberation(
  councilId: string,
  deliberation: CouncilDeliberation,
): Promise<void> {
  const clean = sanitizeDeliberation(deliberation)
  await db.transaction('rw', db.councils, async () => {
    const owner = await db.councils.get(councilId)
    if (!owner) throw new Error('setDeliberation: council_not_found')
    // Dexie deletes a key whose value is `undefined`, so an emptied bag
    // resets the council to the global-default cascade.
    await db.councils.update(councilId, { deliberation: clean })
  })
}

export async function patchCouncilTitle(
  councilId: string,
  title: string,
): Promise<void> {
  const trimmed = title.trim()
  if (trimmed.length === 0) throw new Error('patchCouncilTitle: title_empty')
  const clamped = trimmed.slice(0, 60)
  const result = await db.councils.update(councilId, { title: clamped })
  if (result === 0) throw new Error('patchCouncilTitle: not_found')
}

export async function deleteCouncil(id: string): Promise<void> {
  // Cascade: Dexie has no foreign-key constraints, so seats and turns
  // for this council are dropped explicitly within the same
  // transaction. Anything reading mid-cascade sees a consistent view.
  await db.transaction('rw', db.councils, db.seats, db.turns, async () => {
    await db.councils.delete(id)
    await db.seats.where('councilId').equals(id).delete()
    await db.turns.where('councilId').equals(id).delete()
  })
}
