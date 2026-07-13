import { describe, expect, it } from 'vitest'
import {
  isFinishedEvent,
  isTurnShareable,
  latestShareableTurn,
} from '@/utils/shareability'
import {
  participantEvent,
  synthesisEvent,
  turn,
} from '../helpers/fixtures'

describe('isFinishedEvent', () => {
  it('requires no error and non-empty output', () => {
    expect(isFinishedEvent(participantEvent('s1'))).toBe(true)
    expect(isFinishedEvent(participantEvent('s1', { error: 'boom' }))).toBe(
      false,
    )
    expect(isFinishedEvent(participantEvent('s1', { output: '' }))).toBe(false)
  })
})

describe('isTurnShareable', () => {
  it('parallel-shaped structures share on any finished answer', () => {
    const t = turn({ events: [participantEvent('s1')] })
    expect(isTurnShareable(t, 'roundtable')).toBe(true)
    expect(isTurnShareable(t, 'custom')).toBe(true)
  })

  it('trial shares only on a finished judge event', () => {
    const answersOnly = turn({ events: [participantEvent('s1')] })
    expect(isTurnShareable(answersOnly, 'trial')).toBe(false)
    const withVerdict = turn({
      events: [participantEvent('s1'), synthesisEvent('judge')],
    })
    expect(isTurnShareable(withVerdict, 'trial')).toBe(true)
    const erroredVerdict = turn({
      events: [participantEvent('s1'), synthesisEvent('judge', { error: 'x' })],
    })
    expect(isTurnShareable(erroredVerdict, 'trial')).toBe(false)
  })

  it('consensus shares only on a finished mediator event', () => {
    const t = turn({
      events: [participantEvent('s1'), synthesisEvent('mediator')],
    })
    expect(isTurnShareable(t, 'consensus')).toBe(true)
    expect(isTurnShareable(turn({ events: [] }), 'consensus')).toBe(false)
  })
})

describe('latestShareableTurn', () => {
  it('scans from the end and returns the newest shareable turn', () => {
    const older = turn({ idx: 0, events: [participantEvent('s1')] })
    const newerUnshareable = turn({ idx: 1, events: [] })
    expect(
      latestShareableTurn([older, newerUnshareable], 'roundtable'),
    ).toBe(older)
  })

  it('returns undefined when nothing is shareable', () => {
    expect(latestShareableTurn([turn({ events: [] })], 'trial')).toBe(
      undefined,
    )
  })
})
