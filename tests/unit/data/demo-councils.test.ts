import { describe, expect, it } from 'vitest'
import { demoCouncilBundle } from '@/data/demo-councils'
import { registry } from '@/models/registry'

/**
 * Referential integrity for the demo-council JSONs — the "typecheck" for
 * data the compiler can't see. Every `modelId` a demo references (seats,
 * Judge/Mediator, per-event snapshots) must resolve to a *listed*,
 * *non-deprecated* registry entry: an unlisted id silently degrades the demo
 * to the all-capabilities-off `getModel` stub ("<id> (unlisted)" labels, no
 * vision/tools), which is exactly the drift a catalog refresh causes when
 * the demos aren't regenerated alongside it.
 */
describe('demo-council data', () => {
  it('every referenced modelId is a listed, non-deprecated registry entry', () => {
    const listed = new Map(registry.map((m) => [m.modelId, m]))
    // Shape-agnostic sweep: demos nest modelIds in seats, judge/mediator
    // configs, and per-turn event snapshots — regexing the serialized bundle
    // catches every nesting without chasing the council schema.
    const bundle = JSON.stringify(demoCouncilBundle())
    const ids = new Set(
      [...bundle.matchAll(/"modelId":\s*"([^"]+)"/g)].map((m) => m[1]!),
    )
    expect(ids.size).toBeGreaterThan(0) // the sweep found demo data at all
    for (const id of ids) {
      const entry = listed.get(id)
      expect(entry, `demo references unlisted model id: ${id}`).toBeDefined()
      expect(
        entry?.deprecated,
        `demo references deprecated model id: ${id}`,
      ).not.toBe(true)
    }
  })
})
