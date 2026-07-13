import { describe, expect, it, vi } from 'vitest'
import { APICallError, NoObjectGeneratedError } from 'ai'
import {
  describeProviderFailure,
  effectiveSystemPrompt,
  imageContentBlocks,
  promptContent,
  runFailure,
  samplingCallOptions,
} from '@/providers/run-support'
import type { ModelEntry } from '@/models/registry'
import { fullUsage } from '../helpers/ai-mock'

function entry(over: Partial<ModelEntry['capabilities']> = {}): ModelEntry {
  return {
    modelId: 'test:model',
    label: 'Test model',
    provider: 'anthropic',
    providerModelId: 'model',
    tier: 'paid',
    country: 'USA',
    developer: 'Test',
    contextWindow: 100_000,
    capabilities: { tools: false, vision: false, reasoning: false, ...over },
    defaultSystemPrompt: 'default prompt',
  }
}

describe('samplingCallOptions', () => {
  it('keeps unset knobs absent, not explicit undefined', () => {
    const opts = samplingCallOptions({ entry: entry() })
    expect(Object.keys(opts)).toEqual([])
  })

  it('passes set knobs through and folds reasoning into providerOptions', () => {
    const opts = samplingCallOptions({
      entry: entry({ reasoning: true }),
      temperature: 0.3,
      maxOutputTokens: 500,
      reasoningEffort: 'low',
    })
    expect(opts.temperature).toBe(0.3)
    expect(opts.maxOutputTokens).toBe(500)
    expect(opts.providerOptions).toEqual({
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'low',
      },
    })
  })

  it('drops the reasoning effort for non-reasoning models', () => {
    const opts = samplingCallOptions({
      entry: entry({ reasoning: false }),
      reasoningEffort: 'high',
    })
    expect(opts.providerOptions).toBeUndefined()
  })
})

describe('promptContent / imageContentBlocks', () => {
  it('keeps the plain-prompt path without images', () => {
    expect(promptContent('hello', undefined)).toEqual({ prompt: 'hello' })
    expect(promptContent('hello', [])).toEqual({ prompt: 'hello' })
  })

  it('builds one multi-modal user message with images', () => {
    expect(promptContent('look', ['data:image/png;base64,AA'])).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', image: 'data:image/png;base64,AA' },
          ],
        },
      ],
    })
    expect(imageContentBlocks('t', ['a', 'b'])).toHaveLength(3)
  })
})

describe('effectiveSystemPrompt', () => {
  it('an override wins; blank overrides cascade down', () => {
    expect(effectiveSystemPrompt('custom', 'fallback')).toBe('custom')
    expect(effectiveSystemPrompt('   ', 'fallback')).toBe('fallback')
    expect(effectiveSystemPrompt(undefined, 'fallback')).toBe('fallback')
  })
})

describe('runFailure', () => {
  it('an abort is silent — no log, no message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = new AbortController()
    controller.abort()
    expect(
      runFailure(new Error('x'), controller.signal, 'site', 'm'),
    ).toEqual({ aborted: true })
    expect(warn).not.toHaveBeenCalled()
  })

  it('anything else logs redacted and returns a redacted message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failure = runFailure(
      new Error('denied for Bearer abc.def-ghi_jkl012'),
      new AbortController().signal,
      'runX',
      'test:model',
    )
    expect(failure).toEqual({
      aborted: false,
      message: 'denied for Bearer [redacted]',
    })
    expect(warn).toHaveBeenCalledOnce()
    const line = warn.mock.calls[0]?.join(' ') ?? ''
    expect(line).toContain('[runX]')
    expect(line).not.toContain('abc.def-ghi_jkl012')
  })
})

describe('describeProviderFailure', () => {
  it('marks schema failures unrecoverable and surfaces the redacted raw text', () => {
    const err = new NoObjectGeneratedError({
      message: 'no object',
      text: 'raw model text with sk-abcdefghij0123456789 inside',
      response: { id: 'resp', timestamp: new Date(0), modelId: 'm' },
      usage: fullUsage(),
      finishReason: 'error',
    })
    const failure = describeProviderFailure(err, 'Mediator', 'test:model')
    expect(failure.unrecoverable).toBe(true)
    expect(failure.error).toContain('Mediator (test:model)')
    expect(failure.error).toContain('structured output')
    expect(failure.rawResponse).toContain('[redacted]')
    expect(failure.rawResponse).not.toContain('sk-abcdefghij0123456789')
  })

  it('classifies 4xx as unrecoverable and 5xx as retryable', () => {
    const clientErr = new APICallError({
      message: 'bad request',
      url: 'https://api.example',
      requestBodyValues: {},
      statusCode: 401,
      responseBody: '{"error":"key sk-abcdefghij0123456789"}',
    })
    const c = describeProviderFailure(clientErr, 'Voter', 'm')
    expect(c.unrecoverable).toBe(true)
    expect(c.error).toContain('401')
    expect(c.rawResponse).not.toContain('sk-abcdefghij0123456789')

    const serverErr = new APICallError({
      message: 'overloaded',
      url: 'https://api.example',
      requestBodyValues: {},
      statusCode: 529,
    })
    const s = describeProviderFailure(serverErr, 'Voter', 'm')
    expect(s.unrecoverable).toBeUndefined()
    expect(s.error).toContain('529')
  })

  it('falls back to a generic message + inspectable dump for unknown throws', () => {
    const failure = describeProviderFailure(
      { weird: 'shape', message: 'strange failure' },
      'Judge',
      'm',
    )
    expect(failure.error).toContain('Judge (m) failed: strange failure')
    expect(failure.rawResponse).toContain('weird')
  })
})
