import type { Council } from '@/types/council'
import { MODEL_A } from './fixtures'

/** A minimal, schema-valid bundle council. */
export function bundleCouncil(over: Partial<Council> = {}): Council {
  return {
    id: 'bc-1',
    title: 'Bundled council',
    createdAt: 1_700_000_000_000,
    socialStructure: 'roundtable',
    seats: [{ id: 's1', modelId: MODEL_A, config: {} }],
    turns: [],
    tokenTotal: { inputTokens: 0, outputTokens: 0 },
    ...over,
  }
}

export function envelope(councils: unknown[]): unknown {
  return { version: 1, exportedAt: 1_700_000_000_000, councils }
}
