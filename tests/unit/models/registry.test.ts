import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MODEL_ID,
  getModel,
  PROVIDER_IDS,
  registry,
} from '@/models/registry'

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

  it('deprecated models never carry curated designations', () => {
    // A superseded model must hand its roles to the successor: the preset
    // must not seat it, and the last-resort default must not point at it.
    for (const m of registry.filter((x) => x.deprecated)) {
      expect(m.smartest, `${m.modelId} is deprecated but flagged smartest`).not.toBe(true)
    }
    const dflt = registry.find((m) => m.modelId === DEFAULT_MODEL_ID)
    expect(dflt?.deprecated).not.toBe(true)
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
