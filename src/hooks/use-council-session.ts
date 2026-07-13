import { useCallback, useEffect, useRef, useState } from 'react'
import { appendTurn, getCouncil } from '@/storage/councils'
import { useSeatCRUD } from '@/hooks/session/use-seat-crud'
import { useRetrySeat } from '@/hooks/session/use-retry-seat'
import { useRetrySynthesis } from '@/hooks/session/use-retry-synthesis'
import { useRetryVotes } from '@/hooks/session/use-retry-votes'
import { runTrialPhase } from '@/hooks/session/run-trial-phase'
import { runConsensusPhase } from '@/hooks/session/run-consensus-phase'
import { runParticipantStream } from '@/providers/run-stream'
import { getEnabledToolNamesForSeat } from '@/providers/tools/enabled'
import { buildToolsForEntry } from '@/providers/tools'
import {
  getUserPrompts,
  resolveCouncilParticipantDefault,
} from '@/storage/prompts'
import { buildSeatHistory } from '@/utils/session/build-seat-history'
import { fanOutSeats, seedPerSeatStreams } from '@/utils/session/fan-out'
import { modelSeesImages } from '@/utils/session/vision'
import { buildParticipantEvent } from '@/utils/session/participant-event'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { generateTitleForFirstTurn } from '@/utils/session/title-gen'
import {
  registerCouncilStream,
  releaseCouncilStream,
} from '@/utils/session/active-streams'
import { getModel } from '@/models/registry'
import { assertNever } from '@/utils/assert-never'
import { uuid } from '@/utils/uuid'
import { addTokens, summarizeEvents } from '@/utils/token-totals'
import type { Council, SeatConfig, Turn, TurnEvent } from '@/types/council'
import type {
  JudgingTurn,
  MediatingTurn,
  SeatRetryState,
  SynthRetryState,
  PerSeatStream,
  StreamingTurn,
  VotingTurn,
} from '@/types/session'

/**
 * Orchestrator for a council session with N seats running in parallel.
 *
 * Dexie owns canonical state; this hook holds a local mirror plus the
 * in-flight `streamingTurn` (the user message + per-seat partial outputs).
 * `runTurn` fans out one `runParticipantStream` per active seat, awaits
 * all via `Promise.allSettled`, then persists a single turn (`appendTurn`)
 * containing one event per seat that produced text.
 *
 * The seat roster is edited outside this hook (the council-settings modal
 * writes straight to storage; `configRefreshKey` re-syncs the live session).
 * The hook's own mutation surface is just `updateSeatConfig`. Past
 * `TurnEvent`s each carry their own `modelId`, so history always renders
 * with the model that produced it — roster changes only shape future turns.
 */

export interface UseCouncilSessionOptions {
  /** Called after a turn is successfully persisted (sidebar uses this). */
  onTurnAppended?: () => void
  /** Called when the fire-and-forget LLM title generator starts
   *  for the given council. App.tsx tracks the council id in a Set so
   *  the sidebar can render a spinner next to the title — signals that
   *  the truncated server-side title is provisional and a better one
   *  is on its way. */
  onTitleGenerationStarted?: (councilId: string) => void
  /** Counterpart to `onTitleGenerationStarted` — called on success,
   *  error, *and* "no model reachable" so the spinner always clears.
   *  `newTitle` is set on success; lets the caller update its sidebar
   *  list optimistically in the *same* render that clears the spinner
   *  (avoids the flicker that would otherwise sit between the orchestrator's
   *  `refreshList` and the spinner removal). */
  onTitleGenerationFinished?: (
    councilId: string,
    newTitle?: string,
  ) => void
  /** Bumped by the app after the council-settings modal saves config for
   *  this (open) council. On change, the session re-reads seats / judge /
   *  mediator config from storage so upcoming turns use the new values —
   *  the modal writes straight to storage, bypassing this hook's own
   *  `updateSeatConfig`. Turns / in-flight streaming state are left intact. */
  configRefreshKey?: number
}

export interface UseCouncilSession {
  council: Council | null
  isLoading: boolean
  loadError: string | null

  // Roster — seats are fixed at creation; only per-seat config is editable.
  /** Merge a partial config into the seat's existing config and persist. */
  updateSeatConfig: (seatId: string, partial: Partial<SeatConfig>) => Promise<void>

