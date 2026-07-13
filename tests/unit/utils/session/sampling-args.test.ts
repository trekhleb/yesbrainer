import { describe, expect, it } from 'vitest'
import {
  resolveReasoningEffort,
  samplingArgs,
} from '@/utils/session/sampling-args'
import { seat } from '../../helpers/fixtures'

describe('samplingArgs', () => {
  it('spreads only the knobs that are set', () => {
    expect(samplingArgs({})).toEqual({})
    expect(
      samplingArgs({ temperature: 0, maxOutputTokens: 100 }),
    ).toEqual({ temperature: 0, maxOutputTokens: 100 })
  })

  it('a per-call effort override wins over the seat config', () => {
    expect(samplingArgs({ reasoningEffort: 'low' }, 'high')).toEqual({
      reasoningEffort: 'high',
    })
    expect(samplingArgs({ reasoningEffort: 'low' })).toEqual({
      reasoningEffort: 'low',
    })
  })
})

describe('resolveReasoningEffort', () => {
  it('applies the turn override only where the model can reason', () => {
    // openai:gpt-5.4 is a reasoning model; groq:llama-3.3-70b is not
    // (registry facts — the Groq Llamas are the only native non-reasoning
    // models left).
    const reasoningSeat = {
      ...seat('s1', 'openai:gpt-5.4'),
      config: { reasoningEffort: 'low' as const },
    }
    expect(resolveReasoningEffort(reasoningSeat, 'high')).toBe('high')
    expect(resolveReasoningEffort(reasoningSeat, undefined)).toBe('low')

    const plainSeat = {
      ...seat('s2', 'groq:llama-3.3-70b'),
      config: { reasoningEffort: 'low' as const },
    }
    expect(resolveReasoningEffort(plainSeat, 'high')).toBe('low')
  })

  it('takes synthesiser slots too — Judge / Mediator carry no seat id', () => {
    // The composer override governs every role's calls, so the resolver is
    // typed against the shared `modelId` + `config` shape, not `Seat`.
    const judge = {
      modelId: 'openai:gpt-5.4',
      config: { reasoningEffort: 'low' as const },
    }
    expect(resolveReasoningEffort(judge, 'max')).toBe('max')
    const textOnlyMediator = { modelId: 'groq:llama-3.3-70b', config: {} }
    expect(resolveReasoningEffort(textOnlyMediator, 'max')).toBeUndefined()
  })
})
