/**
 * Consensus debate orchestration.
 *
 * The participant-driven loop: each round the Mediator assesses the
 * current answers for convergence; while they don't converge, *every*
 * Participant re-answers — reconsidering its own position against the
 * Mediator's anonymized divergence framing (and optionally the peers'
 * anonymized answers). The loop ends on a convergent verdict, an
 * unrecoverable Mediator failure, two consecutive errored rounds, or the
 * round cap.
 *
 * **Why a phase module** (mirrors `run-voting-phase.ts`): keeps the
 * orchestrator (`use-council-session.ts`) focused on the turn lifecycle
 * (fan-out → phase → persist) — this owns the debate's own state machine
 * and reports progress through `setMediatingTurn`. It returns the new
 * events for the orchestrator to persist alongside the round-1 answers,
 * plus the per-turn anonymization map (stored on the turn so the UI can
 * map digest labels back to real seats).
 *
 * Reuses: `buildVotingLabels` / `formatLabeledAnswers` (anonymization),
 * `runReanswerForSeat` (the generic re-invoke shim), `runMediatorRound`
 * (the structured assessment), and `buildMediatorRoundPrompt` /
 * `buildMediatorEvent` (`utils/session/mediator-round.ts` — shared with
 * the final-round retry so the two can't drift).
 */

import type { Dispatch, SetStateAction } from 'react'
import {
  DEFAULT_INCLUDE_PRIOR_MEDIATOR,
  DEFAULT_STRIP_SELF_ID,
  getBehaviorSettings,
} from '@/storage/behavior'
import {
  applyTemplate,
  DEFAULT_MEDIATOR_SYSTEM_PROMPT,
  getUserPrompts,
} from '@/storage/prompts'
import { resolveDeliberation } from '@/hooks/session/resolve-deliberation'
import { runMediatorRound } from '@/providers/run-mediator'
import { runReanswerForSeat } from '@/providers/run-reanswer'
import { buildVotingLabels, formatLabeledAnswers } from '@/utils/voting-labels'
import {
  buildMediatorEvent,
  buildMediatorRoundPrompt,
} from '@/utils/session/mediator-round'
import { clampMediatorRounds } from '@/utils/session/clamps'
import { fanOutSeats, seedPerSeatStreams } from '@/utils/session/fan-out'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { modelSeesImages } from '@/utils/session/vision'
import { uuid } from '@/utils/uuid'
import type {
  CouncilDeliberation,
  Mediator,
  Seat,
  SeatConfig,
  Turn,
  TurnEvent,
} from '@/types/council'
import type {
  MediatingTurn,
  MediatorRoundOutcome,
  PerSeatStream,
} from '@/types/session'

export interface ConsensusPhaseResult {
  /** New events to append to the turn — `reanswer` (rounds ≥ 2) and
   *  `mediator` (one per round), in chronological order. */
  events: TurnEvent[]
  /** Per-turn anonymization map (label → seatId), stable across rounds and
   *  persisted on the turn so the UI can map digest labels back to seats. */
  labels: Record<string, string>
}