  // Composer
  sendMessage: (
    content: string,
    images?: string[],
    opts?: {
      /** Provider tools every seat must skip this turn (the composer's
       *  per-message mute switches). */
      mutedTools?: string[]
      /** Per-turn extended-thinking override for every reasoning-capable
       *  role — seats, and the Judge / Mediator synthesis phases too
       *  ("think hard about this one"). */
      reasoningEffort?: NonNullable<SeatConfig['reasoningEffort']>
    },
  ) => Promise<void>
  isStreaming: boolean
  stop: () => void

  // Trial retry
  /** Re-run only the voters that errored in a previously-persisted Trial
   *  turn. Successful votes stay as-is. */
  retryFailedVotes: (turnId: string) => Promise<void>

  // Per-seat answer retry
  /** Re-run one errored Participant answer in a persisted turn, replacing
   *  its event in place (`replaceEvent`). Offered by the UI on Parallel
   *  councils' latest turn — no downstream phase consumed the answers
   *  there, so a late answer slots in cleanly. */
  retrySeatAnswer: (turnId: string, seatId: string) => Promise<void>

  // Synthesis retry (latest turn only — see chat-thread.tsx)
  /** Re-run an errored Judge verdict from the turn's persisted answers +
   *  votes, replacing its event in place. */
  retryJudge: (turnId: string) => Promise<void>
  /** Re-run a Consensus turn's *final* errored Mediator round from the
   *  persisted round inputs, replacing its event in place. Error recovery
   *  only — never resumes the debate loop. */
  retryMediatorRound: (turnId: string) => Promise<void>

  // Render data
  streamingTurn: StreamingTurn | null
  /** Present while the Trial voting phase of a turn is in flight. Cleared
   *  once the turn (with answer + vote events) is persisted. */
  votingTurn: VotingTurn | null
  /** Present while the Consensus debate is in flight —
   *  Mediator rounds + per-round Participant re-answers. Cleared once the
   *  turn is persisted. */
  mediatingTurn: MediatingTurn | null
  /** Present while the Trial Judge synthesis is streaming. Same lifecycle:
   *  cleared once the turn (with the Judge event) is persisted. */
  judgingTurn: JudgingTurn | null
  /** Present while a per-seat answer retry is in flight — the thread
   *  overlays its streaming output on the matching pane. */
  seatRetry: SeatRetryState | null
  /** Present while a synthesis retry (Judge / final Mediator round) is in
   *  flight — the thread overlays it on the matching block. */
  synthRetry: SynthRetryState | null
}

