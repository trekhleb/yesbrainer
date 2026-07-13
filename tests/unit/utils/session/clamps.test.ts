import { describe, expect, it } from 'vitest'
import {
  clampMediatorRounds,
  clampMinCommentLength,
} from '@/utils/session/clamps'

describe('clampMediatorRounds', () => {
  it('clamps into 1–5 and floors fractions', () => {
    expect(clampMediatorRounds(0)).toBe(1)
    expect(clampMediatorRounds(3.9)).toBe(3)
    expect(clampMediatorRounds(99)).toBe(5)
  })

  it('falls back to the default on a hand-edited non-finite value', () => {
    expect(clampMediatorRounds(Number.NaN)).toBeGreaterThanOrEqual(1)
    expect(clampMediatorRounds(Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(5)
  })
})

describe('clampMinCommentLength', () => {
  it('clamps into 0–2000 (the vote schema’s cap)', () => {
    expect(clampMinCommentLength(-5)).toBe(0)
    expect(clampMinCommentLength(120.7)).toBe(120)
    expect(clampMinCommentLength(99_999)).toBe(2000)
  })
})
