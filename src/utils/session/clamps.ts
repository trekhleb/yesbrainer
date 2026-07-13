/**
 * Defensive clamps for user-configured behavior knobs that the
 * orchestrator reads on every turn. The Settings UI already constrains
 * the inputs (`min=1 max=5`, `min=0 max=2000`, …); the same caps run
 * here too so a hand-edited `localStorage` value can't blow up the
 * orchestrator or pass nonsense into a downstream schema.
 */

import {
  DEFAULT_MEDIATOR_MAX_ROUNDS,
  DEFAULT_MIN_COMMENT_LENGTH,
} from '@/storage/behavior'

/** Clamp the user-configured Mediator round cap into a sane range
 *  (1–5; the UI input matches this). */
export function clampMediatorRounds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MEDIATOR_MAX_ROUNDS
  return Math.max(1, Math.min(5, Math.floor(n)))
}

/** Clamp the user-configured min-comment-length to the same range the
 *  vote schema accepts (0 = no enforcement; 2000 = the existing
 *  `.max(2000)` cap). Out-of-bounds values fall back to the default
 *  so the vote-generation zod schema never receives nonsense. */
export function clampMinCommentLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MIN_COMMENT_LENGTH
  return Math.max(0, Math.min(2000, Math.floor(n)))
}
