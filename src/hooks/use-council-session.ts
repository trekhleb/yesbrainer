import { useCallback, useEffect, useRef, useState } from 'react'
import {
  appendTurn,
  clearRunState,
  deleteTurn,
  getCouncil,
  getTurn,
  patchRunState,
} from '@/storage/councils'
import {
  clearRunUnfinished,
  markRunUnfinished,
} from '@/storage/unfinished-runs'
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
  abortCouncilStreams,
  registerCouncilStream,
  releaseCouncilStream,
} from '@/utils/session/active-streams'
import { useStreamingTurnIds } from '@/hooks/use-streaming-council-ids'
import {
  classifyInterruption,
  watchVisibility,
  type InterruptionCause,
} from '@/utils/session/interruption'
import { readTurnProgress } from '@/utils/session/remaining-work'
import { isRunOwned, withRunLock } from '@/utils/session/run-lock'
import { getModel } from '@/models/registry'
import { assertNever } from '@/utils/assert-never'
import { uuid } from '@/utils/uuid'
import { summarizeEvents, summarizeTurns } from '@/utils/token-totals'
import type {
  Council,
  Seat,
  SeatConfig,
  Turn,
  TurnEvent,
  TurnRunState,
} from '@/types/council'
import type {
  JudgingTurn,
  MediatingTurn,
  SeatRetryState,
  SynthRetryState,
  PerSeatStream,
  PerVoterStream,
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
   *  only — never resumes the debate loop; that's `resumeTurn`. */
  retryMediatorRound: (turnId: string) => Promise<void>

  // Interrupted-run recovery
  /** Pick an interrupted turn's run back up from its persisted progress,
   *  re-issuing only the work that never landed. Fires automatically on the
   *  latest turn (see `MAX_AUTO_RESUME_ATTEMPTS`); this is the manual entry
   *  point behind the paused card's Resume button, which is never capped. */
  resumeTurn: (turnId: string, opts?: { manual?: boolean }) => Promise<void>
  /** A run for this council is in flight but not owned by this view — it
   *  was started before the user navigated away and back (runs outlive
   *  their view). Surfaces as "working" on the paused card instead of a
   *  Resume button that couldn't do anything. */
  hasBackgroundRun: boolean

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
  /**
   * A run for this council is in flight *somewhere*, which is not the same
   * as "in flight here".
   *
   * Runs deliberately outlive their view (`active-streams.ts`), and the
   * app keys `CouncilView` by council id — so navigating away and back
   * gives this council a **fresh hook instance with empty phase state**
   * while the previous mount's run carries on. Without this, that instance
   * believes nothing is happening: it renders the stale paused card and
   * offers a Resume button that can only bail out against the still-held
   * turn lock. (Which is why a page reload "fixed" it — the reload killed
   * the background run.)
   *
   * Deliberately *not* folded into `busy`: the registry also counts the
   * fire-and-forget titler, and blocking the composer until a title lands
   * would be a regression. It gates exactly the things that would
   * otherwise start a duplicate run.
   */
  const streamingTurnIds = useStreamingTurnIds()
  const latestTurnId = council?.turns.at(-1)?.id
  const hasBackgroundRun =
    latestTurnId !== undefined && streamingTurnIds.has(latestTurnId) && !busy

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
        setCouncil(await reconcileUnfinishedTurn(c))
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

  /**
   * Run a turn to completion — the single pipeline behind both a fresh send
   * and a resume of an interrupted one.
   *
   * There is deliberately no separate resume implementation. A resume is the
   * same run with `existingEvents` non-empty: `readTurnProgress` turns those
   * into "what's already done", each phase replays what it finds and issues
   * only what it doesn't, and with an empty set every step is pending, which
   * is exactly the original behaviour. A second code path here would be a
   * path that gets exercised only when something has already gone wrong.
   */
  const executeTurn = useCallback(
    async (params: {
      council: Council
      priorTurns: Turn[]
      turnId: string
      idx: number
      userMsg: string
      userImages?: string[]
      activeSeats: Seat[]
      mutedTools: Set<string>
      reasoningOverride?: NonNullable<SeatConfig['reasoningEffort']>
      /** Events an interrupted earlier attempt persisted; empty on a fresh
       *  send. */
      existingEvents: TurnEvent[]
      existingLabels?: Record<string, string>
      /** Auto-resume attempts already spent on this turn. */
      resumeAttempts: number
      /** This is a resume of a turn the user can already see, not a fresh
       *  send. The two are otherwise indistinguishable here — an
       *  interrupted turn cut off before its first answer arrives with
       *  empty `existingEvents`, exactly like a new one — and they need
       *  opposite treatment when a run ends with nothing to show. */
      isResume: boolean
    }): Promise<void> => {
      const {
        council,
        priorTurns,
        turnId,
        idx,
        userMsg,
        userImages,
        activeSeats,
        mutedTools,
        reasoningOverride,
        existingEvents,
        existingLabels,
        resumeAttempts,
        isResume,
      } = params
      const hasImages = !!userImages && userImages.length > 0
      const progress = readTurnProgress({
        activeSeats,
        events: existingEvents,
      })

      // Seats that already answered render settled from the first frame, so
      // a resume picks up visually where the interrupted attempt stopped
      // instead of replaying the whole turn as if nothing had happened.
      setStreamingTurn({
        id: turnId,
        userMsg,
        perSeat: {
          ...seedSettledSeatStreams(activeSeats, progress.answerEvents),
          ...seedPerSeatStreams(progress.pendingAnswerSeats),
        },
        ...(hasImages ? { userImages } : {}),
      })
      // Votes an interrupted attempt already landed. Seeded for the same
      // reason the answers above are: while a resume runs, the streaming
      // view owns this turn's rendering, so anything not seeded here would
      // read as lost work until the turn settles again.
      const settledVotes = seedSettledVoterStreams(existingEvents)
      if (Object.keys(settledVotes).length > 0) {
        setVotingTurn({
          id: turnId,
          perVoter: settledVotes,
          votingLabels: existingLabels ?? {},
        })
      }

      const controller = new AbortController()
      abortRef.current = controller
      registerCouncilStream(council.id, controller, turnId)
      const watch = watchVisibility()

      // Written before the first provider call so the question itself
      // survives a kill during the very first fan-out — the turn row (and,
      // on a first turn, the council's title) exists from the outset, and
      // the composer's draft can be cleared on send as it always was.
      let runState: TurnRunState = {
        status: 'running',
        phase: 'answers',
        startedAt: Date.now(),
        heartbeatAt: Date.now(),
        activeSeatIds: activeSeats.map((s) => s.id),
        ...(mutedTools.size > 0 ? { mutedTools: [...mutedTools] } : {}),
        ...(reasoningOverride ? { reasoningEffort: reasoningOverride } : {}),
        ...(resumeAttempts > 0 ? { resumeAttempts } : {}),
      }
      const persist = async (
        events: readonly TurnEvent[],
        labels: Record<string, string> | undefined,
        state: TurnRunState | undefined,
      ) => {
        await appendTurn(council.id, {
          id: turnId,
          idx,
          userMsg,
          events: [...events],
          tokenTotal: summarizeEvents([...events]),
          ...(labels ? { votingLabels: labels } : {}),
          ...(hasImages ? { userImages } : {}),
          ...(state ? { runState: state } : {}),
        })
      }
      /**
       * Stamp the phase that is *starting*, for the paused card's copy.
       *
       * Updates the in-memory run state as well as the row: every
       * checkpoint writes `runState` wholesale, so a row-only patch would
       * be overwritten by the very write that records the interruption —
       * the one case this marker exists for.
       */
      const markPhase = (patch: Partial<TurnRunState>) => {
        runState = { ...runState, ...patch }
        void patchRunState(council.id, turnId, patch)
      }
      /** Best-effort mid-run save. A failed checkpoint must never kill the
       *  run — the phase keeps going and the next checkpoint (or the final
       *  persist) gets its chance. */
      const checkpoint = async (
        events: readonly TurnEvent[],
        patch: Partial<TurnRunState>,
        labels?: Record<string, string>,
      ) => {
        runState = { ...runState, ...patch, heartbeatAt: Date.now() }
        try {
          await persist(events, labels ?? existingLabels, runState)
        } catch (err) {
          console.warn('turn checkpoint skipped', err)
        }
      }

      await checkpoint(existingEvents, {})
      markRunUnfinished(council.id, turnId)
      const heartbeat = window.setInterval(() => {
        void patchRunState(council.id, turnId, { heartbeatAt: Date.now() })
      }, HEARTBEAT_INTERVAL_MS)

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

        // Only the seats still owing an answer run — on a fresh send that's
        // all of them, on a resume only the ones the interruption cut off.
        // A run already stopped issues nothing: the checkpoint above is an
        // awaited write, so Stop can genuinely land before the fan-out, and
        // firing N provider calls for a turn the user just cancelled would
        // spend their tokens on output nobody will read.
        const outcomes = await fanOutSeats(
          controller.signal.aborted ? [] : progress.pendingAnswerSeats,
          async (seat) => {
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
            const startedAt = Date.now()
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
            // Classified here, at the one place that knows when this call
            // started, so an interrupted seat never flashes red on its way
            // to being re-run: it stays in the streaming pose it was
            // already in.
            const cause = classifyInterruption({
              error: result.error,
              startedAt,
              watch,
            })
            updatePerSeat(seat.id, {
              output: result.text,
              status: cause ? 'streaming' : result.error ? 'error' : 'done',
              error: cause ? null : (result.error ?? null),
            })
            return { result, cause }
          },
        )

        // Build events array — one per seat that produced output or errored.
        // A pure abort (user clicked Stop before any text arrived) leaves no
        // record; everything else lands so the user can see what each seat
        // did. An *interrupted* seat also leaves no record, and that empty
        // slot is precisely what tells a later resume to re-issue it.
        const events: TurnEvent[] = [...existingEvents]
        let interrupted: InterruptionCause | null = null
        for (const { seat, result: outcome } of outcomes) {
          if (outcome.cause) {
            interrupted ??= outcome.cause
            continue
          }
          const { result } = outcome
          if (result.text.length === 0 && !result.error) continue
          events.push(buildParticipantEvent({ id: uuid(), seat, result }))
        }

        // Durability checkpoint: persist the answers *now*, so a suspended
        // phone / tab discard / crash during the (long) synthesis phases
        // keeps them. Awaited rather than fire-and-forget, because the run
        // state it carries is what a resume reads to know this stage is done.
        if (events.length > existingEvents.length) {
          await checkpoint(events, { phase: 'answers' })
        }

        // Recomputed now that the answers are in: the set of seats that can
        // vote or debate depends on who actually responded, which the
        // pre-fan-out snapshot couldn't know.
        const afterAnswers = readTurnProgress({ activeSeats, events })

        // Structure-specific deliberation after the answer fan-out. Each
        // phase module owns its own machine (Trial: peer-vote + Judge —
        // voting skipped for <2 responders, Judge skipped with no answer /
        // no configured Judge; Consensus: the Mediator debate) and returns
        // the new events plus the per-turn anonymization map. Skipped when
        // the answer round was interrupted: deliberating over a field that
        // is missing voices would bake the interruption into the result.
        let votingLabels: Record<string, string> | undefined = existingLabels
        if (!controller.signal.aborted && !interrupted) {
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
                progress: afterAnswers,
                ...(existingLabels ? { existingLabels } : {}),
                watch,
                checkpoint: (phaseEvents, at) =>
                  checkpoint(
                    [...events, ...phaseEvents],
                    {},
                    at.labels ?? votingLabels,
                  ),
                markPhase,
              })
              events.push(...trial.events)
              votingLabels = trial.labels ?? votingLabels
              interrupted ??= trial.interrupted
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
              const respondingSeats = afterAnswers.respondingSeats
              if (respondingSeats.length === 0) break
              const roundOneEvents = afterAnswers.answerEvents
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
                progress: afterAnswers.consensus,
                ...(existingLabels ? { existingLabels } : {}),
                watch,
                checkpoint: (phaseEvents, at) =>
                  checkpoint([...events, ...phaseEvents], {}, at.labels),
                markPhase,
              })
              events.push(...consensus.events)
              votingLabels = consensus.labels
              interrupted ??= consensus.interrupted
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

        // An interruption leaves the turn unfinished: the run state stays on
        // the row, so the thread renders a paused card carrying everything
        // that *did* land rather than a broken one, and a resume knows where
        // to pick up. The mirror is updated too — the streaming view is
        // about to clear, and the persisted turn has to be there to take
        // over rendering or the work would appear to vanish.
        if (interrupted && !controller.signal.aborted) {
          await checkpoint(
            events,
            { status: 'interrupted', cause: interrupted },
            votingLabels,
          )
          const turn: Turn = {
            id: turnId,
            idx,
            userMsg,
            events,
            tokenTotal: summarizeEvents(events),
            ...(votingLabels ? { votingLabels } : {}),
            ...(hasImages ? { userImages } : {}),
            // `runState` after the checkpoint, not a parallel copy of it:
            // the checkpoint stamps its own `heartbeatAt`, and a second
            // object built here would put a different one in the mirror
            // than the one on disk.
            runState,
          }
          setCouncil((c) => {
            if (!c || c.id !== council.id) return c
            const turns = upsertTurn(c.turns, turn)
            return { ...c, turns, tokenTotal: summarizeTurns(turns) }
          })
          onTurnAppended?.()
          // Suppresses the immediate auto-retry — see the auto-resume
          // effect. Cleared the moment the page goes away and comes back.
          selfInterruptedRef.current = true
          return
        }

        if (events.length === 0) {
          clearRunUnfinished(council.id)
          if (isResume) {
            // Stopping a resume must never destroy the turn. A phone locked
            // during the opening fan-out leaves an interrupted turn with no
            // events *and the user's question* — the whole reason that row
            // is kept — and it is already on screen. Deleting it here would
            // take the question with it and strand a ghost card over a row
            // that no longer exists. Stop just means stop: retire the run,
            // keep the turn.
            await clearRunState(council.id, turnId)
            setCouncil((c) =>
              c && c.id === council.id
                ? {
                    ...c,
                    turns: c.turns.map((t) =>
                      t.id === turnId ? retireTurn(t) : t,
                    ),
                  }
                : c,
            )
            return
          }
          // A *fresh* send stopped before it produced anything leaves
          // nothing worth keeping — the turn was never in the mirror and
          // the user still has what they typed. Drop the placeholder row
          // rather than stranding an empty turn in the thread.
          await deleteTurn(council.id, turnId)
          return
        }

        {
          // Precompute the token total so the UI's running total ticks over
          // the moment the turn lands locally; `appendTurn` recomputes the
          // same value from the persisted events as the source of truth.
          const tokenTotal = summarizeEvents(events)
          const turn: Turn = {
            id: turnId,
            idx,
            userMsg,
            events,
            tokenTotal,
            ...(votingLabels ? { votingLabels } : {}),
            ...(hasImages ? { userImages } : {}),
          }
          try {
            // No `runState` on this write, which is what marks the turn
            // finished — `appendTurn` treats its absence as authoritative.
            await appendTurn(council.id, turn)
            clearRunUnfinished(council.id)
            // Guard on id (like the titler callback below): the user can
            // switch councils while a run finishes, and this patch must not
            // graft the turn onto whichever council is in state by then.
            setCouncil((c) => {
              if (!c || c.id !== council.id) return c
              const turns = upsertTurn(c.turns, turn)
              // Re-summed, not accumulated: a turn reaches this point having
              // been persisted several times (checkpoints, and again on a
              // resume), and whether the mirror already counted those
              // depends on whether the page reloaded in between. A delta
              // would double-count in one of those cases and undercount in
              // the other.
              return { ...c, turns, tokenTotal: summarizeTurns(turns) }
            })
            onTurnAppended?.()
            // Fire-and-forget LLM title generation on the very
            // first turn. `appendTurn` already auto-titled with the
            // truncated user message (fallback); we replace that
            // with a *concise, distinguishable, memorable* LLM-generated
            // title when the priority chain has a reachable model. No
            // await — the turn UI shouldn't wait on titler latency / cost.
            if (idx === 0) {
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
        window.clearInterval(heartbeat)
        watch.dispose()
        setStreamingTurn(null)
        setVotingTurn(null)
        setMediatingTurn(null)
        setJudgingTurn(null)
        abortRef.current = null
        releaseCouncilStream(council.id, controller, turnId)
      }
    },
    [onTurnAppended, onTitleGenerationStarted, onTitleGenerationFinished],
  )

  // Synchronous re-entry guard for `resumeTurn`.
  //
  // `busy` can't do this job on its own: it only flips once `executeTurn`
  // reaches its first `setStreamingTurn`, and the auto-resume effect can
  // re-fire in the renders before that lands — two concurrent resumes of
  // one turn, billed twice. The Web Lock closes the *cross-tab* version of
  // the same hole but is itself async, so it leaves this window open. A ref
  // set before the first `await` is what actually closes it.
  const resumingRef = useRef<string | null>(null)

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
      // `resumingRef` as well as `busy`: an auto-resume claims the council
      // synchronously but only flips `busy` once its `setStreamingTurn`
      // commits, so a send in that window would start a second concurrent
      // run — the realistic version being "unlock the phone, immediately
      // tap Send", which is precisely when auto-resume fires.
      if (!council || busy || resumingRef.current !== null) return

      const userImages = opts?.userImages
      const hasImages = !!userImages && userImages.length > 0

      // When the turn carries images, non-vision seats are filtered
      // out — they'd just receive a text-only degraded prompt, which is
      // surprising. The chat thread renders a small ghosted placeholder for
      // the skipped seats so the user sees what happened.
      const activeSeats = hasImages
        ? council.seats.filter((s) => modelSeesImages(s.modelId, userImages))
        : council.seats
      if (activeSeats.length === 0) return

      // A new send retires any older unfinished turn. Resume is latest-turn
      // only — the same rule the retry affordances follow, and for the same
      // reason: this send's seat histories are about to consume the earlier
      // turn, so re-running part of it later would rewrite history the
      // council has already read.
      for (const stale of priorTurns) {
        if (!stale.runState) continue
        // …unless something is still driving it. Retiring a live run would
        // strip the run state out from under it mid-flight.
        if (streamingTurnIds.has(stale.id)) continue
        await clearRunState(council.id, stale.id)
        setCouncil((c) =>
          c && c.id === council.id
            ? {
                ...c,
                turns: c.turns.map((t) =>
                  t.id === stale.id ? retireTurn(t) : t,
                ),
              }
            : c,
        )
      }

      // Fresh runs take the lock as well, not just resumes. Ownership is
      // what `reconcileUnfinishedTurn` and `resumeTurn` both consult, so a
      // run with no lock is invisible to them: a second tab opening this
      // council would see `status: 'running'` with the lock free, conclude
      // the run was killed, mark it interrupted and auto-resume — re-buying
      // the seats this tab is still paying for, with both tabs' checkpoints
      // overwriting the same row. The lock is always free for a new turn id,
      // so this only ever adds the claim.
      const turnId = uuid()
      await withRunLock(turnId, () =>
        executeTurn({
          council,
          priorTurns,
          turnId,
          idx: priorTurns.length,
          userMsg,
          ...(hasImages ? { userImages } : {}),
          activeSeats,
          mutedTools: new Set(opts?.mutedTools ?? []),
          ...(opts?.reasoningEffort
            ? { reasoningOverride: opts.reasoningEffort }
            : {}),
          existingEvents: [],
          resumeAttempts: 0,
          isResume: false,
        }),
      )
    },
    [council, busy, streamingTurnIds, executeTurn],
  )

  /**
   * Pick an interrupted turn back up where it stopped.
   *
   * Everything it needs comes from the persisted turn: `runState` supplies
   * the roster and run options the original send used (the live council may
   * have been edited since, and a resume must reproduce the run the user
   * started), and the events supply what's already done.
   */
  const resumeTurn = useCallback(
    async (turnId: string, opts?: { manual?: boolean }) => {
      if (!council || busy || hasBackgroundRun) return
      if (resumingRef.current !== null) return
      const turn = council.turns.find((t) => t.id === turnId)
      const runState = turn?.runState
      if (!turn || !runState) return
      // Latest turn only, for the same reason resume is retired on a new
      // send — a later turn may already have consumed this one.
      if (council.turns.at(-1)?.id !== turnId) return

      resumingRef.current = turnId
      try {
        // One driver per turn across pages: a second tab open on this
        // council must not re-issue the same provider calls.
        if (await isRunOwned(turnId)) return

        // Re-read the row inside the lock. The mirror is advisory: a run
        // started before the user navigated away writes through *its*
        // mount's `setCouncil`, which is a no-op once that mount is gone —
        // so this instance can be holding a turn it believes is unfinished
        // while the row says it completed minutes ago. Resuming from that
        // stale copy would re-buy work and then overwrite the finished
        // events with the older set. One read makes every staleness
        // variant the same case.
        const settled = await withRunLock(turnId, async () => {
          const fresh = await getTurn(council.id, turnId)
          if (!fresh) return 'gone' as const
          if (!fresh.runState) return fresh
          const seatById = new Map(council.seats.map((s) => [s.id, s]))
          const activeSeats = fresh.runState.activeSeatIds
            .map((id) => seatById.get(id))
            .filter((s): s is Seat => s !== undefined)
          // Every seat the run used has since been unseated — there is
          // nothing left to resume.
          if (activeSeats.length === 0) return 'gone' as const

          await executeTurn({
            council,
            priorTurns: council.turns.filter((t) => t.idx < fresh.idx),
            turnId,
            idx: fresh.idx,
            userMsg: fresh.userMsg,
            ...(fresh.userImages ? { userImages: fresh.userImages } : {}),
            activeSeats,
            mutedTools: new Set(fresh.runState.mutedTools ?? []),
            ...(fresh.runState.reasoningEffort
              ? { reasoningOverride: fresh.runState.reasoningEffort }
              : {}),
            existingEvents: fresh.events,
            ...(fresh.votingLabels
              ? { existingLabels: fresh.votingLabels }
              : {}),
            // A user pressing Resume always gets an attempt; the cap only
            // governs the automatic retries they didn't ask for.
            resumeAttempts: opts?.manual
              ? 0
              : (fresh.runState.resumeAttempts ?? 0) + 1,
            isResume: true,
          })
          return 'ran' as const
        })

        // Another page holds the lock (`null`), or the row moved on while
        // this instance wasn't looking. Either way: don't run, and bring
        // the mirror back in line so the paused card stops lying.
        if (settled === 'ran' || settled === null) return
        if (settled === 'gone') {
          await clearRunState(council.id, turnId)
        }
        clearRunUnfinished(council.id)
        setCouncil((c) =>
          c && c.id === council.id
            ? {
                ...c,
                turns: c.turns.map((t) =>
                  t.id !== turnId
                    ? t
                    : settled === 'gone'
                      ? retireTurn(t)
                      : settled,
                ),
              }
            : c,
        )
      } finally {
        resumingRef.current = null
      }
    },
    [council, busy, hasBackgroundRun, executeTurn],
  )

  /**
   * Auto-resume: the turn the user is looking at picks itself back up.
   *
   * Fires on the two events that actually suggest it might now succeed —
   * **the page coming back to the foreground** (the unlock this whole
   * feature exists for) and **a council loading with an interrupted turn on
   * it** (the app was killed outright and has just restarted).
   *
   * Deliberately *not* fired by the interruption itself. A run that dies in
   * front of the user, on a page that never went away, died because the
   * network did — and re-issuing a second later just spends another
   * attempt, and the user's tokens, to watch it fail again. There the
   * paused card's Resume button is the honest interface, because the app
   * genuinely can't know when the connection is coming back.
   *
   * The attempt counter lives on the persisted turn, so it survives the
   * reloads this is recovering from; past the cap, only the button remains.
   */
  const selfInterruptedRef = useRef(false)
  // Held in a ref (assigned in its own effect, which commits before the
  // one below) so the auto-resume effect doesn't re-subscribe on every
  // render — `resumeTurn` changes identity whenever the council does.
  const resumeRef = useRef(resumeTurn)
  useEffect(() => {
    resumeRef.current = resumeTurn
  })
  const latest = council?.turns.at(-1)
  const pendingResumeId =
    latest?.runState?.status === 'interrupted' &&
    (latest.runState.resumeAttempts ?? 0) < MAX_AUTO_RESUME_ATTEMPTS
      ? latest.id
      : undefined
  useEffect(() => {
    // `hasBackgroundRun`: a previous mount's run is still driving this turn.
    // Firing here would only bounce off its lock and burn an attempt.
    if (!pendingResumeId || busy || hasBackgroundRun) return
    let cancelled = false
    const attempt = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      void resumeRef.current(pendingResumeId)
    }
    // Found on load, not produced here → the app restarted into it.
    if (!selfInterruptedRef.current) attempt()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      // The page went away and came back; whatever took the run down went
      // with it, so this stops counting as "just failed in front of us".
      selfInterruptedRef.current = false
      attempt()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pendingResumeId, busy, hasBackgroundRun])

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
    runStartingRef: resumingRef,
    isBusy: busy,
    setVotingTurn,
  })

  const { retrySeatAnswer } = useRetrySeat({
    council,
    setCouncil,
    abortRef,
    runStartingRef: resumingRef,
    isBusy: busy,
    setSeatRetry,
  })

  const { retryJudge, retryMediatorRound } = useRetrySynthesis({
    council,
    setCouncil,
    abortRef,
    runStartingRef: resumingRef,
    isBusy: busy,
    setSynthRetry,
  })

  const stop = useCallback(() => {
    // A run this view didn't start has no local controller to cancel — it
    // belongs to a previous mount. Stop still has to mean stop, so fall
    // back to the council-scoped registry, which is the only handle on it.
    if (abortRef.current) abortRef.current.abort()
    else if (council) abortCouncilStreams(council.id)
  }, [council])

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
    resumeTurn,
    hasBackgroundRun,
    streamingTurn,
    votingTurn,
    mediatingTurn,
    judgingTurn,
    seatRetry,
    synthRetry,
  }
}

