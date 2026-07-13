import { stripSelfIdentification } from '@/utils/strip-self-identification'
import type { TurnEvent } from '@/types/council'

/**
 * Build the anonymization map for one Trial turn: shuffles the responding
 * Participant seat ids and assigns them sequential labels A, B, C, ...
 * (or AA, AB, ... beyond 26 — defensive; we don't expect that many seats).
 *
 * Fresh shuffle per turn defeats cross-turn brand inference — even if a
 * voter learns "Model A is Claude" this turn, next turn the mapping is
 * different. The mapping is persisted on the turn (`Turn.votingLabels`)
 * purely so users can audit what was sent; the canonical voter→target
 * reference inside `TurnEvent.vote` always uses real seat ids.
 */
export function buildVotingLabels(seatIds: string[]): Record<string, string> {
  const shuffled = fisherYates(seatIds)
  const labels: Record<string, string> = {}
  for (let i = 0; i < shuffled.length; i++) {
    const seatId = shuffled[i]
    if (seatId) labels[labelFor(i)] = seatId
  }
  return labels
}

function fisherYates<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}

function labelFor(idx: number): string {
  // 0 → A, 1 → B, ..., 25 → Z, 26 → AA, 27 → AB, ... (base-26 cycle).
  let n = idx
  let s = ''
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
    if (n < 0) break
  }
  return s
}

/**
 * Render the "Model X: <answer>" block that gets substituted into
 * `{answers}` in the voting / Mediator / re-answer prompts. Drops the
 * `voterSeatId` entry (voters don't rate themselves; a re-answering
 * Participant doesn't re-read its own answer here) — pass `''` to keep
 * every entry (the Mediator sees all answers labeled).
 *
 * Matches the answer-bearing roles `participant` (round 1) and `reanswer`
 * (Consensus rounds ≥ 2); callers pass a single round's events, so there's
 * exactly one answer per seat to label.
 *
 * `stripSelfId` (default `true`) runs each answer through
 * `stripSelfIdentification` first, removing opening "As Claude, …" /
 * trailing "— GPT-4" leaks so labels actually anonymise. The flag exists
 * so the orchestrator can respect the user's Settings → Behavior toggle;
 * the function defaults ON so call sites that forget to plumb it still
 * get the safer behaviour.
 */
export function formatLabeledAnswers(
  labels: Record<string, string>,
  events: TurnEvent[],
  voterSeatId: string,
  options: { stripSelfId?: boolean } = {},
): string {
  const { stripSelfId = true } = options
  const blocks: string[] = []
  for (const [label, seatId] of Object.entries(labels)) {
    if (seatId === voterSeatId) continue
    const ev = events.find(
      (e) =>
        (e.roleType === 'participant' || e.roleType === 'reanswer') &&
        e.seatId === seatId &&
        !e.error,
    )
    if (!ev) continue
    const body = stripSelfId ? stripSelfIdentification(ev.output) : ev.output
    blocks.push(`Model ${label}:\n${body}`)
  }
  return blocks.join('\n\n---\n\n')
}

/** The labels visible to one voter — all entries except their own. */
export function labelsForVoter(
  labels: Record<string, string>,
  voterSeatId: string,
): string[] {
  return Object.entries(labels)
    .filter(([, seatId]) => seatId !== voterSeatId)
    .map(([label]) => label)
}
