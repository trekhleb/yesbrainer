/**
 * Fire-and-forget LLM title generation for a freshly-created council's
 * first turn. Runs after `appendTurn` succeeds; patches the
 * council title in Dexie once the LLM responds; notifies the caller (via
 * `onStart` / `onFinish`) so the sidebar can render a small spinner while
 * gen is in flight and swap to the new title in the same render the
 * spinner clears (`onFinish` carries the title for exactly that reason).
 *
 * Deliberately outlives the council view — only deleting the council
 * cancels it (via the per-council stream registry). Silent on failure —
 * the truncated-from-user-msg fallback title stays in place. Never throws.
 */

import { patchCouncilTitle } from '@/storage/councils'
import { prepareAndRunTitleGen } from '@/providers/run-title'
import {
  registerCouncilStream,
  releaseCouncilStream,
} from '@/utils/session/active-streams'
import { logRedactedError } from '@/utils/extract-error'
import type { TurnEvent } from '@/types/council'

export async function generateTitleForFirstTurn(args: {
  councilId: string
  userMsg: string
  events: TurnEvent[]
  onStart: (councilId: string) => void
  onFinish: (councilId: string, newTitle?: string) => void
}): Promise<void> {
  args.onStart(args.councilId)
  const controller = new AbortController()
  registerCouncilStream(args.councilId, controller)
  let newTitle: string | undefined
  try {
    // Representative first answer: the earliest successful Participant
    // event. Gives the titler a hint of what the council actually
    // discussed, which the question alone may not. Empty when no
    // Participant landed cleanly (the titler falls back to question
    // alone, which is still useful).
    const firstAnswer =
      args.events.find(
        (e) => e.roleType === 'participant' && !e.error && e.output.length > 0,
      )?.output ?? ''
    const result = await prepareAndRunTitleGen({
      question: args.userMsg,
      firstAnswer,
      abortSignal: controller.signal,
    })
    if (!result.title) return
    await patchCouncilTitle(args.councilId, result.title)
    newTitle = result.title
  } catch (err) {
    // Silent — the truncated fallback title stays in place.
    logRedactedError('generateTitleForFirstTurn', err)
  } finally {
    releaseCouncilStream(args.councilId, controller)
    args.onFinish(args.councilId, newTitle)
  }
}