/** How often a live run stamps its turn row. Informational only (see
 *  `TurnRunState.heartbeatAt`) — liveness is decided by run ownership. */
const HEARTBEAT_INTERVAL_MS = 5_000

/**
 * How many times an interrupted turn resumes itself before it stops and
 * waits for the user.
 *
 * The cap exists because the two situations are indistinguishable at the
 * moment of failure: a phone that came back online resumes and finishes,
 * while a phone unlocked in a tunnel would resume, fail, resume, fail —
 * spending real BYOK tokens on each attempt. Two tries covers the transient
 * case; past that, a Resume button is the honest interface, because by then
 * the app genuinely doesn't know when the network is coming back.
 */
const MAX_AUTO_RESUME_ATTEMPTS = 2

/**
 * Settle a council's unfinished turn on load.
 *
 * A run that was killed outright — the phone terminated the app, the tab
 * was discarded — never got to write `interrupted`; its row still says
 * `running`, because the code that would have said otherwise died with the
 * page. Without this, exactly the worst case (a hard kill) would be the one
 * the app failed to recover from.
 *
 * Ownership is what settles it, not the heartbeat: the lock a live run
 * holds is released by the browser when its page dies, so a free lock means
 * nobody is driving this turn, whatever the row claims. A *second tab*
 * legitimately running the turn holds the lock and is left alone.
 */
