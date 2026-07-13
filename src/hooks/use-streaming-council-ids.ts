import { useSyncExternalStore } from 'react'
import {
  getStreamingCouncilIds,
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
