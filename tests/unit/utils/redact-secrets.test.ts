import { beforeEach, describe, expect, it } from 'vitest'
import { redactSecrets } from '@/utils/redact-secrets'

/** Seed the BYOK store the way the app writes it. */
function configureKeys(keys: Record<string, string>): void {
  localStorage.setItem('yesbrainer:keys', JSON.stringify(keys))
}

describe('redactSecrets', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('scrubs the exact configured key values, format-independent', () => {
    configureKeys({ anthropic: 'totally-custom-key-shape-12345' })
    expect(
      redactSecrets('request failed: totally-custom-key-shape-12345 rejected'),
    ).toBe('request failed: [redacted] rejected')
  })

  it('longest-first ordering keeps a prefix key from leaving a tail', () => {
    configureKeys({
      openai: 'shared-prefix-key',
      groq: 'shared-prefix-key-and-more',
    })
    expect(redactSecrets('sent shared-prefix-key-and-more')).toBe(
      'sent [redacted]',
    )
  })

  it('catches key-shaped strings even when not configured', () => {
    expect(redactSecrets('auth sk-abcdefghij0123456789 failed')).toBe(
      'auth [redacted] failed',
    )
    expect(redactSecrets('gsk_ABCDEFGHIJKLMNOP123 in header')).toBe(
      '[redacted] in header',
    )
    expect(redactSecrets('key AIzaSyABCDEFGHIJKLMNOPQRSTU sent')).toBe(
      'key [redacted] sent',
    )
  })

  it('preserves the header prefix while scrubbing its value', () => {
    expect(redactSecrets('Authorization: Bearer abc.def-ghi_jkl012')).toBe(
      'Authorization: Bearer [redacted]',
    )
    expect(redactSecrets('"x-api-key": "abcdefgh12345678"')).toBe(
      '"x-api-key": "[redacted]"',
    )
  })

  it('leaves innocuous prose intact', () => {
    const prose = 'The skater and the ask were fine; risk-free.'
    expect(redactSecrets(prose)).toBe(prose)
    expect(redactSecrets('')).toBe('')
  })
})
