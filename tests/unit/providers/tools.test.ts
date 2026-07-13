import { describe, expect, it } from 'vitest'
import {
  buildToolsForEntry,
  getAvailableToolNamesForEntry,
  getToolDisplayLabel,
} from '@/providers/tools'
import { getEnabledToolNamesForSeat } from '@/providers/tools/enabled'
import { getModel, type ModelEntry } from '@/models/registry'
import { seat } from '../helpers/fixtures'

function entry(
  provider: ModelEntry['provider'],
  tools: boolean,
): ModelEntry {
  return {
    modelId: `${provider}:m`,
    label: 'M',
    provider,
    providerModelId: 'm',
    tier: 'paid',
    country: '',
    developer: '',
    contextWindow: 1,
    capabilities: { tools, vision: false, reasoning: false },
    defaultSystemPrompt: '',
  }
}

describe('getAvailableToolNamesForEntry', () => {
  it('gates on the model capability first, then the provider pack', () => {
    expect(getAvailableToolNamesForEntry(entry('anthropic', false))).toEqual([])
    expect(getAvailableToolNamesForEntry(entry('anthropic', true))).toEqual([
      'web_search',
      'code_execution',
    ])
    expect(getAvailableToolNamesForEntry(entry('google', true))).toEqual([
      'web_search',
      'url_context',
    ])
    // Providers without a wired pack have no tools regardless.
    expect(getAvailableToolNamesForEntry(entry('groq', true))).toEqual([])
  })
})

describe('buildToolsForEntry', () => {
  it('builds the full pack by default and honors an allow-list', () => {
    const all = buildToolsForEntry(entry('anthropic', true))
    expect(Object.keys(all ?? {})).toEqual(['web_search', 'code_execution'])

    const only = buildToolsForEntry(entry('anthropic', true), ['web_search'])
    expect(Object.keys(only ?? {})).toEqual(['web_search'])
  })

  it('returns undefined for empty results (the "skip tools param" signal)', () => {
    expect(buildToolsForEntry(entry('groq', true))).toBeUndefined()
    expect(buildToolsForEntry(entry('anthropic', true), [])).toBeUndefined()
    // Unknown allow-list names (hand-edited config) drop silently.
    expect(
      buildToolsForEntry(entry('anthropic', true), ['deleted_tool']),
    ).toBeUndefined()
  })

  it('builds the per-provider tool factories for openai and google', () => {
    const openai = buildToolsForEntry(entry('openai', true))
    expect(Object.keys(openai ?? {})).toEqual(['web_search', 'code_execution'])
    const google = buildToolsForEntry(entry('google', true))
    expect(Object.keys(google ?? {})).toEqual(['web_search', 'url_context'])
    // Each entry is a real AI SDK tool object.
    for (const tool of Object.values({ ...openai, ...google })) {
      expect(tool).toBeTypeOf('object')
    }
  })
})

describe('getEnabledToolNamesForSeat', () => {
  const TOOLS_MODEL = 'anthropic:claude-sonnet-5'
  const available = getAvailableToolNamesForEntry(getModel(TOOLS_MODEL))

  it('per-message skip wins over everything', () => {
    const s = seat('s1', TOOLS_MODEL)
    expect(getEnabledToolNamesForSeat(s, true)).toEqual([])
  })

  it('undefined and true mean "all available"; false means none', () => {
    expect(getEnabledToolNamesForSeat(seat('s1', TOOLS_MODEL))).toEqual(
      available,
    )
    expect(
      getEnabledToolNamesForSeat({
        ...seat('s1', TOOLS_MODEL),
        config: { tools: true },
      }),
    ).toEqual(available)
    expect(
      getEnabledToolNamesForSeat({
        ...seat('s1', TOOLS_MODEL),
        config: { tools: false },
      }),
    ).toEqual([])
  })

  it('an allow-list intersects with availability in canonical order', () => {
    const s = {
      ...seat('s1', TOOLS_MODEL),
      config: { tools: ['code_execution', 'nonexistent_tool'] },
    }
    expect(getEnabledToolNamesForSeat(s)).toEqual(['code_execution'])
  })
})

describe('getToolDisplayLabel', () => {
  it('names known tools and passes unknown ids through', () => {
    expect(getToolDisplayLabel('web_search')).toBe('Web search')
    expect(getToolDisplayLabel('mystery_tool')).toBe('mystery_tool')
  })
})