export function useCouncilSession(
  councilId: string,
  options: UseCouncilSessionOptions = {},
): UseCouncilSession {
  const {
    onTurnAppended,
    onTitleGenerationStarted,
    onTitleGenerationFinished,
    configRefreshKey,
  } = options
  const [council, setCouncil] = useState<Council | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [streamingTurn, setStreamingTurn] = useState<StreamingTurn | null>(
    null,
  )
  const [votingTurn, setVotingTurn] = useState<VotingTurn | null>(null)
  const [mediatingTurn, setMediatingTurn] = useState<MediatingTurn | null>(
    null,
  )
  const [judgingTurn, setJudgingTurn] = useState<JudgingTurn | null>(null)
  const [seatRetry, setSeatRetry] = useState<SeatRetryState | null>(null)
  const [synthRetry, setSynthRetry] = useState<SynthRetryState | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // The one truth for "some phase is in flight" — the forward pipeline's
  // four phase states plus the two retry overlays. Everything that must
  // not run concurrently (a new turn, any retry) gates on this single
  // value; hand-rolling subsets per call site is how a phase gets
  // forgotten in one of them.
  const busy =
    streamingTurn !== null ||
    votingTurn !== null ||
    mediatingTurn !== null ||
    judgingTurn !== null ||
    seatRetry !== null ||
    synthRetry !== null

  // Seat CRUD lives in a dedicated hook — its state machine is
  // orthogonal to the per-phase orchestration below, so keeping it
  // out of this file keeps the orchestrator focused on the
  // turn-running flow.
  const { updateSeatConfig } = useSeatCRUD({ council, setCouncil })

  useEffect(() => {
    let cancelled = false
    // Reset the load state for the new councilId, then fetch it. This is an
    // external-store (IndexedDB) load effect; the setState is the reset that
    // must precede the async read, not a render-driving cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const c = await getCouncil(councilId)
        if (cancelled) return
        if (!c) {
          setLoadError('Council not found')
          return
        }
        setCouncil(c)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'load failed')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [councilId])

  // Soft config refresh: when the app bumps `configRefreshKey` (the
  // council-settings modal saved this council's per-participant config to
  // storage), re-read just the config-bearing fields so upcoming turns pick
  // up the change — without the loading flicker or clobbering the in-flight
  // turn / streaming state. Skips the initial render (the load effect above
  // already seeded the council).
  const configRefreshSeenRef = useRef(false)
  useEffect(() => {
    if (!configRefreshSeenRef.current) {
      configRefreshSeenRef.current = true
      return
    }
    let cancelled = false
    // Soft refresh: a failed re-read just keeps the current config in
    // place (the load effect above owns hard failures).
    void (async () => {
      const fresh = await getCouncil(councilId)
      if (cancelled || !fresh) return
      setCouncil((prev) =>
        prev
          ? {
              ...prev,
              seats: fresh.seats,
              judge: fresh.judge,
              mediator: fresh.mediator,
              deliberation: fresh.deliberation,
            }
          : fresh,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [configRefreshKey, councilId])

  const runTurn = useCallback(
    async (
      priorTurns: Turn[],
      userMsg: string,
      opts?: {
        userImages?: string[]
        /** Provider tools every seat skips this turn — the composer's
         *  per-message run-options mutes. */
        mutedTools?: string[]
        /** Per-turn thinking override for every reasoning-capable role. */
        reasoningEffort?: NonNullable<SeatConfig['reasoningEffort']>
      },
    ) => {
      if (!council) return
      if (busy) return

      const userImages = opts?.userImages
      const hasImages = !!userImages && userImages.length > 0
      const mutedTools = new Set(opts?.mutedTools ?? [])
      const reasoningOverride = opts?.reasoningEffort

      // When the turn carries images, non-vision seats are filtered
      // out — they'd just receive a text-only degraded prompt, which is
      // surprising. The chat thread renders a small ghosted placeholder for
      // the skipped seats so the user sees what happened.
      const baseActiveSeats = council.seats
      const activeSeats = hasImages
        ? baseActiveSeats.filter((s) => modelSeesImages(s.modelId, userImages))
        : baseActiveSeats
      if (activeSeats.length === 0) return

      const turnId = uuid()

      setStreamingTurn({
        id: turnId,
        userMsg,
        perSeat: seedPerSeatStreams(activeSeats),
        ...(hasImages ? { userImages } : {}),
      })

      const controller = new AbortController()
      abortRef.current = controller
      registerCouncilStream(council.id, controller)
      // finally-pairs with the registration above: a run that throws must
      // still clear its phase state (or `busy` wedges the composer until
      // reload) and hand its controller back to the registry.
      try {
        const updatePerSeat = (
          seatId: string,
          patch: Partial<PerSeatStream>,
        ) => {
          setStreamingTurn((cur) => {
            if (!cur || cur.id !== turnId) return cur
            const existing = cur.perSeat[seatId]
            if (!existing) return cur
            return {
              ...cur,
              perSeat: { ...cur.perSeat, [seatId]: { ...existing, ...patch } },
            }
          })
        }

        // Resolve the user's default prompts once per turn — the same value
        // applies to every seat that doesn't carry a per-seat override.
        const userPrompts = getUserPrompts()
        // The Participant answer-round default resolves through the participant
        // cascade: this council's `deliberation.participant` override ?? the
        // global per-structure default. Per-seat `systemPrompt` overrides still
        // win at each call site (applied first), and an unset baseline falls
        // through to the model's registry default there.
        const participantDefault = resolveCouncilParticipantDefault(
          council.deliberation,
          council.socialStructure,
          userPrompts,
        )

        const outcomes = await fanOutSeats(activeSeats, async (seat) => {
          const history = buildSeatHistory(
            priorTurns,
            seat,
            userMsg,
            userImages,
          )
          const enabledToolNames = getEnabledToolNamesForSeat(seat).filter(
            (name) => !mutedTools.has(name),
          )
          const tools =
            enabledToolNames.length > 0
              ? buildToolsForEntry(getModel(seat.modelId), enabledToolNames)
              : undefined
          const result = await runParticipantStream({
            modelId: seat.modelId,
            history,
            abortSignal: controller.signal,
            onChunk: (acc) => updatePerSeat(seat.id, { output: acc }),
            onReasoning: (acc) => updatePerSeat(seat.id, { reasoning: acc }),
            systemPrompt: seat.config.systemPrompt ?? participantDefault,
            ...samplingArgs(
              seat.config,
              resolveReasoningEffort(seat, reasoningOverride),
            ),
            ...(tools ? { tools } : {}),
          })
          updatePerSeat(seat.id, {
            output: result.text,
            status: result.error ? 'error' : 'done',
            error: result.error ?? null,
          })
          return result
        })

        // Build events array — one per seat that produced output or errored.
        // A pure abort (user clicked Stop before any text arrived) leaves no
        // record; everything else lands so the user can see what each seat did.
        const events: TurnEvent[] = []
        for (const { seat, result } of outcomes) {
          if (result.text.length === 0 && !result.error) continue
          events.push(buildParticipantEvent({ id: uuid(), seat, result }))
        }

        // Durability checkpoint: persist the answers *now*, so
        // a tab discard / reload / crash during the (long) synthesis phases
        // keeps them. DB-only and fire-and-forget — in-memory state stays
        // owned by the final persist block below; only a fresh page load
        // ever reads this row. The final `appendTurn` upserts the same turn
        // id with the complete event set (see `appendTurn`'s upsert path).
        if (events.length > 0) {
          const checkpoint: Turn = {
            id: turnId,
            idx: priorTurns.length,
            userMsg,
            events: [...events],
            tokenTotal: summarizeEvents(events),
            ...(hasImages ? { userImages } : {}),
          }
          void appendTurn(council.id, checkpoint).catch((err: unknown) => {
            // A failed checkpoint must not kill the run — the final persist
            // below still gets its chance.
            console.warn('turn checkpoint skipped', err)
          })
        }

        // Structure-specific deliberation after the answer fan-out. Each
        // phase module owns its own machine (Trial: peer-vote + Judge —
        // voting skipped for <2 responders, Judge skipped with no answer /
        // no configured Judge; Consensus: the Mediator debate) and returns
        // the new events plus the per-turn anonymization map.
        let votingLabels: Record<string, string> | undefined
        if (!controller.signal.aborted) {
          // Exhaustive on purpose: a new social structure must decide its
          // deliberation phase here at compile time, not silently run none.
          switch (council.socialStructure) {
            case 'trial': {
              const trial = await runTrialPhase({
                turnId,
                judge: council.judge,
                seats: council.seats,
                activeSeats,
                answerEvents: events,
                userMsg,
                ...(hasImages ? { userImages } : {}),
                priorTurns,
                deliberation: council.deliberation,
                ...(reasoningOverride
                  ? { reasoningEffortOverride: reasoningOverride }
                  : {}),
                abortSignal: controller.signal,
                setVotingTurn,
                setJudgingTurn,
              })
              events.push(...trial.events)
              votingLabels = trial.labels
              break
            }
            case 'consensus': {
              // Participant-driven debate. The Mediator referees up to
              // `mediatorMaxRounds` rounds; between rounds every Participant
              // re-answers in light of the Mediator's anonymized divergence
              // framing. Needs ≥1 usable answer — an empty turn has nothing
              // to debate. The phase module owns the loop and its in-flight
              // state, returning the new events + the per-turn anonymization
              // map (persisted so the UI can de-anonymize the digest).
              if (!council.mediator) break
              const respondingSeats = activeSeats.filter((s) =>
                events.some(
                  (e) =>
                    e.roleType === 'participant' &&
                    e.seatId === s.id &&
                    !e.error &&
                    e.output.length > 0,
                ),
              )
              if (respondingSeats.length === 0) break
              const roundOneEvents = events.filter(
                (e) => e.roleType === 'participant',
              )
              const consensus = await runConsensusPhase({
                turnId,
                mediator: council.mediator,
                respondingSeats,
                roundOneEvents,
                userMsg,
                ...(hasImages ? { userImages } : {}),
                priorTurns,
                deliberation: council.deliberation,
                participantDefault,
                ...(reasoningOverride
                  ? { reasoningEffortOverride: reasoningOverride }
                  : {}),
                abortSignal: controller.signal,
                setMediatingTurn,
              })
              events.push(...consensus.events)
              votingLabels = consensus.labels
              break
            }
            case 'roundtable':
            case 'custom':
              // Parallel-shaped: the answer fan-out IS the result.
              break
            default:
              assertNever(council.socialStructure)
          }
        }

        if (events.length > 0) {
          // Precompute the token total so the UI's running total ticks over
          // the moment the turn lands locally; `appendTurn` recomputes the
          // same value from the persisted events as the source of truth.
          const tokenTotal = summarizeEvents(events)
          const turn: Turn = {
            id: turnId,
            idx: priorTurns.length,
            userMsg,
            events,
            tokenTotal,
            ...(votingLabels ? { votingLabels } : {}),
            ...(hasImages ? { userImages } : {}),
          }
          try {
            await appendTurn(council.id, turn)
            // Guard on id (like the titler callback below): the user can
            // switch councils while a run finishes, and this patch must not
            // graft the turn onto whichever council is in state by then.
            setCouncil((c) =>
              c && c.id === council.id
                ? {
                    ...c,
                    turns: [...priorTurns, turn],
                    tokenTotal: addTokens(c.tokenTotal, tokenTotal),
                  }
                : c,
            )
            onTurnAppended?.()
            // Fire-and-forget LLM title generation on the very
            // first turn. `appendTurn` already auto-titled with the
            // truncated user message (fallback); we replace that
            // with a *concise, distinguishable, memorable* LLM-generated
            // title when the priority chain has a reachable model. No
            // await — the turn UI shouldn't wait on titler latency / cost.
            if (priorTurns.length === 0) {
              void generateTitleForFirstTurn({
                councilId: council.id,
                userMsg,
                events,
                onStart: (id) => onTitleGenerationStarted?.(id),
                onFinish: (id, newTitle) => {
                  if (newTitle) {
                    setCouncil((c) =>
                      c && c.id === id ? { ...c, title: newTitle } : c,
                    )
                    onTurnAppended?.()
                  }
                  onTitleGenerationFinished?.(id, newTitle)
                },
              })
            }
          } catch (err) {
            console.error('appendTurn failed', err)
          }
        }
      } finally {
        setStreamingTurn(null)
        setVotingTurn(null)
        setMediatingTurn(null)
        setJudgingTurn(null)
        abortRef.current = null
        releaseCouncilStream(council.id, controller)
      }
    },
    [
      council,
      busy,
      onTurnAppended,
      onTitleGenerationStarted,
      onTitleGenerationFinished,
    ],
  )

  const sendMessage = useCallback(
    (
      content: string,
      images?: string[],
      opts?: {
        mutedTools?: string[]
        reasoningEffort?: NonNullable<SeatConfig['reasoningEffort']>
      },
    ) => {
      if (!council) return Promise.resolve()
      return runTurn(council.turns, content, {
        ...(images && images.length > 0 ? { userImages: images } : {}),
        ...(opts?.mutedTools && opts.mutedTools.length > 0
          ? { mutedTools: opts.mutedTools }
          : {}),
        ...(opts?.reasoningEffort
          ? { reasoningEffort: opts.reasoningEffort }
          : {}),
      })
    },
    [council, runTurn],
  )


  // The retry-hook family (votes / seat answer / synthesis): each shares
  // the parent's abortRef (so a global `stop()` interrupts it), reports
  // through its own overlay state, and gates on the same `busy` — a
  // retry's own in-flight overlay is part of `busy`, so re-entry is
  // covered by the same check.
  const { retryFailedVotes } = useRetryVotes({
    council,
    setCouncil,
    abortRef,
    isBusy: busy,
    setVotingTurn,
  })

  const { retrySeatAnswer } = useRetrySeat({
    council,
    setCouncil,
    abortRef,
    isBusy: busy,
    setSeatRetry,
  })

  const { retryJudge, retryMediatorRound } = useRetrySynthesis({
    council,
    setCouncil,
    abortRef,
    isBusy: busy,
    setSynthRetry,
  })

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    council,
    isLoading,
    loadError,
    updateSeatConfig,
    sendMessage,
    isStreaming: busy,
    stop,
    retryFailedVotes,
    retrySeatAnswer,
    retryJudge,
    retryMediatorRound,
    streamingTurn,
    votingTurn,
    mediatingTurn,
    judgingTurn,
    seatRetry,
    synthRetry,
  }
}

// Pure helpers extracted to `src/utils/session/*`:
//   - buildSeatHistory          (build-seat-history.ts)
//   - clampMediatorRounds       (clamps.ts)
//   - clampMinCommentLength     (clamps.ts)
//   - formatMediatorPriorRounds (format-mediator-prior-rounds.ts)
//   - generateTitleForFirstTurn (title-gen.ts)
