/**
 * Pane-derivation helpers — pure data transformations between the
 * orchestrator's per-phase state (StreamingTurn, MediatingTurn, persisted
 * `Turn`) and the renderable `RoundtablePane` / `MediatorRoundView` /
 * `ConsensusRoundView` shapes the chat thread consumes.
 *
 * Lifted out of `chat-thread.tsx` so they can be unit-tested in
 * isolation and so the component files stay focused on rendering.
 */

import { getModel } from '@/models/registry'
import { getSeatDisplayLabel } from '@/utils/seat-label'
import { resolveAnonymizedLabel } from '@/utils/session/anonymized-label'
import type { Council, RoundDigest, Seat, Turn } from '@/types/council'
import type {
  MediatingTurn,
  MediatorRoundOutcome,
  MediatorRoundView,
  ResolvedDigest,
  RoundtablePane,
  StreamingTurn,
} from '@/types/session'


/**
 * Ghost placeholder for a non-vision seat on an image-bearing turn — the
 * orchestrator skipped the seat to keep the prompt honest, and both the
 * persisted and streaming pane builders must render that skip identically.
 */
function ghostNoVisionPane(
  turnId: string,
  seat: Seat,
  seats: Council['seats'],
): RoundtablePane {
  return {
    key: `${turnId}:${seat.id}:ghost-no-vision`,
    seatId: seat.id,
    modelId: seat.modelId,
    displayLabel: getSeatDisplayLabel(seat, seats),
    output: '',
    status: 'done',
    ghostReason: "Skipped: this model doesn't support image inputs.",
  }
}

export function panesForTurn(
  turn: Turn,
  seats: Council['seats'],
): RoundtablePane[] {
  const panes: RoundtablePane[] = []
  for (const seat of seats) {
    const event = turn.events.find(
      (e) => e.roleType === 'participant' && e.seatId === seat.id,
    )
    if (!event) {
      // Image-bearing turn against a non-vision seat: the
      // orchestrator skipped the seat to keep the prompt honest;
      // render a ghosted placeholder so the user sees why their seat
      // is missing for this turn rather than wondering whether it
      // crashed silently.
      const hasImages =
        turn.userImages !== undefined && turn.userImages.length > 0
      if (hasImages && !getModel(seat.modelId).capabilities.vision) {
        panes.push(ghostNoVisionPane(turn.id, seat, seats))
      }
      continue
    }
    panes.push({
      key: `${turn.id}:${seat.id}`,
      seatId: seat.id,
      modelId: event.modelId,
      displayLabel: getSeatDisplayLabel(seat, seats),
      output: event.output,
      status: event.error ? 'error' : 'done',
      error: event.error ?? null,
      ...(event.toolCalls && event.toolCalls.length > 0
        ? { toolCalls: event.toolCalls }
        : {}),
    })
  }
  return panes
}

export function panesForStreamingTurn(
  turn: StreamingTurn,
  seats: Council['seats'],
): RoundtablePane[] {
  const panes: RoundtablePane[] = []
  const hasImages =
    turn.userImages !== undefined && turn.userImages.length > 0
  for (const seat of seats) {
    const entry = turn.perSeat[seat.id]
    if (!entry) {
      // Same ghosted-pane rule as the persisted path.
      // Non-vision seats on an image-bearing turn render as ghosts so
      // the user sees the deliberate skip.
      if (hasImages && !getModel(seat.modelId).capabilities.vision) {
        panes.push(ghostNoVisionPane(turn.id, seat, seats))
      }
      continue
    }
    panes.push({
      key: `${turn.id}:${seat.id}`,
      modelId: entry.modelId,
      displayLabel: getSeatDisplayLabel(seat, seats),
      output: entry.output,
      status: entry.status,
      error: entry.error,
      // Live thinking feed — in-flight only; persisted panes never carry it.
      ...(entry.reasoning ? { reasoning: entry.reasoning } : {}),
    })
  }
  return panes
}

/**
 * One round of the Consensus debate for rendering: the Participant
 * answers for that round (round 1 = the fan-out; rounds ≥ 2 = re-answers)
 * and the Mediator's assessment of them, if it ran.
 */
export interface ConsensusRoundView {
  round: number
  answerPanes: RoundtablePane[]
  mediator?: MediatorRoundView
}

