/**
 * Serialise / parse the voting-dimensions textarea (Settings →
 * Behavior → Voting rating dimensions). One dimension per line,
 * formatted `name: description` (description optional). Empty lines
 * are skipped on parse; an empty name (just a leading colon) is also
 * skipped.
 */

import type { DimensionConfig } from '@/storage/behavior'

export function serializeDimensions(dimensions: DimensionConfig[]): string {
  return dimensions
    .map((d) => (d.description ? `${d.name}: ${d.description}` : d.name))
    .join('\n')
}

export function parseDimensions(text: string): DimensionConfig[] {
  const out: DimensionConfig[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) {
      out.push({ name: line })
      continue
    }
    const name = line.slice(0, colonIdx).trim()
    const description = line.slice(colonIdx + 1).trim()
    if (name.length === 0) continue
    out.push(description ? { name, description } : { name })
  }
  return out
}
