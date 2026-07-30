import { describe, expect, it, vi } from 'vitest'
import {
  buildModelOptions,
  selectValueForModelId,
} from '@/components/model-options'
import { PROVIDER_IDS, registry } from '@/models/registry'
import type { ApiKeys } from '@/storage/keys'

/** Every provider keyed, so nothing is filtered or greyed for reachability
 *  reasons and the assertions below isolate the `deprecated` behaviour. */
const ALL_KEYS = Object.fromEntries(
  PROVIDER_IDS.map((p) => [p, 'test-key']),
) as ApiKeys

const OLLAMA_ON = { enabled: true, reachable: true }

describe('buildModelOptions', () => {
  it('omits superseded models from the picker', () => {
    const superseded = registry.filter((m) => m.deprecated)
    expect(
      superseded.length,
      'expected the catalog to carry at least one superseded entry',
    ).toBeGreaterThan(0)
    const offered = new Set(
      buildModelOptions(ALL_KEYS, OLLAMA_ON).map((o) => o.id),
    )
    for (const m of superseded) {
      expect(
        offered.has(m.modelId),
        `${m.modelId} is superseded but still offered for new seats`,
      ).toBe(false)
    }
  })

  it('unlocks routed Anthropic and OpenAI models with only an OpenRouter key', () => {
    const options = buildModelOptions(
      { openrouter: 'test-key' },
      { enabled: false, reachable: false },
    )
    const routedAnthropic = options.find((o) =>
      o.id.startsWith('openrouter:anthropic/'),
    )
    const routedOpenAI = options.find((o) =>
      o.id.startsWith('openrouter:openai/'),
    )
    expect(routedAnthropic?.disabled).toBe(false)
    expect(routedOpenAI?.disabled).toBe(false)

    const nativeAnthropic = options.find((o) =>
      o.id.startsWith('anthropic:'),
    )
    const nativeOpenAI = options.find((o) => o.id.startsWith('openai:'))
    expect(nativeAnthropic?.disabled).toBe(true)
    expect(nativeOpenAI?.disabled).toBe(true)
  })

  it('reuses options for the same provider reachability state', () => {
    const first = buildModelOptions(
      { openrouter: 'first-key-value' },
      { enabled: false, reachable: false },
    )
    const second = buildModelOptions(
      { openrouter: 'different-key-value' },
      { enabled: false, reachable: false },
    )

    expect(second).toBe(first)
  })
})

describe('selectValueForModelId', () => {
  const options = buildModelOptions(ALL_KEYS, OLLAMA_ON)

  it('resolves a currently offered model to its picker option', () => {
    const live = registry.find((m) => !m.deprecated && m.provider !== 'ollama')!
    expect(selectValueForModelId(options, live.modelId)).toEqual([
      options.find((o) => o.id === live.modelId),
    ])
  })

  it('still labels a seat left on a superseded model', () => {
    // The regression this guards: superseded entries are filtered out of
    // `options`, so a seat pinned to one used to resolve to `[]` and render as
    // an empty Select — reading as "no model chosen" for a seat that has one.
    // Every pristine profile lands in that state, because the seeded demo
    // councils pin to whatever was current when they were recorded.
    const superseded = registry.find((m) => m.deprecated)!
    const value = selectValueForModelId(options, superseded.modelId)
    expect(value).toHaveLength(1)
    expect(value[0]?.id).toBe(superseded.modelId)
    expect(value[0]?.label).toBe(superseded.label)
    expect(String(value[0]?.label)).not.toContain('unlisted')
  })

  it('falls back to the unlisted stub for an id the catalog dropped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = selectValueForModelId(options, 'anthropic:claude-from-2031')
    expect(value).toHaveLength(1)
    expect(String(value[0]?.label)).toContain('unlisted')
    warn.mockRestore()
  })

  it('renders nothing when the seat has no model', () => {
    expect(selectValueForModelId(options, null)).toEqual([])
    expect(selectValueForModelId(options, undefined)).toEqual([])
    expect(selectValueForModelId(options, '')).toEqual([])
  })
})
