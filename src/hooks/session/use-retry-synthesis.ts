/**
 * Synthesis retry (Judge verdict / final Mediator round) for
 * `useCouncilSession`.
 *
 * A failed synthesis is the most expensive failure in a turn: every
 * Participant answer (and every vote / debate round) is already paid for,
 * and without this the only recovery was re-asking the whole council.
 * Mirrors `use-retry-seat.ts`: re-runs the errored event with the same
 * context the orchestrator built and **replaces it in place** (same event
 * id), so the block recovers without touching the rest of the turn.
 * Offered by the UI on the latest turn only (see `chat-thread.tsx`) —
 * later turns' synthesis context may already have consumed this one.
 *
 * Scope: error recovery, not regenerate. The Mediator retry re-runs only
 * the turn's *final* errored round (the state that left the turn without
 * an answer — mid-debate errors were already survived by later rounds);
 * it never resumes the debate loop. Both retries rebuild their inputs
 * from persisted state: the Judge via the shared `runJudgeSynthesis`
 * (one implementation with the live Trial phase), the Mediator from the
 * round's (re)answer events, the persisted anonymization labels, and the
 * prior rounds' transcript. Controller acquisition/release and the
 * replace-in-place tail ride `runSessionRetry` / `replaceRetriedEvent`.
 */

import { useCallback } from 'react'
import {
  replaceRetriedEvent,
  runSessionRetry,
} from '@/hooks/session/retry-run'
import { runMediatorRound } from '@/providers/run-mediator'
import {
  DEFAULT_INCLUDE_PRIOR_MEDIATOR,
  DEFAULT_STRIP_SELF_ID,
  getBehaviorSettings,
} from '@/storage/behavior'
import {
  DEFAULT_MEDIATOR_SYSTEM_PROMPT,
  getUserPrompts,
} from '@/storage/prompts'
import { resolveDeliberation } from '@/hooks/session/resolve-deliberation'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import {
  buildMediatorEvent,
  buildMediatorRoundPrompt,
} from '@/utils/session/mediator-round'
import { clampMediatorRounds } from '@/utils/session/clamps'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { getStickyReasoningEffort } from '@/storage/run-options'
import type { Council } from '@/types/council'
import type { MediatorRoundOutcome, SynthRetryState } from '@/types/session'