/** Display-only cleanup for an *unresolvable* digest label: drop a
 *  "Model " prefix the model may have included, so the fallback never
 *  renders as "Model Model A". Actual label resolution goes through the
 *  shared `resolveAnonymizedLabel`. */
function stripModelPrefix(label: string): string {
  return label.replace(/^model\s+/i, '').trim()
}

/** The seat behind an anonymized label, via the turn's `label → seatId`
 *  map. Resolution uses the shared coercer, so decorated references
 *  (`"model_a"`, `"Participant B"`, quoted letters) resolve here exactly
 *  as they do in the voting parser — the two must not drift. */
function seatForLabel(
  label: string,
  votingLabels: Record<string, string> | undefined,
  seats: Council['seats'],
) {
  if (!votingLabels) return undefined
  const resolved = resolveAnonymizedLabel(
    label,
    new Set(Object.keys(votingLabels)),
  )
  const seatId = resolved ? votingLabels[resolved] : undefined
  return seatId ? seats.find((s) => s.id === seatId) : undefined
}

/**
 * De-anonymize **user-facing** Mediator prose: replace `Model A/B/…` with the
 * real seat name. The labels are a prompt-only device (the Mediator reasons
 * over anonymized answers so its divergence framing can pass straight back to
 * Participants un-leaked); the user, though, should read who actually said
 * what. Display-time only — the stored event + the framing sent to
 * Participants stay anonymized. Longer labels first so `Model AA` resolves
 * before `Model A`.
 */
function deanonymize(
  text: string,
  votingLabels: Record<string, string> | undefined,
  seats: Council['seats'],
): string {
  if (!votingLabels || !text) return text
  let out = text
  const labels = Object.keys(votingLabels).sort((a, b) => b.length - a.length)
  for (const label of labels) {
    const seat = seatForLabel(label, votingLabels, seats)
    if (!seat) continue
    out = out.split(`Model ${label}`).join(getSeatDisplayLabel(seat, seats))
  }
  return out
}

/** Resolve a Mediator-authored digest's anonymized labels (Model A/B/C) to
 *  real seat display names — the user sees who actually moved. */
function resolveDigest(
  digest: RoundDigest | undefined,
  votingLabels: Record<string, string> | undefined,
  seats: Council['seats'],
): ResolvedDigest | undefined {
  if (!digest) return undefined
  return {
    summary: deanonymize(digest.summary, votingLabels, seats),
    movements: digest.movements.map((m) => {
      const seat = seatForLabel(m.label, votingLabels, seats)
      return {
        displayLabel: seat
          ? getSeatDisplayLabel(seat, seats)
          : `Model ${stripModelPrefix(m.label)}`,
        stance: m.stance,
        note: deanonymize(m.note, votingLabels, seats),
      }
    }),
  }
}

/** Build a `MediatorRoundView` from an in-flight round outcome. */
function viewFromOutcome(
  o: MediatorRoundOutcome,
  modelId: string,
  votingLabels: Record<string, string> | undefined,
  seats: Council['seats'],
): MediatorRoundView {
  const digest = resolveDigest(o.roundDigest, votingLabels, seats)
  return {
    round: o.round,
    modelId,
    status: o.status,
    synthesis: deanonymize(o.synthesis, votingLabels, seats),
    ...(o.convergent !== undefined ? { convergent: o.convergent } : {}),
    ...(o.divergencePoints
      ? { divergencePoints: deanonymize(o.divergencePoints, votingLabels, seats) }
      : {}),
    ...(digest ? { digest } : {}),
    ...(o.rawResponse ? { rawResponse: o.rawResponse } : {}),
    error: o.error,
  }
}

/** Persisted re-answer panes for one Consensus round (`roleType: 'reanswer'`
 *  events with a matching `round`). */
function reanswerPanesForRound(
  turn: Turn,
  seats: Council['seats'],
  round: number,
): RoundtablePane[] {
  const panes: RoundtablePane[] = []
  for (const seat of seats) {
    const event = turn.events.find(
      (e) =>
        e.roleType === 'reanswer' && e.seatId === seat.id && e.round === round,
    )
    if (!event) continue
    panes.push({
      key: `${turn.id}:${seat.id}:r${round}`,
      modelId: event.modelId,
      displayLabel: getSeatDisplayLabel(seat, seats),
      output: event.output,
      status: event.error ? 'error' : 'done',
      error: event.error ?? null,
    })
  }
  return panes
}

