import { describe, expect, it } from 'vitest'
import {
  addTokens,
  EMPTY_TOKENS,
  subtractTokens,
  summarizeEvents,
} from '@/utils/token-totals'
import { participantEvent } from '../helpers/fixtures'

describe('summarizeEvents', () => {
  it('sums provider-reported tokens and skips events without any', () => {
    const events = [
      participantEvent('s1', { tokens: { input: 10, output: 5 } }),
      participantEvent('s2'), // aborted before usage arrived — contributes nothing
      participantEvent('s3', { tokens: { input: 1, output: 2 } }),
    ]
    expect(summarizeEvents(events)).toEqual({
      inputTokens: 11,
      outputTokens: 7,
    })
  })

  it('returns a fresh zero total for no events (never the shared sentinel)', () => {
    const total = summarizeEvents([])
    expect(total).toEqual(EMPTY_TOKENS)
    expect(total).not.toBe(EMPTY_TOKENS)
  })
})

describe('addTokens / subtractTokens', () => {
  it('adds componentwise', () => {
    expect(
      addTokens({ inputTokens: 1, outputTokens: 2 }, { inputTokens: 3, outputTokens: 4 }),
    ).toEqual({ inputTokens: 4, outputTokens: 6 })
  })

  it('subtraction floors at zero — a stale delta can never go negative', () => {
    expect(
      subtractTokens(
        { inputTokens: 1, outputTokens: 2 },
        { inputTokens: 5, outputTokens: 1 },
      ),
    ).toEqual({ inputTokens: 0, outputTokens: 1 })
  })
})
