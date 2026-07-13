import { getSeatDisplayLabelById } from '@/utils/seat-label'
import { aggregateVotesByTarget } from '@/utils/vote-leaderboard'
import type { Seat, Turn, TurnEvent } from '@/types/council'

/**
 * Build the three text blocks the Judge user-message template substitutes
 * in: named full answers, per-target average ratings (leaderboard), and
 * per-target free-text voter comments. The Judge sees real model names —
 * anonymization is reserved for the *voter* prompt where it actually
 * debiases.
 *
 * The leaderboard string is rendered from the same `aggregateVotesByTarget`
 * the in-chat `<Leaderboard>` UI consumes, so what the user sees and what
 * the Judge weighs is identical.
 *
 * Multi-turn continuity: when `options.priorTurns` is provided and at
 * least one of those turns has a non-errored Judge event, a compressed
 * "PRIOR TURNS" block is prepended to `answers`. Each prior turn carries
 * only the user message + the Judge's synthesis — *not* the full
 * Participant outputs, which the Judge already distilled. Without this
 * block the Judge sees only the current turn and follow-ups like "expand
 * on that" lose the antecedent. Toggle: Settings → Behavior →
 * `includePriorJudge` (default ON; resolved by the orchestrator before
 * calling here).
 */
export interface JudgeContextSubs {
  answers: string
  leaderboard: string
  comments: string
}

export function buildJudgeContext(
  events: TurnEvent[],
  seats: Seat[],
  options: {
    priorTurns?: Turn[]
    /** Role to look up when building the PRIOR TURNS block — Trial uses
     *  the prior Judge synthesis, Consensus uses the final Mediator
     *  round (highest-round non-errored event). Defaults to `'judge'`
     *  for backward compatibility. */
    priorTurnRole?: 'judge' | 'mediator'
    /** When `false`, the returned `leaderboard` is `''` so the template's
     *  `{leaderboard}` substitution renders empty. Toggle for the
     *  Judge (Trial) — see Settings → Behavior. The Mediator (Consensus)
     *  passes `false` unconditionally because Consensus has no voting
     *  phase. Defaults to `true`. */
    showLeaderboard?: boolean
    /** Same shape as `showLeaderboard`, for the voter-comments block.
     *  When `false`, the returned `comments` is `''`. */
    showComments?: boolean
  } = {},
): JudgeContextSubs {
  // The Judge synthesises from the Participants' answers. Trial has no
  // revision step — re-answering in light of peers is Consensus-only.
  const answerEvents: TurnEvent[] = []
  for (const e of events) {
    if (
      e.roleType !== 'participant' ||
      e.error ||
      e.output.length === 0 ||
      !e.seatId
    ) {
      continue
    }
    answerEvents.push(e)
  }

  // All seat labels go through `getSeatDisplayLabelById` so duplicate
  // models surface as "Llama 3.1 8B #1" / "#2" rather than three identical
  // "Llama 3.1 8B" rows — the Judge needs to weigh them as distinct
  // contributions, the same way the user sees them in the UI.
  const currentAnswers = answerEvents
    .map(
      (e) =>
        `${getSeatDisplayLabelById(e.seatId, seats, e.modelId)}:\n${e.output}`,
    )
    .join('\n\n---\n\n')

  const priorBlock = formatPriorTurnsForSynthesis(
    options.priorTurns ?? [],
    options.priorTurnRole ?? 'judge',
  )
  const answers = priorBlock
    ? `${priorBlock}\n\n---\n\nCURRENT TURN — Participant answers:\n${currentAnswers}`
    : currentAnswers

  // The aggregator already computes display labels, so reuse them here
  // for the leaderboard + comments strings (single source of truth with
  // the in-chat `<Leaderboard>` UI).
  const aggregates = aggregateVotesByTarget(events, seats)

  const showLeaderboard = options.showLeaderboard ?? true
  const showComments = options.showComments ?? true

  // Per-target row: comma-separated `dimension X.Y` pairs in dimension-
  // declaration order (whatever order the aggregator emitted), trailed
  // by the rater count. Generalised: the dimension set is
  // dynamic, so we iterate the averages map rather than hardcoding
  // accuracy / completeness / insight. Suppressed entirely (empty
  // string) when `showLeaderboard` is false — the template's
  // `{leaderboard}` substitution then renders blank for the
  // "judge from prose alone" toggle.
  const leaderboard = showLeaderboard
    ? aggregates
        .map((entry) => {
          if (!entry.averages || Object.keys(entry.averages).length === 0) {
            return `${entry.targetDisplayLabel}: no peer ratings`
          }
          const cells = Object.entries(entry.averages)
            .map(([dim, avg]) => `${dim} ${avg.toFixed(1)}`)
            .join(', ')
          return `${entry.targetDisplayLabel}: ${cells} (n=${entry.ratings.length})`
        })
        .join('\n')
    : ''

  // Comments: only emit per-target blocks when at least one voter left
  // free text — empty sections add noise to the prompt. Suppressed
  // entirely when `showComments` is false.
  const comments = showComments
    ? aggregates
        .map((entry) => {
          const lines: string[] = []
          for (const rating of entry.ratings) {
            const comment = rating.vote.comment.trim()
            if (!comment) continue
            lines.push(`  - From ${rating.voterDisplayLabel}: "${comment}"`)
          }
          if (lines.length === 0) return null
          return `${entry.targetDisplayLabel}:\n${lines.join('\n')}`
        })
        .filter((block): block is string => block !== null)
        .join('\n\n')
    : ''

  return { answers, leaderboard, comments }
}

