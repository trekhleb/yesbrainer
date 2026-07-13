import { describe, expect, it } from 'vitest'
import {
  agreementLabel,
  agreementTextColor,
  agreementTooltip,
} from '@/utils/agreement'
import type {
  AgreementLevel,
  LeaderboardEntry,
} from '@/utils/vote-leaderboard'

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    targetSeatId: 's1',
    targetModelId: 'openai:gpt-5.4',
    targetDisplayLabel: 'GPT-4o',
    ratings: [],
    averages: null,
    meanStdev: null,
    agreement: 'insufficient',
    ...over,
  }
}

describe('agreementTextColor', () => {
  it('maps every level to an AA-safe colour, light and dark', () => {
    const levels: AgreementLevel[] = ['strong', 'mixed', 'divergent']
    for (const level of levels) {
      expect(agreementTextColor(level, false)).toMatch(/^#[0-9a-f]{6}$/)
      expect(agreementTextColor(level, true)).toMatch(/^#[0-9a-f]{6}$/)
    }
    // Dark/light differ so the token actually adapts.
    expect(agreementTextColor('mixed', true)).not.toBe(
      agreementTextColor('mixed', false),
    )
    // No signal → no colour.
    expect(agreementTextColor('insufficient', false)).toBeNull()
  })
})

describe('agreementLabel', () => {
  it('names each level; the no-signal level is empty', () => {
    expect(agreementLabel('strong')).toBe('Strong agreement')
    expect(agreementLabel('mixed')).toBe('Mixed agreement')
    expect(agreementLabel('divergent')).toBe('Divergent views')
    expect(agreementLabel('insufficient')).toBe('')
  })
})

describe('agreementTooltip', () => {
  it('explains the too-few-voters case when there is no stdev', () => {
    const tip = agreementTooltip(entry({ agreement: 'insufficient' }))
    expect(tip).toContain('at least two voters')
  })

  it('reports the mean stdev on the 1–5 scale when present', () => {
    const tip = agreementTooltip(
      entry({ agreement: 'strong', meanStdev: 0.234 }),
    )
    expect(tip).toContain('Strong agreement')
    expect(tip).toContain('0.23')
    expect(tip).toContain('1–5 scale')
  })
})
