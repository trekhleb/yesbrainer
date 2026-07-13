import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildVotingLabels,
  formatLabeledAnswers,
  labelsForVoter,
} from '@/utils/voting-labels'
import { participantEvent } from '../helpers/fixtures'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildVotingLabels', () => {
  it('assigns sequential letters covering every seat exactly once', () => {
    const labels = buildVotingLabels(['s1', 's2', 's3'])
    expect(Object.keys(labels).sort()).toEqual(['A', 'B', 'C'])
    expect(Object.values(labels).sort()).toEqual(['s1', 's2', 's3'])
  })

  it('shuffles the assignment (defeats cross-turn brand inference)', () => {
    // Force the Fisher–Yates picks deterministic: j = 0 every swap reverses
    // the head — enough to observe that identity order isn't guaranteed.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const labels = buildVotingLabels(['s1', 's2', 's3'])
    expect(labels['A']).not.toBe('s1')
  })

  it('rolls into two-letter labels past Z', () => {
    const ids = Array.from({ length: 28 }, (_, i) => `seat-${i}`)
    const labels = buildVotingLabels(ids)
    const keys = Object.keys(labels)
    expect(keys).toHaveLength(28)
    expect(keys).toContain('AA')
    expect(keys).toContain('AB')
  })
})

describe('labelsForVoter', () => {
  it('hides the voter’s own label', () => {
    const labels = { A: 's1', B: 's2', C: 's3' }
    expect(labelsForVoter(labels, 's2').sort()).toEqual(['A', 'C'])
  })
})

describe('formatLabeledAnswers', () => {
  const labels = { A: 's1', B: 's2' }

  it('labels every other seat’s answer and skips the voter and errored events', () => {
    const events = [
      participantEvent('s1', { output: 'first answer' }),
      participantEvent('s2', { output: 'second answer' }),
    ]
    const block = formatLabeledAnswers(labels, events, 's1', {
      stripSelfId: false,
    })
    expect(block).toBe('Model B:\nsecond answer')
  })

  it('keeps every entry when the voter id is empty (the Mediator view)', () => {
    const events = [
      participantEvent('s1', { output: 'one' }),
      participantEvent('s2', { output: 'two' }),
    ]
    const block = formatLabeledAnswers(labels, events, '', {
      stripSelfId: false,
    })
    expect(block).toContain('Model A:\none')
    expect(block).toContain('Model B:\ntwo')
    expect(block).toContain('\n\n---\n\n')
  })

  it('drops seats whose event errored or is missing', () => {
    const events = [participantEvent('s1', { error: 'boom' })]
    expect(formatLabeledAnswers(labels, events, '')).toBe('')
  })
})
