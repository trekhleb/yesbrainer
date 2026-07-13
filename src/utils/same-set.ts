/**
 * Order-independent set equality for two string arrays. Used by the
 * seat-config modal's save logic to detect "user has every available
 * tool checked" so the storage shape collapses to `undefined` (the
 * canonical "all on" default).
 */

export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const seen = new Set(a)
  for (const x of b) if (!seen.has(x)) return false
  return true
}
