import { describe, expect, it, vi } from 'vitest'
import { extractErrorMessage, logRedactedError } from '@/utils/extract-error'

describe('extractErrorMessage', () => {
  it('handles the shapes providers actually throw', () => {
    expect(extractErrorMessage(new Error('plain'))).toBe('plain')
    expect(extractErrorMessage('just a string')).toBe('just a string')
    expect(extractErrorMessage({ message: 'enveloped' })).toBe('enveloped')
    expect(extractErrorMessage({ error: 'flat error field' })).toBe(
      'flat error field',
    )
    expect(
      extractErrorMessage({ error: { message: 'nested envelope' } }),
    ).toBe('nested envelope')
    expect(extractErrorMessage({ cause: { message: 'via cause' } })).toBe(
      'via cause',
    )
    expect(extractErrorMessage({ other: 1 })).toBe('{"other":1}')
    expect(extractErrorMessage(undefined)).toBe('undefined')
  })

  it('always redacts — the string is persisted and exported', () => {
    expect(
      extractErrorMessage(new Error('auth sk-abcdefghij0123456789 failed')),
    ).toBe('auth [redacted] failed')
  })

  it('survives unserializable objects', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(extractErrorMessage(circular)).toBe('Unknown error')
  })
})

describe('logRedactedError', () => {
  it('logs a greppable site tag + scrubbed description, never the raw object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = Object.assign(new Error('boom'), {
      responseBody: 'body with gsk_ABCDEFGHIJKLMNOP123 key',
      cause: new Error('root cause'),
    })
    logRedactedError('runVoteGeneration', err, 'test:model')
    expect(warn).toHaveBeenCalledOnce()
    const [tag, description] = warn.mock.calls[0] ?? []
    expect(String(tag)).toBe('[runVoteGeneration] test:model:')
    expect(String(description)).toContain('Error: boom')
    expect(String(description)).toContain('[redacted]')
    expect(String(description)).toContain('cause: root cause')
    expect(String(description)).not.toContain('gsk_ABCDEFGHIJKLMNOP123')
  })
})
