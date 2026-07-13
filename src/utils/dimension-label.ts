/**
 * Display helpers for voting-rating dimension names.
 *
 * Dimensions are stored verbatim (usually lowercase: `accuracy`,
 * `completeness`, `clinical-correctness`) — these helpers turn them
 * into UI labels for two surfaces:
 *
 * - **Full form** (`humanizeDimension`) — used in the voting block's
 *   per-target card where space allows the whole word.
 * (The compact `abbreviateDimension` variant was removed with the old
 *   tabular leaderboard.)
 *
 * Generalised so per-council dimension customisation
 * ("clinical-correctness", "tone-fit", …) renders presentably without
 * per-name CSS.
 */

/** "accuracy" → "Accuracy". Leaves the rest of the string intact so
 *  non-ASCII / multi-word identifiers survive. */
export function humanizeDimension(name: string): string {
  if (name.length === 0) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}
