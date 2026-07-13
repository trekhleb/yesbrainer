/**
 * Coerce a model's free-form anonymized-label reference back to one of the
 * expected letter labels (A/B/C/…). Models routinely return decorations —
 * `"Model A"`, `"model_a"`, `"Participant B"`, quoted or whitespace-padded
 * letters — instead of the bare label a schema or prompt asked for; without
 * this, perfectly valid votes get dropped and Mediator digest movements
 * fail to resolve back to seats. Returns null when the value can't be
 * resolved to a label in `validLabels`.
 *
 * The one resolver for every label-space consumer (Trial votes in
 * `providers/run-vote.ts`, Consensus digests via `utils/chat-panes.ts`).
 * These used to carry separate, differently-strict copies — exactly how a
 * robustness fix lands in one and silently not the other.
 */
export function resolveAnonymizedLabel(
  raw: string,
  validLabels: ReadonlySet<string>,
): string | null {
  if (typeof raw !== 'string') return null
  if (validLabels.has(raw)) return raw
  // Strip common prefixes / separators / quoting; uppercase; pick the
  // first contiguous letter run as the candidate label.
  const cleaned = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(model|participant|seat|llm|voter|answer)[\s_:#-]*/i, '')
    .toUpperCase()
  const match = cleaned.match(/^([A-Z]+)/)
  const candidate = match?.[1]
  if (!candidate) return null
  return validLabels.has(candidate) ? candidate : null
}