async function reconcileUnfinishedTurn(council: Council): Promise<Council> {
  const turn = council.turns.at(-1)
  if (turn?.runState?.status !== 'running') return council
  if (await isRunOwned(turn.id)) return council
  const runState: TurnRunState = { ...turn.runState, status: 'interrupted' }
  await patchRunState(council.id, turn.id, { status: 'interrupted' })
  return {
    ...council,
    turns: council.turns.map((t) => (t.id === turn.id ? { ...t, runState } : t)),
  }
}

/** The turn with its run state dropped — "this is finished", the mirror's
 *  counterpart to `clearRunState`. Destructured rather than assigned
 *  `undefined`, so the key is genuinely absent and `turn.runState` stays a
 *  reliable "is this unfinished?" test. */
function retireTurn(turn: Turn): Turn {
  const { runState: _retired, ...rest } = turn
  return rest
}

/** Replace a turn in the mirror, or insert it in `idx` order. Both cases
 *  are real: a fresh turn is new, a resumed one is already there. */
function upsertTurn(turns: Turn[], turn: Turn): Turn[] {
  const found = turns.some((t) => t.id === turn.id)
  if (found) return turns.map((t) => (t.id === turn.id ? turn : t))
  return [...turns, turn].sort((a, b) => a.idx - b.idx)
}

