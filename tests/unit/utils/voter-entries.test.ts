import { describe, expect, it } from 'vitest'
import {
  findJudgeEvent,
  mergeVoterEntries,
  voterEntriesFromVotingTurn,
} from '@/utils/voter-entries'
import { participantEvent, synthesisEvent, turn } from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

function voteEvent(voterId: string, over: Partial<TurnEvent> = {}): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: [{ targetSeatId: 'x', ratings: { q: 3 }, comment: '' }],
    ...over,
  }
}

describe('findJudgeEvent', () => {
  it('returns the judge event or null', () => {
    expect(findJudgeEvent(turn({ events: [] }))).toBeNull()
    const judge = synthesisEvent('judge')
    expect(findJudgeEvent(turn({ events: [judge] }))).toBe(judge)
  })
})

describe('mergeVoterEntries', () => {
  const persistedTurn = turn({
    id: 't1',
    events: [
      voteEvent('v1'),
      voteEvent('v2', { error: 'failed', vote: undefined }),
    ],
  })

  it('derives entries from persisted vote events without an overlay', () => {
    const entries = mergeVoterEntries(persistedTurn, null)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ voterSeatId: 'v1', status: 'done' })
    expect(entries[1]).toMatchObject({
      voterSeatId: 'v2',
      status: 'error',
      error: 'failed',
    })
  })

  it('the retry overlay replaces matching voters and leaves the rest', () => {
    const entries = mergeVoterEntries(persistedTurn, {
      id: 't1',
      votingLabels: {},
      perVoter: {
        v2: {
          status: 'voting',
          error: null,
          vote: null,
          modelId: 'm',
          rawResponse: null,
        },
      },
    })
    expect(entries[0]?.status).toBe('done')
    expect(entries[1]).toMatchObject({ voterSeatId: 'v2', status: 'voting' })
  })
})

describe('voterEntriesFromVotingTurn', () => {
  it('maps the in-flight per-voter map to renderable entries', () => {
    const entries = voterEntriesFromVotingTurn({
      id: 't1',
      votingLabels: {},
      perVoter: {
        a: {
          status: 'voting',
          error: null,
          vote: null,
          modelId: 'm',
          rawResponse: null,
        },
      },
    })
    expect(entries).toEqual([
      {
        key: 't1:a:vote',
        voterSeatId: 'a',
        modelId: 'm',
        status: 'voting',
        error: null,
        vote: null,
        rawResponse: null,
      },
    ])
  })
})
