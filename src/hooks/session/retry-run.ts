/**
 * Shared mechanics of the retry-hook family (`use-retry-seat` /
 * `use-retry-votes` / `use-retry-synthesis`). Each retry differs in what
 * it re-runs and how it overlays progress — but every one must acquire
 * the session's AbortController the same way (wired into `abortRef` so
 * `stop()` interrupts it, registered per council so a delete aborts it)
 * and must release both in a `finally`. Hand-rolling that pairing per
 * hook is how one of them ends up unstoppable.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { replaceEvent as apiReplaceEvent } from '@/storage/councils'
import {
  registerCouncilStream,
  releaseCouncilStream,
} from '@/utils/session/active-streams'
import { replaceEventInCouncil } from '@/utils/session/replace-event-local'
import type { Council, TurnEvent } from '@/types/council'

/**
 * Run one retry body with a properly acquired + released controller.
 * `onSettled` clears the caller's overlay state — it runs in the
 * `finally`, before the controller is handed back.
 */
export async function runSessionRetry(
  councilId: string,
  abortRef: MutableRefObject<AbortController | null>,
  body: (signal: AbortSignal) => Promise<void>,
  onSettled: () => void,
): Promise<void> {
  const controller = new AbortController()
  abortRef.current = controller
  registerCouncilStream(councilId, controller)
  try {
    await body(controller.signal)
  } finally {
    onSettled()
    abortRef.current = null
    releaseCouncilStream(councilId, controller)
  }
}

/**
 * Persist a retried event in place (same id) and mirror it into the local
 * council state. A failed write logs and leaves the old errored event
 * untouched — still there for another retry.
 */
export async function replaceRetriedEvent(args: {
  councilId: string
  turnId: string
  event: TurnEvent
  /** Call-site tag for the error log, per the logging discipline. */
  site: string
  setCouncil: Dispatch<SetStateAction<Council | null>>
}): Promise<void> {
  try {
    await apiReplaceEvent(args.councilId, args.turnId, args.event)
  } catch (err) {
    console.error(`[${args.site}] replaceEvent failed`, err)
    return
  }
  args.setCouncil((c) =>
    c ? replaceEventInCouncil(c, args.turnId, args.event) : c,
  )
}
