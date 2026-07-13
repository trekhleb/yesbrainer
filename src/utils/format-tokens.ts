export function formatTokenCount(n: number): string {
  // Round to a whole number once the value is large enough that the decimal
  // is just noise ("19K", not "19.3K"), but keep one decimal below the
  // threshold where it still carries signal ("1.2K"). Matches the composer
  // context hint's rule in `context-usage-row.tsx`.
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return String(n)
}

/** Advertised context window → a tight spec label: "8K", "131K", "1M".
 *  Unlike `formatTokenCount` (a *measured* count), a context window is a
 *  round provider spec, so this drops the trailing ".0" on whole millions
 *  ("1M", not "1.0M") and rounds to whole K below a million ("8K", "131K").
 *  Used by the model pickers' capability row. */
export function formatContextWindow(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  return `${Math.round(n / 1_000)}K`
}