/**
 * Render the compressed "PRIOR TURNS" block — one entry per prior turn
 * that has a non-errored final synthesis (Judge event for Trial, the
 * highest-round Mediator event for Consensus), carrying the user message
 * and the synthesis text. Participant answers from prior turns are
 * deliberately dropped to keep context cost bounded; the synthesis
 * already weighed them. Returns `''` when no qualifying prior turn
 * exists so the caller can skip the section entirely rather than emit
 * an empty header.
 */
export function formatPriorTurnsForSynthesis(
  priorTurns: Turn[],
  role: 'judge' | 'mediator',
): string {
  if (priorTurns.length === 0) return ''
  const blocks: string[] = []
  const label = role === 'judge' ? 'Judge synthesis' : 'Mediator final synthesis'
  for (const t of priorTurns) {
    const ev = pickFinalSynthesis(t, role)
    if (!ev) continue
    blocks.push(`Turn ${t.idx + 1}\nUser: ${t.userMsg}\n${label}: ${ev.output}`)
  }
  if (blocks.length === 0) return ''
  const header =
    role === 'judge'
      ? 'PRIOR TURNS (compressed — user message + Judge synthesis only):'
      : 'PRIOR TURNS (compressed — user message + Mediator final synthesis only):'
  return `${header}\n\n${blocks.join('\n\n')}`
}

/**
 * Pick the canonical "final synthesis" event for a prior turn.
 * - Trial: the single Judge event (there's at most one per turn).
 * - Consensus: the highest-round non-errored Mediator event (rounds
 *   iterate; the last one is the council's final word, whether it was
 *   convergent-early or max-rounds).
 */
function pickFinalSynthesis(
  turn: Turn,
  role: 'judge' | 'mediator',
): TurnEvent | undefined {
  if (role === 'judge') {
    return turn.events.find(
      (e) => e.roleType === 'judge' && !e.error && e.output.length > 0,
    )
  }
  let chosen: TurnEvent | undefined
  let chosenRound = -1
  for (const e of turn.events) {
    if (e.roleType !== 'mediator' || e.error || e.output.length === 0) continue
    const round = e.mediator?.round ?? 0
    if (round > chosenRound) {
      chosen = e
      chosenRound = round
    }
  }
  return chosen
}
