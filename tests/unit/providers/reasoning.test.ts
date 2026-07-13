import { describe, expect, it } from 'vitest'
import {
  buildReasoningProviderOptions,
  describeReasoningResolution,
} from '@/providers/reasoning'
import type { ModelEntry } from '@/models/registry'

function entry(
  provider: ModelEntry['provider'],
  over: Partial<
    Pick<
      ModelEntry,
      'providerModelId' | 'thinkingApi' | 'thinkingAlwaysOn'
    > & { reasoning: boolean }
  > = {},
): ModelEntry {
  const { reasoning = true, providerModelId = 'm', ...flags } = over
  return {
    modelId: `${provider}:${providerModelId}`,
    label: 'M',
    provider,
    providerModelId,
    tier: 'paid',
    country: '',
    developer: '',
    contextWindow: 1,
    capabilities: { tools: false, vision: false, reasoning },
    defaultSystemPrompt: '',
    ...flags,
  }
}

describe('buildReasoningProviderOptions', () => {
  it('returns undefined with no effort or a non-reasoning model', () => {
    expect(buildReasoningProviderOptions(entry('anthropic'), undefined)).toBe(
      undefined,
    )
    expect(
      buildReasoningProviderOptions(
        entry('anthropic', { reasoning: false }),
        'high',
      ),
    ).toBe(undefined)
  })

  it('modern Anthropic: adaptive thinking + 1:1 effort, off → disabled', () => {
    // `display:'summarized'` rides along wherever thinking is on — it's the
    // visibility flag the live thinking strip depends on (billing unchanged).
    expect(buildReasoningProviderOptions(entry('anthropic'), 'medium')).toEqual(
      {
        anthropic: {
          thinking: { type: 'adaptive', display: 'summarized' },
          effort: 'medium',
        },
      },
    )
    // max maps to Anthropic's native max (no silent xhigh promotion).
    expect(buildReasoningProviderOptions(entry('anthropic'), 'max')).toEqual({
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'max',
      },
    })
    expect(buildReasoningProviderOptions(entry('anthropic'), 'off')).toEqual({
      anthropic: { thinking: { type: 'disabled' } },
    })
  })

  it('always-on Anthropic (Fable 5): off clamps up to low effort', () => {
    const fable = entry('anthropic', { thinkingAlwaysOn: true })
    // `disabled` would 400 on Fable 5 — off resolves to the cheapest legal state.
    expect(buildReasoningProviderOptions(fable, 'off')).toEqual({
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'low',
      },
    })
    expect(buildReasoningProviderOptions(fable, 'high')).toEqual({
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'high',
      },
    })
  })

  it('budget Anthropic (Haiku 4.5): token budgets, off omits the block', () => {
    const haiku = entry('anthropic', {
      providerModelId: 'claude-haiku-4-5-20251001',
      thinkingApi: 'budget',
    })
    // Omitting `thinking` *is* off on pre-adaptive models.
    expect(buildReasoningProviderOptions(haiku, 'off')).toBe(undefined)
    expect(buildReasoningProviderOptions(haiku, 'high')).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 16384 } },
    })
    expect(buildReasoningProviderOptions(haiku, 'max')).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 32768 } },
    })
  })

  it('OpenAI: effort string with none as off, xhigh as its top', () => {
    expect(buildReasoningProviderOptions(entry('openai'), 'off')).toEqual({
      openai: { reasoningEffort: 'none' },
    })
    expect(buildReasoningProviderOptions(entry('openai'), 'high')).toEqual({
      openai: { reasoningEffort: 'high', reasoningSummary: 'auto' },
    })
    // OpenAI has no 'max' — clamps down to its top rung.
    expect(buildReasoningProviderOptions(entry('openai'), 'max')).toEqual({
      openai: { reasoningEffort: 'xhigh', reasoningSummary: 'auto' },
    })
  })

  it('Google: token budget with 0 as off, Pro-tier off clamps to a floor', () => {
    expect(buildReasoningProviderOptions(entry('google'), 'off')).toEqual({
      google: { thinkingConfig: { thinkingBudget: 0 } },
    })
    expect(buildReasoningProviderOptions(entry('google'), 'low')).toEqual({
      google: {
        thinkingConfig: { thinkingBudget: 1024, includeThoughts: true },
      },
    })
    expect(buildReasoningProviderOptions(entry('google'), 'max')).toEqual({
      google: {
        thinkingConfig: { thinkingBudget: 24576, includeThoughts: true },
      },
    })
    // Pro tiers reject thinkingBudget: 0 — off resolves to the minimal budget.
    expect(
      buildReasoningProviderOptions(
        entry('google', { thinkingAlwaysOn: true }),
        'off',
      ),
    ).toEqual({
      google: {
        thinkingConfig: { thinkingBudget: 128, includeThoughts: true },
      },
    })
  })

  it('Groq (gpt-oss): effort string with none as off, high as its top', () => {
    expect(buildReasoningProviderOptions(entry('groq'), 'off')).toEqual({
      groq: { reasoningEffort: 'none' },
    })
    expect(buildReasoningProviderOptions(entry('groq'), 'medium')).toEqual({
      groq: { reasoningEffort: 'medium', reasoningFormat: 'parsed' },
    })
    // Groq tops out at 'high' — max clamps down, never billed up.
    expect(buildReasoningProviderOptions(entry('groq'), 'max')).toEqual({
      groq: { reasoningEffort: 'high', reasoningFormat: 'parsed' },
    })
  })

  it('providers without a known reasoning surface fall through silently', () => {
    expect(buildReasoningProviderOptions(entry('ollama'), 'high')).toBe(
      undefined,
    )
    expect(buildReasoningProviderOptions(entry('openrouter'), 'low')).toBe(
      undefined,
    )
  })

  it('Default (no armed rung): visibility-only flags, never behaviour', () => {
    // OpenAI / Google / Groq: pure display opt-ins — effort/budget untouched.
    expect(buildReasoningProviderOptions(entry('openai'), undefined)).toEqual({
      openai: { reasoningSummary: 'auto' },
    })
    expect(buildReasoningProviderOptions(entry('google'), undefined)).toEqual({
      google: { thinkingConfig: { includeThoughts: true } },
    })
    expect(buildReasoningProviderOptions(entry('groq'), undefined)).toEqual({
      groq: { reasoningFormat: 'parsed' },
    })
    // Anthropic: only always-on models (explicit adaptive == their default
    // state); anything else could flip thinking on → stays untouched.
    expect(
      buildReasoningProviderOptions(
        entry('anthropic', { thinkingAlwaysOn: true }),
        undefined,
      ),
    ).toEqual({
      anthropic: { thinking: { type: 'adaptive', display: 'summarized' } },
    })
    expect(buildReasoningProviderOptions(entry('anthropic'), undefined)).toBe(
      undefined,
    )
    expect(
      buildReasoningProviderOptions(
        entry('anthropic', { thinkingApi: 'budget' }),
        undefined,
      ),
    ).toBe(undefined)
  })
})

