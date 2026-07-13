import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/utils/format-bytes'
import { formatTokenCount } from '@/utils/format-tokens'
import { sameSet } from '@/utils/same-set'
import { humanizeDimension } from '@/utils/dimension-label'
import { isOfficialHost } from '@/utils/official-host'
import { formatMediatorPriorRounds } from '@/utils/session/format-mediator-prior-rounds'
import {
  agreementLabel,
  agreementTextColor,
  agreementTooltip,
} from '@/utils/agreement'

describe('formatTokenCount', () => {
  it('keeps the decimal only while it carries signal', () => {
    expect(formatTokenCount(950)).toBe('950')
    expect(formatTokenCount(1_234)).toBe('1.2K')
    expect(formatTokenCount(19_300)).toBe('19K')
    expect(formatTokenCount(1_200_000)).toBe('1.2M')
    expect(formatTokenCount(12_000_000)).toBe('12M')
  })
})

describe('formatBytes', () => {
  it('walks the unit ladder with the under-10 decimal rule', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(47 * 1024 * 1024)).toBe('47 MB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB')
  })
})

describe('sameSet', () => {
  it('is order-independent and length-strict', () => {
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameSet(['a'], ['a', 'b'])).toBe(false)
    expect(sameSet(['a', 'b'], ['a', 'c'])).toBe(false)
    expect(sameSet([], [])).toBe(true)
  })
})

describe('dimension labels', () => {
  it('humanizes the first letter only', () => {
    expect(humanizeDimension('accuracy')).toBe('Accuracy')
    expect(humanizeDimension('clinical-correctness')).toBe(
      'Clinical-correctness',
    )
    expect(humanizeDimension('')).toBe('')
  })

})

describe('isOfficialHost', () => {
  it('accepts the production and dev hosts', () => {
    for (const h of [
      'yesbrainer.ai',
      'www.yesbrainer.ai',
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.20',
      '172.16.0.1',
      '172.31.9.9',
    ]) {
      expect(isOfficialHost(h), h).toBe(true)
    }
  })

  it('flags lookalikes and public hosts (the clone-guard)', () => {
    for (const h of [
      'yesbrainer.app',
      'yesbrainer.ai.evil.example',
      'notyesbrainer.ai',
      '172.32.0.1',
      '11.0.0.1',
      'yesbrainer.github.io',
    ]) {
      expect(isOfficialHost(h), h).toBe(false)
    }
  })
})

describe('formatMediatorPriorRounds', () => {
  it('compresses prior rounds, skipping errored ones', () => {
    const block = formatMediatorPriorRounds([
      {
        round: 1,
        status: 'done',
        synthesis: 'first take',
        convergent: false,
        divergencePoints: 'the split',
        error: null,
      },
      { round: 2, status: 'error', synthesis: '', error: 'x' },
    ])
    expect(block).toContain('Round 1 synthesis (not convergent)')
    expect(block).toContain('Divergence points flagged: the split')
    expect(block).not.toContain('Round 2')
    expect(formatMediatorPriorRounds([])).toBe('')
  })
})

describe('agreement display helpers', () => {
  it('maps levels to AA-safe colours, hiding the insufficient level', () => {
    expect(agreementTextColor('strong', false)).toBe('#047857')
    expect(agreementTextColor('divergent', true)).toBe('#f87171')
    expect(agreementTextColor('insufficient', false)).toBeNull()
    expect(agreementLabel('insufficient')).toBe('')
  })

  it('tooltips explain the stdev or the missing-signal case', () => {
    const base = {
      targetSeatId: 't',
      targetModelId: 'm',
      targetDisplayLabel: 'M',
      ratings: [],
      averages: null,
      meanStdev: null,
      agreement: 'insufficient' as const,
    }
    expect(agreementTooltip(base)).toContain('at least two voters')
    expect(
      agreementTooltip({ ...base, agreement: 'mixed', meanStdev: 0.75 }),
    ).toContain('0.75')
  })
})
