import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MODEL_ID,
  getModel,
  PROVIDER_IDS,
  registry,
} from '@/models/registry'
import { TITLE_GENERATOR_CHAIN } from '@/storage/behavior'

describe('registry', () => {
  it('lists the default model and only known providers', () => {
    expect(registry.some((m) => m.modelId === DEFAULT_MODEL_ID)).toBe(true)
    for (const m of registry) {
      expect(PROVIDER_IDS).toContain(m.provider)
      expect(m.contextWindow).toBeGreaterThan(0)
    }
  })

  it('model ids are unique', () => {
    const ids = registry.map((m) => m.modelId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every native provider designates exactly one `smartest` model', () => {
    // The "Smartest available" preset (`pickSmartestModelIds`) seats the
    // `smartest`-flagged entry per provider — a missing flag silently drops
    // the provider from the preset, a duplicate seats it twice. OpenRouter
    // is excluded from the preset, so its (generated) entries carry none.
    const nativeProviders = PROVIDER_IDS.filter((p) => p !== 'openrouter')
    for (const provider of nativeProviders) {
      const flagged = registry.filter(
        (m) => m.provider === provider && m.smartest,
      )
      expect(
        flagged.map((m) => m.modelId),
        `provider ${provider} must flag exactly one smartest model`,
      ).toHaveLength(1)
    }
    expect(
      registry.filter((m) => m.provider === 'openrouter' && m.smartest),
    ).toHaveLength(0)
  })

  it('snapshots the full OpenRouter catalog, including native-vendor routes', () => {
    const routed = registry.filter((m) => m.provider === 'openrouter')
    expect(
      routed.length,
      'the OpenRouter snapshot regressed to a small curated allowlist',
    ).toBeGreaterThan(100)
    expect(
      routed.some((m) => m.providerModelId.startsWith('anthropic/')),
      'OpenRouter-hosted Anthropic models are missing',
    ).toBe(true)
    expect(
      routed.some((m) => m.providerModelId.startsWith('openai/')),
      'OpenRouter-hosted OpenAI models are missing',
    ).toBe(true)
  })

  it('keeps the OpenRouter snapshot in deterministic code-point order', () => {
    const keys = registry
      .filter((m) => m.provider === 'openrouter')
      .map((m) => `${m.label}\0${m.providerModelId}`)
    expect(keys).toEqual([...keys].sort())
  })

  it('deprecated models never carry curated designations', () => {
    // A superseded model must hand its roles to the successor: the preset
    // must not seat it, and the last-resort default must not point at it.
    for (const m of registry.filter((x) => x.deprecated)) {
      expect(m.smartest, `${m.modelId} is deprecated but flagged smartest`).not.toBe(true)
    }
    const dflt = registry.find((m) => m.modelId === DEFAULT_MODEL_ID)
    expect(dflt?.deprecated).not.toBe(true)
  })

  it('each provider group leads with a live model', () => {
    // Registry order *is* the default-seat / picker order (`firstUsableModelId`
    // returns the first non-deprecated reachable entry). A group that leads
    // with a superseded entry still works — the selectors skip it — but the
    // ordering no longer says what it claims to, which is how a successor ends
    // up added below the model it replaced.
    for (const provider of PROVIDER_IDS) {
      const first = registry.find((m) => m.provider === provider)
      expect(
        first?.deprecated,
        `the ${provider} group leads with a deprecated entry — put the successor first`,
      ).not.toBe(true)
    }
  })

  it('wire ids never carry the registry `provider:` prefix', () => {
    // `providerModelId` defaults to `modelId` with its prefix stripped; an
    // entry that spells the override out by hand can copy the prefixed form
    // in by mistake, which 404s at call time rather than failing the build.
    for (const m of registry) {
      expect(
        m.providerModelId.length,
        `${m.modelId} has an empty wire id`,
      ).toBeGreaterThan(0)
      expect(
        m.providerModelId,
        `${m.modelId} leaked its registry prefix into the wire id`,
      ).not.toContain(`${m.provider}:`)
    }
  })

  it('the title-generator chain points only at live registry entries', () => {
    // `pickTitleModelId` resolves straight off `registry` without filtering
    // deprecated, so a stale rung here keeps titling on a superseded model
    // long after the pickers stopped offering it.
    for (const id of TITLE_GENERATOR_CHAIN) {
      const entry = registry.find((m) => m.modelId === id)
      expect(entry, `title chain references an unlisted model: ${id}`).toBeDefined()
      expect(
        entry?.deprecated,
        `title chain still points at superseded ${id}`,
      ).not.toBe(true)
    }
  })
})

/**
 * Catalog-currency pins for the July 2026 refresh.
 *
 * These name model ids literally, against this suite's usual habit of
 * deriving expectations from the registry — that's the point. A catalog
 * refresh is a two-part edit (add the successor, flag the predecessor) and
 * doing only half of it fails silently in opposite directions: skip the flag
 * and the picker offers a superseded model forever; delete the old entry
 * instead of flagging it and every persisted council seating it degrades to
 * the all-capabilities-off `getModel` stub. Deriving from the registry can't
 * catch either, because the registry is the thing that drifted.
 */
describe('catalog currency', () => {
  const SUPERSESSIONS: ReadonlyArray<readonly [string, string]> = [
    ['anthropic:claude-opus-5', 'anthropic:claude-opus-4-8'],
    ['openai:gpt-5.6-sol', 'openai:gpt-5.5'],
    ['openai:gpt-5.6-terra', 'openai:gpt-5.4'],
    ['google:gemini-3.6-flash', 'google:gemini-3.5-flash'],
    ['google:gemini-3.5-flash-lite', 'google:gemini-3.1-flash-lite'],
  ]

  it('every successor is listed and selectable', () => {
    for (const [successor] of SUPERSESSIONS) {
      const entry = registry.find((m) => m.modelId === successor)
      expect(entry, `missing successor entry: ${successor}`).toBeDefined()
      expect(
        entry?.deprecated,
        `${successor} is the current model but flagged deprecated`,
      ).not.toBe(true)
    }
  })

  it('every superseded model is kept but flagged, never deleted', () => {
    for (const [successor, superseded] of SUPERSESSIONS) {
      const entry = registry.find((m) => m.modelId === superseded)
      expect(
        entry,
        `${superseded} was deleted rather than deprecated — councils seating it would degrade to the getModel stub`,
      ).toBeDefined()
      expect(
        entry?.deprecated,
        `${superseded} is superseded by ${successor} but still offered in pickers`,
      ).toBe(true)
    }
  })

  it('newly added flagships derive the wire id from their registry id', () => {
    // None of the July 2026 additions is a dated snapshot, so each one's wire
    // id should be the bare suffix. A stray override here is invisible until
    // the first real call 404s.
    for (const [successor] of SUPERSESSIONS) {
      const entry = registry.find((m) => m.modelId === successor)
      expect(entry?.providerModelId).toBe(successor.split(':')[1])
    }
  })
})

describe('getModel fallback (unlisted ids never throw)', () => {
  it('builds a render-safe stub with the provider parsed from the prefix', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stub = getModel('anthropic:claude-2030-super')
    expect(stub.provider).toBe('anthropic')
    expect(stub.label).toContain('(unlisted)')
    expect(stub.capabilities).toEqual({
      tools: false,
      vision: false,
      reasoning: false,
    })
    expect(warn).toHaveBeenCalledOnce()

    // Cached: repeat lookups return the same object without re-warning.
    expect(getModel('anthropic:claude-2030-super')).toBe(stub)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('an unknown prefix still resolves to a usable stub', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stub = getModel('mystery/model-x')
    expect(PROVIDER_IDS).toContain(stub.provider)
    expect(stub.modelId).toBe('mystery/model-x')
  })
})
