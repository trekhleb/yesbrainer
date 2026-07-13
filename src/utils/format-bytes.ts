/**
 * Human-readable byte-size label — "47 MB", "1.5 GB", "300 KB", etc.
 * One decimal for values under 10 in their unit; zero decimals
 * otherwise.
 */

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = b / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}
