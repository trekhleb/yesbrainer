import { describe, expect, it } from 'vitest'
import { demoCouncilBundle } from '@/data/demo-councils'
import { registry } from '@/models/registry'

/**
 * Referential integrity for the demo-council JSONs — the "typecheck" for
 * data the compiler can't see. Every `modelId` a demo references (seats,
 * Judge/Mediator, per-event snapshots) must resolve to a *listed* registry
 * entry: an unlisted id silently degrades the demo to the
 * all-capabilities-off `getModel` stub ("<id> (unlisted)" labels, no
 * vision/tools), which is exactly the drift a catalog refresh causes when a
 * superseded entry is deleted instead of flagged.
 *
 * Deliberately *not* asserting `!deprecated`. A demo is a recorded
 * transcript — real output from the model that produced it — so its seats
 * pin to whatever was current when it was captured, and rewriting those ids
 * on a flagship bump would misattribute the output. Deprecation is the
 * designed lifecycle for that: `getModel` resolves superseded entries with
 * full metadata (only the *pickers* hide them), so the demo keeps rendering
 * its real labels, logos, and capability badges. Deleting the entry is the
 * failure this guards; superseding it is not.
 */
describe('demo-council data', () => {
  it('every referenced modelId is a listed registry entry', () => {
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
      expect(listed.get(id), `demo references unlisted model id: ${id}`).toBeDefined()
    }
  })
})
