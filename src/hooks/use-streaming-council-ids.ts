import { useSyncExternalStore } from 'react'
import {
  getStreamingCouncilIds,
  getStreamingTurnIds,
  subscribeCouncilStreams,
} from '@/utils/session/active-streams'

/**
 * Ids of councils with any run in flight — a live view of the
 * `active-streams` registry, which sees every run kind (turn fan-out,
 * retries, the fire-and-forget titler) and keeps reporting runs that
 * outlive their council view (switching away lets a turn finish in the
 * background — see DEVELOPMENT.md → Orchestration hook pattern). The
 * sidebar reads this to put a busy row's ⋯ button into its loading state.
 */
export function useStreamingCouncilIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeCouncilStreams, getStreamingCouncilIds)
}

/**
 * Ids of *turns* a run is currently driving.
 *
 * The council-level set above can't answer "is this turn being worked on?"
 * — it also counts the fire-and-forget titler, so a council whose title is
 * still generating reads as busy. The paused card needs the precise
 * question: it must not announce "picking up where it stopped" over a turn
 * nobody is resuming, nor hide a Resume button that would have worked.
 */
export function useStreamingTurnIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeCouncilStreams, getStreamingTurnIds)
}
