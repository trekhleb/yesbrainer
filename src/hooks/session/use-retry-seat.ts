/**
 * Per-seat answer retry for `useCouncilSession`.
 *
 * Re-runs one errored Participant answer in a persisted turn and replaces its
 * event **in place** (same event id), so the failed pane recovers without
 * re-asking the whole council. Offered by the UI only on the latest turn and
 * only while the turn holds participant events alone (see `chat-thread.tsx`):
 * no downstream phase (voting / verdict / debate rounds) consumed the answers
 * and no later turn's seat history was built yet — so a late answer slots in
 * cleanly. Parallel turns always pass that shape check; Trial / Consensus
 * turns pass it when every downstream phase was skipped (all seats failed,
 * e.g. missing provider keys), making this the recovery path for the
 * partially-keyed first send there too.
 *
 * Extracted from the orchestrator so `use-council-session.ts` stays focused on
 * the forward turn pipeline. Controller acquisition/release and the
 * replace-in-place tail ride the shared `runSessionRetry` /
 * `replaceRetriedEvent` mechanics; progress reports through the parent's
 * `setSeatRetry` — the chat thread overlays that streaming output on the
 * pane. The in-flight guard (`isBusy`) is passed in because "busy" spans
 * every phase the parent owns.
 */

import { useCallback } from 'react'
import {
  replaceRetriedEvent,
  runSessionRetry,
} from '@/hooks/session/retry-run'
import { runParticipantStream } from '@/providers/run-stream'
import { getEnabledToolNamesForSeat } from '@/providers/tools/enabled'
import { buildToolsForEntry } from '@/providers/tools'
import { buildSeatHistory } from '@/utils/session/build-seat-history'
import { buildParticipantEvent } from '@/utils/session/participant-event'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { getStickyReasoningEffort } from '@/storage/run-options'
import { getUserPrompts, resolveCouncilParticipantDefault } from '@/storage/prompts'
import { getModel } from '@/models/registry'
import type { Council } from '@/types/council'
import type { SeatRetryState } from '@/types/session'

export function useRetrySeat({
  council,
  setCouncil,
  abortRef,
  runStartingRef,
  isBusy,
  setSeatRetry,
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
  setSeatRetry: React.Dispatch<React.SetStateAction<SeatRetryState | null>>
}): {
  retrySeatAnswer: (turnId: string, seatId: string) => Promise<void>
} {
  const retrySeatAnswer = useCallback(
    async (turnId: string, seatId: string) => {
      if (!council || isBusy || runStartingRef.current !== null) return

      const turn = council.turns.find((t) => t.id === turnId)
      if (!turn) return
      const oldEvent = turn.events.find(
        (e) =>
          e.roleType === 'participant' && e.seatId === seatId && !!e.error,
      )
      if (!oldEvent) return
      // The seat must still be on the roster — its config drives the rerun.
      const seat = council.seats.find((s) => s.id === seatId)
      if (!seat) return

      setSeatRetry({ turnId, seatId, output: '' })
      await runSessionRetry(
        council.id,
        abortRef,
        async (signal) => {
          // The same per-seat context runTurn builds: history from the turns
          // *before* this one, the participant cascade, per-seat tools.
          const priorTurns = council.turns.filter((t) => t.idx < turn.idx)
          const history = buildSeatHistory(
            priorTurns,
            seat,
            turn.userMsg,
            turn.userImages,
          )
          const participantDefault = resolveCouncilParticipantDefault(
            council.deliberation,
            council.socialStructure,
            getUserPrompts(),
          )
          const enabledToolNames = getEnabledToolNamesForSeat(seat, false)
          const tools =
            enabledToolNames.length > 0
              ? buildToolsForEntry(getModel(seat.modelId), enabledToolNames)
              : undefined
          const result = await runParticipantStream({
            modelId: seat.modelId,
            history,
            abortSignal: signal,
            onChunk: (acc) =>
              setSeatRetry((cur) =>
                cur && cur.turnId === turnId && cur.seatId === seatId
                  ? { ...cur, output: acc }
                  : cur,
              ),
            systemPrompt: seat.config.systemPrompt ?? participantDefault,
            // The sticky Thinking override covers retries too — a retry is
            // an upcoming send, so it runs at the currently armed effort.
            ...samplingArgs(
              seat.config,
              resolveReasoningEffort(
                seat,
                getStickyReasoningEffort(council.id),
              ),
            ),
            ...(tools ? { tools } : {}),
          })
          // A pure abort (Stop before any text or error) leaves the old
          // errored event untouched — same rule as runTurn's "no record for
          // a pure abort".
          if (result.text.length === 0 && !result.error) return
          await replaceRetriedEvent({
            councilId: council.id,
            turnId,
            event: buildParticipantEvent({ id: oldEvent.id, seat, result }),
            site: 'retrySeatAnswer',
            setCouncil,
          })
        },
        () => setSeatRetry(null),
      )
    },
    [council, setCouncil, abortRef, runStartingRef, isBusy, setSeatRetry],
  )

  return { retrySeatAnswer }
}