/**
 * Persisted Consensus rounds for one Consensus turn. Reads the
 * `participant` (round 1), `reanswer` (rounds ≥ 2) and `mediator` events
 * and groups them into the interleaved round timeline. Digest labels are
 * de-anonymized via the turn's `votingLabels` map.
 */
export function consensusRoundsForTurn(
  turn: Turn,
  seats: Council['seats'],
): ConsensusRoundView[] {
  const mediatorByRound = new Map<number, MediatorRoundView>()
  for (const ev of turn.events) {
    if (ev.roleType !== 'mediator') continue
    const round = ev.mediator?.round ?? mediatorByRound.size + 1
    const labels = turn.votingLabels
    const digest = resolveDigest(ev.mediator?.roundDigest, labels, seats)
    mediatorByRound.set(round, {
      round,
      modelId: ev.modelId,
      status: ev.error ? 'error' : 'done',
      synthesis: deanonymize(ev.output, labels, seats),
      ...(ev.mediator?.convergent !== undefined
        ? { convergent: ev.mediator.convergent }
        : {}),
      ...(ev.mediator?.divergencePoints
        ? { divergencePoints: deanonymize(ev.mediator.divergencePoints, labels, seats) }
        : {}),
      ...(digest ? { digest } : {}),
      ...(ev.rawResponse ? { rawResponse: ev.rawResponse } : {}),
      error: ev.error ?? null,
    })
  }

  const roundNumbers = new Set<number>([1])
  for (const k of mediatorByRound.keys()) roundNumbers.add(k)
  for (const ev of turn.events) {
    if (ev.roleType === 'reanswer' && ev.round) roundNumbers.add(ev.round)
  }
  const maxRound = Math.max(...roundNumbers)

  const out: ConsensusRoundView[] = []
  for (let r = 1; r <= maxRound; r++) {
    const answerPanes =
      r === 1 ? panesForTurn(turn, seats) : reanswerPanesForRound(turn, seats, r)
    const mediator = mediatorByRound.get(r)
    out.push({ round: r, answerPanes, ...(mediator ? { mediator } : {}) })
  }
  return out
}

/**
 * In-flight Consensus rounds — same shape as `consensusRoundsForTurn` but
 * derived from the streaming fan-out (`StreamingTurn`, round 1) plus the
 * Mediator and re-answer progress on `MediatingTurn`, so the timeline fills
 * in live as each round lands.
 */
export function consensusRoundsForMediating(
  streamingTurn: StreamingTurn,
  mediatingTurn: MediatingTurn,
  seats: Council['seats'],
): ConsensusRoundView[] {
  const outcomeByRound = new Map<number, MediatorRoundOutcome>()
  for (const o of mediatingTurn.rounds) outcomeByRound.set(o.round, o)

  const roundNumbers = new Set<number>([1])
  for (const k of outcomeByRound.keys()) roundNumbers.add(k)
  for (const k of Object.keys(mediatingTurn.reanswers)) roundNumbers.add(Number(k))
  const maxRound = Math.max(...roundNumbers)

  const out: ConsensusRoundView[] = []
  for (let r = 1; r <= maxRound; r++) {
    const answerPanes =
      r === 1
        ? panesForStreamingTurn(streamingTurn, seats)
        : reanswerPanesFromStreams(mediatingTurn.reanswers[r], seats)
    const outcome = outcomeByRound.get(r)
    const mediator = outcome
      ? viewFromOutcome(
          outcome,
          mediatingTurn.modelId,
          mediatingTurn.labels,
          seats,
        )
      : undefined
    out.push({ round: r, answerPanes, ...(mediator ? { mediator } : {}) })
  }
  return out
}

/** In-flight re-answer panes for one round, from the per-seat stream map. */
function reanswerPanesFromStreams(
  streams: Record<string, StreamingTurn['perSeat'][string]> | undefined,
  seats: Council['seats'],
): RoundtablePane[] {
  if (!streams) return []
  const panes: RoundtablePane[] = []
  for (const seat of seats) {
    const entry = streams[seat.id]
    if (!entry) continue
    panes.push({
      key: `${seat.id}:reanswer`,
      modelId: entry.modelId,
      displayLabel: getSeatDisplayLabel(seat, seats),
      output: entry.output,
      status: entry.status,
      error: entry.error,
      // Live thinking feed — in-flight only, same rule as the fan-out panes.
      ...(entry.reasoning ? { reasoning: entry.reasoning } : {}),
    })
  }
  return panes
}