/** Per-seat streaming state for seats whose answer is already persisted, so
 *  a resumed turn renders its finished work immediately rather than
 *  replaying an empty fan-out. */
function seedSettledSeatStreams(
  activeSeats: readonly Seat[],
  answerEvents: readonly TurnEvent[],
): Record<string, PerSeatStream> {
  const settled: Record<string, PerSeatStream> = {}
  for (const seat of activeSeats) {
    const event = answerEvents.find((e) => e.seatId === seat.id)
    if (!event) continue
    settled[seat.id] = {
      status: event.error ? 'error' : 'done',
      error: event.error ?? null,
      output: event.output,
      modelId: event.modelId,
    }
  }
  return settled
}

/** Voting counterpart to `seedSettledSeatStreams`. */
function seedSettledVoterStreams(
  events: readonly TurnEvent[],
): Record<string, PerVoterStream> {
  const settled: Record<string, PerVoterStream> = {}
  for (const event of events) {
    if (event.roleType !== 'vote' || !event.seatId) continue
    settled[event.seatId] = {
      status: event.error ? 'error' : 'done',
      error: event.error ?? null,
      vote: event.vote && event.vote.length > 0 ? event.vote : null,
      modelId: event.modelId,
      rawResponse: event.rawResponse ?? null,
    }
  }
  return settled
}

// Pure helpers extracted to `src/utils/session/*`:
//   - buildSeatHistory          (build-seat-history.ts)
//   - clampMediatorRounds       (clamps.ts)
//   - clampMinCommentLength     (clamps.ts)
//   - formatMediatorPriorRounds (format-mediator-prior-rounds.ts)
//   - generateTitleForFirstTurn (title-gen.ts)