export async function runConsensusPhase(args: {
  turnId: string
  mediator: Mediator
  /** Seats that produced a usable round-1 answer (= the debate's voices). */
  respondingSeats: Seat[]
  /** The round-1 participant events (the shared answer fan-out). */
  roundOneEvents: TurnEvent[]
  userMsg: string
  /** The turn's image attachments — re-attached to every re-answer call
   *  (each is a *fresh* request, so without this a Participant debating an
   *  image loses sight of it from round 2 on; earlier gap). Per-seat
   *  vision guard applied at the call. The Mediator referees the *text*
   *  positions and deliberately doesn't receive the images. */
  userImages?: string[]
  priorTurns: Turn[]
  /** Raw per-council overrides; resolved inside (council ?? global ?? default). */
  deliberation: CouncilDeliberation | undefined
  /** Per-structure Participant default prompt (Consensus → participantConsensus),
   *  layered under the re-answer task prompt as the seat persona. */
  participantDefault: string | undefined
  /** Per-turn extended-thinking override (the composer's run options) —
   *  the whole turn is "this message", so it covers re-answer rounds and
   *  the Mediator's own rounds too. Applied per role only where the model
   *  supports reasoning. */
  reasoningEffortOverride?: NonNullable<SeatConfig['reasoningEffort']>
  abortSignal: AbortSignal
  setMediatingTurn: Dispatch<SetStateAction<MediatingTurn | null>>
}): Promise<ConsensusPhaseResult> {
  const {
    turnId,
    mediator,
    respondingSeats,
    roundOneEvents,
    userMsg,
    userImages,
    priorTurns,
    deliberation,
    participantDefault,
    reasoningEffortOverride,
    abortSignal,
    setMediatingTurn,
  } = args

  const resolved = resolveDeliberation(deliberation)
  const maxRounds = clampMediatorRounds(resolved.mediatorMaxRounds)
  const behavior = getBehaviorSettings()
  const stripSelfId = behavior.stripSelfId ?? DEFAULT_STRIP_SELF_ID
  const includePrior =
    behavior.includePriorMediator ?? DEFAULT_INCLUDE_PRIOR_MEDIATOR
  const mediatorSystem =
    getUserPrompts().mediatorSystem?.trim() || DEFAULT_MEDIATOR_SYSTEM_PROMPT
  const mediatorModelId = mediator.modelId

  // One anonymization map for the whole turn — stable across rounds so a
  // Participant can track a peer's argument from one round to the next.
  const labels = buildVotingLabels(respondingSeats.map((s) => s.id))

  const events: TurnEvent[] = []
  const priorRounds: MediatorRoundOutcome[] = []
  let currentRoundEvents = roundOneEvents

  setMediatingTurn({
    id: turnId,
    modelId: mediatorModelId,
    maxRounds,
    currentRound: 1,
    rounds: [],
    reanswers: {},
    labels,
    status: 'mediating',
  })

  for (let round = 1; round <= maxRounds; round++) {
    if (abortSignal.aborted) break

    // --- Mediator assessment of this round's answers (anonymized) ---
    // Shared with the final-round retry (`use-retry-synthesis.ts`) via
    // `buildMediatorRoundPrompt`, so a retried round is framed exactly
    // like the live one that failed.
    const prompt = buildMediatorRoundPrompt({
      template: resolved.mediatorTemplate,
      userMsg,
      labels,
      roundEvents: currentRoundEvents,
      priorRounds,
      round,
      maxRounds,
      stripSelfId,
      priorTurns: includePrior ? priorTurns : undefined,
    })

    // Push the in-flight round card the moment the round starts.
    const placeholder: MediatorRoundOutcome = {
      round,
      status: 'mediating',
      synthesis: '',
      error: null,
    }
    setMediatingTurn((cur) =>
      cur && cur.id === turnId
        ? { ...cur, currentRound: round, rounds: [...cur.rounds, placeholder] }
        : cur,
    )

    const result = await runMediatorRound({
      modelId: mediatorModelId,
      system: mediatorSystem,
      systemPromptOverride: mediator.config.systemPrompt,
      ...samplingArgs(
        mediator.config,
        resolveReasoningEffort(mediator, reasoningEffortOverride),
      ),
      prompt,
      abortSignal,
    })

    const outcome: MediatorRoundOutcome = {
      round,
      status: result.error ? 'error' : 'done',
      synthesis: result.synthesis,
      ...(result.convergent !== undefined
        ? { convergent: result.convergent }
        : {}),
      ...(result.divergencePoints
        ? { divergencePoints: result.divergencePoints }
        : {}),
      ...(result.roundDigest ? { roundDigest: result.roundDigest } : {}),
      ...(result.rawResponse ? { rawResponse: result.rawResponse } : {}),
      error: result.error ?? null,
    }
    priorRounds.push(outcome)
    setMediatingTurn((cur) =>
      cur && cur.id === turnId
        ? {
            ...cur,
            rounds: cur.rounds.map((r) => (r.round === round ? outcome : r)),
          }
        : cur,
    )

    // Persist the mediator event unless it's a pure abort with no text.
    if (!(result.aborted && result.synthesis.length === 0)) {
      events.push(
        buildMediatorEvent({
          id: uuid(),
          modelId: mediatorModelId,
          round,
          result,
        }),
      )
    }

    // Stop conditions: converged early, unrecoverable failure, two
    // consecutive errored rounds, or the round cap (no re-answer after the
    // last round). Errored rounds don't get to declare convergence.
    if (!result.error && result.convergent === true) break
    if (result.unrecoverable) break
    if (
      priorRounds.length >= 2 &&
      priorRounds.at(-1)?.status === 'error' &&
      priorRounds.at(-2)?.status === 'error'
    ) {
      break
    }
    if (round === maxRounds || abortSignal.aborted) break

    // --- Re-answer round (everyone reconsiders) ---
    const nextRound = round + 1
    const divergenceBlock =
      resolved.passDivergence && result.divergencePoints
        ? `\n---\n\nPoints of disagreement the mediator identified:\n${result.divergencePoints}\n`
        : ''

    const initialPerSeat = seedPerSeatStreams(respondingSeats)
    setMediatingTurn((cur) =>
      cur && cur.id === turnId
        ? {
            ...cur,
            currentRound: nextRound,
            reanswers: { ...cur.reanswers, [nextRound]: initialPerSeat },
          }
        : cur,
    )
    const updateReanswerSeat = (
      seatId: string,
      patch: Partial<PerSeatStream>,
    ) => {
      setMediatingTurn((cur) => {
        if (!cur || cur.id !== turnId) return cur
        const roundMap = cur.reanswers[nextRound]
        const existing = roundMap?.[seatId]
        if (!roundMap || !existing) return cur
        return {
          ...cur,
          reanswers: {
            ...cur.reanswers,
            [nextRound]: { ...roundMap, [seatId]: { ...existing, ...patch } },
          },
        }
      })
    }

    const outcomes = await fanOutSeats(respondingSeats, async (seat) => {
      const ownEvent = currentRoundEvents.find(
        (e) => e.seatId === seat.id && !e.error,
      )
      const ownAnswer = ownEvent?.output ?? ''
      const peerBlock = resolved.passPeerAnswers
        ? `\n---\n\nOther participants' current answers (anonymized):\n${formatLabeledAnswers(
            labels,
            currentRoundEvents,
            seat.id,
            { stripSelfId },
          )}\n`
        : ''
      const prompt = applyTemplate(resolved.reanswerTemplate, {
        question: userMsg,
        ownAnswer,
        divergence: divergenceBlock,
        peerAnswers: peerBlock,
        round: String(nextRound),
        maxRounds: String(maxRounds),
      })
      // Layer the re-answer task on top of the seat's persona (per-seat →
      // per-structure default) so a custom "Answer as a security expert"
      // identity survives. The task prompt carries no "You are X" claim,
      // so concatenation creates no competing identity.
      const persona = (
        seat.config.systemPrompt ??
        participantDefault ??
        ''
      ).trim()
      const system = persona
        ? `${persona}\n\n${resolved.reanswerSystem}`
        : resolved.reanswerSystem
      const r = await runReanswerForSeat({
        seat,
        system,
        prompt,
        ...samplingArgs(
          seat.config,
          resolveReasoningEffort(seat, reasoningEffortOverride),
        ),
        ...(modelSeesImages(seat.modelId, userImages)
          ? { images: userImages }
          : {}),
        abortSignal,
        onChunk: (acc) => updateReanswerSeat(seat.id, { output: acc }),
        onReasoning: (acc) =>
          updateReanswerSeat(seat.id, { reasoning: acc }),
      })
      updateReanswerSeat(seat.id, {
        output: r.text,
        status: r.error ? 'error' : 'done',
        error: r.error ?? null,
      })
      return r
    })

    const reanswerEvents: TurnEvent[] = []
    for (const { seat, result: r } of outcomes) {
      // Pure abort with no text leaves no record (same rule as the answer
      // phase); errored re-answers still land so the UI shows what failed.
      if (r.text.length === 0 && !r.error) continue
      const ev: TurnEvent = {
        id: uuid(),
        roleType: 'reanswer',
        seatId: seat.id,
        modelId: seat.modelId,
        output: r.text,
        ts: Date.now(),
        round: nextRound,
        ...(r.tokens ? { tokens: r.tokens } : {}),
        ...(r.error ? { error: r.error } : {}),
      }
      reanswerEvents.push(ev)
      events.push(ev)
    }

    // Nothing usable to assess next round → stop here.
    const usable = reanswerEvents.filter((e) => !e.error && e.output.length > 0)
    if (usable.length === 0) break
    currentRoundEvents = reanswerEvents
  }

  // Settle the in-flight status (the orchestrator clears the state once the
  // turn persists; this avoids a flash of the "mediating" spinner first).
  const allErrored =
    priorRounds.length > 0 && priorRounds.every((r) => r.status === 'error')
  setMediatingTurn((cur) =>
    cur && cur.id === turnId
      ? { ...cur, status: allErrored ? 'error' : 'done' }
      : cur,
  )

  return { events, labels }
}