export function useRetrySynthesis({
  council,
  setCouncil,
  abortRef,
  runStartingRef,
  isBusy,
  setSynthRetry,
}: {
  council: Council | null
  setCouncil: React.Dispatch<React.SetStateAction<Council | null>>
  abortRef: React.MutableRefObject<AbortController | null>
  /** Set, synchronously, while a resume is being started. `isBusy` can't
   *  cover that window: it only flips once the run's first `setState`
   *  commits, and auto-resume fires without a click — so a retry tapped in
   *  between would become a second writer, and `appendTurn` replaces a
   *  turn's events wholesale. Same ref shape as `abortRef` above. */
  runStartingRef: React.MutableRefObject<string | null>
  /** True while any parent phase — including this retry's own overlay —
   *  is in flight; a retry must not race them. */
  isBusy: boolean
  setSynthRetry: React.Dispatch<React.SetStateAction<SynthRetryState | null>>
}): {
  retryJudge: (turnId: string) => Promise<void>
  retryMediatorRound: (turnId: string) => Promise<void>
} {
  const retryJudge = useCallback(
    async (turnId: string) => {
      if (!council || isBusy || runStartingRef.current !== null) return
      const turn = council.turns.find((t) => t.id === turnId)
      if (!turn) return
      const oldEvent = turn.events.find(
        (e) => e.roleType === 'judge' && !!e.error,
      )
      if (!oldEvent) return
      // Retry runs with the council's *current* Judge (config + model may
      // have been fixed since the failure — often the reason to retry).
      const judge = council.judge
      if (!judge) return

      setSynthRetry({
        turnId,
        role: 'judge',
        modelId: judge.modelId,
        output: '',
      })
      await runSessionRetry(
        council.id,
        abortRef,
        async (signal) => {
          // Same context the orchestrator's Judge phase builds — one shared
          // implementation (`runJudgeSynthesis`), fed from persisted state.
          // The errored event's id makes the replacement land in place.
          const priorTurns = council.turns.filter((t) => t.idx < turn.idx)
          // The sticky Thinking override covers retries too (read from
          // storage — the composer writes every dial change back there).
          const reasoningOverride = getStickyReasoningEffort(council.id)
          const { event } = await runJudgeSynthesis({
            eventId: oldEvent.id,
            judge,
            seats: council.seats,
            events: turn.events,
            userMsg: turn.userMsg,
            ...(turn.userImages && turn.userImages.length > 0
              ? { userImages: turn.userImages }
              : {}),
            priorTurns,
            deliberation: council.deliberation,
            ...(reasoningOverride
              ? { reasoningEffortOverride: reasoningOverride }
              : {}),
            abortSignal: signal,
            onChunk: (acc) =>
              setSynthRetry((cur) =>
                cur && cur.turnId === turnId && cur.role === 'judge'
                  ? { ...cur, output: acc }
                  : cur,
              ),
          })
          // A pure abort (Stop before any text or error) leaves the old
          // errored event untouched — same rule as the seat retry.
          if (!event) return
          await replaceRetriedEvent({
            councilId: council.id,
            turnId,
            event,
            site: 'retryJudge',
            setCouncil,
          })
        },
        () => setSynthRetry(null),
      )
    },
    [council, setCouncil, abortRef, runStartingRef, isBusy, setSynthRetry],
  )

  const retryMediatorRound = useCallback(
    async (turnId: string) => {
      if (!council || isBusy || runStartingRef.current !== null) return
      const turn = council.turns.find((t) => t.id === turnId)
      if (!turn) return
      const mediator = council.mediator
      if (!mediator) return
      // Only the turn's *final* mediator round is retryable — an earlier
      // errored round was already survived by a later one, so re-running
      // it would rewrite a debate that moved on.
      const mediatorEvents = turn.events.filter(
        (e) => e.roleType === 'mediator',
      )
      const oldEvent = mediatorEvents.at(-1)
      if (!oldEvent || !oldEvent.error) return
      const round =
        oldEvent.mediator?.round ?? oldEvent.round ?? mediatorEvents.length
      // The per-turn anonymization map is persisted with every Consensus
      // turn; without it the round's answers can't be re-labelled.
      const labels = turn.votingLabels
      if (!labels) return
      const roundEvents =
        round === 1
          ? turn.events.filter((e) => e.roleType === 'participant')
          : turn.events.filter(
              (e) => e.roleType === 'reanswer' && e.round === round,
            )
      if (!roundEvents.some((e) => !e.error && e.output.length > 0)) return

      setSynthRetry({
        turnId,
        role: 'mediator',
        modelId: mediator.modelId,
        round,
        output: '',
      })
      await runSessionRetry(
        council.id,
        abortRef,
        async (signal) => {
          // Rebuild the round's prompt exactly as `runConsensusPhase` framed
          // it — same shared builder, fed from persisted state: the round's
          // answers (anonymized under the persisted labels) and the prior
          // rounds reconstructed from the turn's mediator events.
          const behavior = getBehaviorSettings()
          const stripSelfId = behavior.stripSelfId ?? DEFAULT_STRIP_SELF_ID
          const includePrior =
            behavior.includePriorMediator ?? DEFAULT_INCLUDE_PRIOR_MEDIATOR
          const resolved = resolveDeliberation(council.deliberation)
          // The cap can have changed since the turn ran — never render
          // "round 3 of 2" into the prompt.
          const maxRounds = Math.max(
            clampMediatorRounds(resolved.mediatorMaxRounds),
            round,
          )
          const priorTurns = council.turns.filter((t) => t.idx < turn.idx)
          const priorRounds: MediatorRoundOutcome[] = mediatorEvents
            .filter((e) => (e.mediator?.round ?? e.round ?? 0) < round)
            .map((e) => ({
              round: e.mediator?.round ?? e.round ?? 0,
              status: e.error ? 'error' : 'done',
              synthesis: e.output,
              ...(e.mediator?.convergent !== undefined
                ? { convergent: e.mediator.convergent }
                : {}),
              ...(e.mediator?.divergencePoints
                ? { divergencePoints: e.mediator.divergencePoints }
                : {}),
              error: e.error ?? null,
            }))
          const prompt = buildMediatorRoundPrompt({
            template: resolved.mediatorTemplate,
            userMsg: turn.userMsg,
            labels,
            roundEvents,
            priorRounds,
            round,
            maxRounds,
            stripSelfId,
            priorTurns: includePrior ? priorTurns : undefined,
          })
          const mediatorSystem =
            getUserPrompts().mediatorSystem?.trim() ||
            DEFAULT_MEDIATOR_SYSTEM_PROMPT
          const result = await runMediatorRound({
            modelId: mediator.modelId,
            system: mediatorSystem,
            systemPromptOverride: mediator.config.systemPrompt,
            // Sticky Thinking override, same as the Judge retry above.
            ...samplingArgs(
              mediator.config,
              resolveReasoningEffort(
                mediator,
                getStickyReasoningEffort(council.id),
              ),
            ),
            prompt,
            abortSignal: signal,
          })
          if (result.aborted && result.synthesis.length === 0) return
          await replaceRetriedEvent({
            councilId: council.id,
            turnId,
            event: buildMediatorEvent({
              id: oldEvent.id,
              modelId: mediator.modelId,
              round,
              result,
            }),
            site: 'retryMediatorRound',
            setCouncil,
          })
        },
        () => setSynthRetry(null),
      )
    },
    [council, setCouncil, abortRef, runStartingRef, isBusy, setSynthRetry],
  )

  return { retryJudge, retryMediatorRound }
}