describe('describeReasoningResolution', () => {
  it('describes the native resolution per provider', () => {
    expect(describeReasoningResolution(entry('anthropic'), 'max')).toBe(
      'max effort',
    )
    expect(describeReasoningResolution(entry('anthropic'), 'off')).toBe(
      'thinking off',
    )
    expect(
      describeReasoningResolution(
        entry('anthropic', { thinkingAlwaysOn: true }),
        'off',
      ),
    ).toBe('always thinks — low effort')
    expect(
      describeReasoningResolution(
        entry('anthropic', { thinkingApi: 'budget' }),
        'max',
      ),
    ).toBe('~32k thinking tokens')
    expect(describeReasoningResolution(entry('openai'), 'max')).toBe(
      'extra-high effort',
    )
    expect(describeReasoningResolution(entry('google'), 'medium')).toBe(
      '~4k thinking tokens',
    )
    expect(describeReasoningResolution(entry('groq'), 'max')).toBe(
      'high effort (its top)',
    )
  })

  it('covers the no-signal states', () => {
    expect(describeReasoningResolution(entry('anthropic'), undefined)).toBe(
      'provider default',
    )
    expect(
      describeReasoningResolution(entry('ollama', { reasoning: false }), 'high'),
    ).toBe('no thinking control')
    expect(describeReasoningResolution(entry('ollama'), 'high')).toBe(
      'no thinking control',
    )
  })
})
