import { describe, expect, it } from 'vitest'
import { resolveAnonymizedLabel } from '@/utils/session/anonymized-label'

const VALID = new Set(['A', 'B', 'AA'])

describe('resolveAnonymizedLabel', () => {
  it('passes exact labels straight through', () => {
    expect(resolveAnonymizedLabel('A', VALID)).toBe('A')
    expect(resolveAnonymizedLabel('AA', VALID)).toBe('AA')
  })

  it('strips the decorations models actually emit', () => {
    expect(resolveAnonymizedLabel('Model A', VALID)).toBe('A')
    expect(resolveAnonymizedLabel('model_b', VALID)).toBe('B')
    expect(resolveAnonymizedLabel('Participant B', VALID)).toBe('B')
    expect(resolveAnonymizedLabel('  a  ', VALID)).toBe('A')
    expect(resolveAnonymizedLabel('"B"', VALID)).toBe('B')
    expect(resolveAnonymizedLabel('answer: A', VALID)).toBe('A')
  })

  it('rejects values that resolve to no known label', () => {
    expect(resolveAnonymizedLabel('C', VALID)).toBe(null)
    expect(resolveAnonymizedLabel('Model Z', VALID)).toBe(null)
    expect(resolveAnonymizedLabel('42', VALID)).toBe(null)
    expect(resolveAnonymizedLabel('', VALID)).toBe(null)
  })

  it('rejects non-strings a hostile structured output could carry', () => {
    expect(
      resolveAnonymizedLabel(42 as unknown as string, VALID),
    ).toBe(null)
  })
})
