import { describe, expect, it } from 'vitest'
import { toTokenUsage } from '@/providers/token-usage'

describe('toTokenUsage', () => {
  it('maps a complete usage report', () => {
    expect(toTokenUsage({ inputTokens: 3, outputTokens: 7 })).toEqual({
      input: 3,
      output: 7,
    })
  })

  it('returns undefined rather than fabricating zeros', () => {
    expect(toTokenUsage(undefined)).toBeUndefined()
    expect(toTokenUsage({})).toBeUndefined()
    expect(toTokenUsage({ inputTokens: 3 })).toBeUndefined()
  })
})
