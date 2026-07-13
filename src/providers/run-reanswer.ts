import {
  runParticipantStream,
  type StreamResult,
} from '@/providers/run-stream'
import type { ReasoningEffort, Seat } from '@/types/council'

/**
 * Per-Participant re-answer runner (Consensus debate).
 *
 * Thin generic shim over `runParticipantStream`: a re-answer is one
 * streamed call per Participant, asking it to reconsider its prior-round
 * answer given the Mediator's divergence framing (and optionally the
 * peers' anonymized answers). The substitution into the re-answer
 * template happens at the consensus phase (which holds the per-seat
 * context); this helper just wires the resolved system + user message
 * into the existing stream primitive so the cost / abort / error path
 * stays identical to a normal Participant answer.
 *
 * Symmetric with `runVoteForVoter`: the consensus phase loops over
 * Participant seats and calls this in parallel via `Promise.allSettled`.
 */
export interface RunReanswerForSeatArgs {
  seat: Seat
  /** Resolved re-answer system prompt (per-seat persona + task
   *  instruction; the cascade is the caller's job). */
  system: string
  /** Resolved user message — the re-answer template already substituted. */
  prompt: string
  /** Per-seat temperature override; passed through to `streamText` if set. */
  temperature?: number
  /** Per-seat output-token cap. */
  maxOutputTokens?: number
  /** Per-seat reasoning effort. */
  reasoningEffort?: ReasoningEffort
  /** The turn's image attachments. A re-answer is a *fresh* call, not a
   *  continued conversation — without re-attaching, a Participant debating
   *  an image loses sight of it from round 2 on (earlier gap). Caller
   *  guards on vision capability. */
  images?: string[]
  abortSignal: AbortSignal
  onChunk: (accumulated: string) => void
  /** Live-only reasoning feed — see `RunParticipantStreamArgs.onReasoning`. */
  onReasoning?: (accumulated: string) => void
}

export async function runReanswerForSeat(
  args: RunReanswerForSeatArgs,
): Promise<StreamResult> {
  return runParticipantStream({
    modelId: args.seat.modelId,
    systemPrompt: args.system,
    history: [
      {
        role: 'user',
        content: args.prompt,
        ...(args.images && args.images.length > 0
          ? { images: args.images }
          : {}),
      },
    ],
    abortSignal: args.abortSignal,
    onChunk: args.onChunk,
    ...(args.onReasoning ? { onReasoning: args.onReasoning } : {}),
    ...(args.temperature !== undefined
      ? { temperature: args.temperature }
      : {}),
    ...(args.maxOutputTokens !== undefined
      ? { maxOutputTokens: args.maxOutputTokens }
      : {}),
    ...(args.reasoningEffort !== undefined
      ? { reasoningEffort: args.reasoningEffort }
      : {}),
  })
}
