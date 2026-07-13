import { describe, expect, it } from 'vitest'
import {
  aggregateInflightVotes,
  aggregateVotesByTarget,
  overallScore,
  winningTargetSeatId,
} from '@/utils/vote-leaderboard'
import { participantEvent, seat } from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

const seats = [seat('a'), seat('b'), seat('c')]

function voteEvent(voterId: string, entries: TurnEvent['vote']): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: entries,
  }
}

describe('aggregateVotesByTarget', () => {
  it('one entry per answering target, in answer order, with voter metadata', () => {
    const events: TurnEvent[] = [
      participantEvent('a'),
      participantEvent('b'),
      voteEvent('b', [
        { targetSeatId: 'a', ratings: { accuracy: 4, insight: 2 }, comment: 'ok' },
      ]),
    ]
    const entries = aggregateVotesByTarget(events, seats)
    expect(entries.map((e) => e.targetSeatId)).toEqual(['a', 'b'])
    expect(entries[0]?.ratings[0]?.voterSeatId).toBe('b')
    expect(entries[0]?.averages).toEqual({ accuracy: 4, insight: 2 })
    // Unrated target keeps an explicit empty entry.
    expect(entries[1]?.averages).toBeNull()
    expect(entries[1]?.agreement).toBe('insufficient')
  })

  it('errored answers are not targets; errored votes are not voters', () => {
    const events: TurnEvent[] = [
      participantEvent('a', { error: 'x' }),
      participantEvent('b'),
      voteEvent('c', undefined),
    ]
    const entries = aggregateVotesByTarget(events, seats)
    expect(entries.map((e) => e.targetSeatId)).toEqual(['b'])
    expect(entries[0]?.ratings).toEqual([])
  })

  it('averages over the union of dimensions; partial voters still count', () => {
    const events: TurnEvent[] = [
      participantEvent('a'),
      voteEvent('b', [
        { targetSeatId: 'a', ratings: { accuracy: 5 }, comment: '' },
      ]),
      voteEvent('c', [
        { targetSeatId: 'a', ratings: { accuracy: 3, insight: 4 }, comment: '' },
      ]),
    ]
    const [entry] = aggregateVotesByTarget(events, seats)
    expect(entry?.averages).toEqual({ accuracy: 4, insight: 4 })
    // stdev(accuracy 5,3)=1; insight has one rater → 0; mean 0.5 → mixed.
    expect(entry?.agreement).toBe('mixed')
  })

  it('classifies agreement from mean stdev on the 1–5 scale', () => {
    const unanimous: TurnEvent[] = [
      participantEvent('a'),
      voteEvent('b', [{ targetSeatId: 'a', ratings: { q: 4 }, comment: '' }]),
      voteEvent('c', [{ targetSeatId: 'a', ratings: { q: 4 }, comment: '' }]),
    ]
    expect(aggregateVotesByTarget(unanimous, seats)[0]?.agreement).toBe(
      'strong',
    )
  })
})

describe('overallScore / winningTargetSeatId', () => {
  it('equal-weight mean across dimensions picks the winner; ties keep answer order', () => {
    const events: TurnEvent[] = [
      participantEvent('a'),
      participantEvent('b'),
      voteEvent('c', [
        { targetSeatId: 'a', ratings: { accuracy: 5, insight: 3 }, comment: '' },
        { targetSeatId: 'b', ratings: { accuracy: 4, insight: 4 }, comment: '' },
      ]),
    ]
    const entries = aggregateVotesByTarget(events, seats)
    expect(overallScore(entries[0]!)).toBe(4)
    expect(overallScore(entries[1]!)).toBe(4)
    expect(winningTargetSeatId(entries)).toBe('a')
  })

  it('returns null with no rated targets', () => {
    const entries = aggregateVotesByTarget([participantEvent('a')], seats)
    expect(overallScore(entries[0]!)).toBeNull()
    expect(winningTargetSeatId(entries)).toBeNull()
  })
})

describe('aggregateInflightVotes', () => {
  it('voters are the targets, ordered by seat order, filling in as votes land', () => {
    const entries = aggregateInflightVotes(
      [
        { seatId: 'b', modelId: 'm', vote: null },
        {
          seatId: 'a',
          modelId: 'm',
          vote: [{ targetSeatId: 'b', ratings: { q: 5 }, comment: '' }],
        },
      ],
      seats,
    )
    expect(entries.map((e) => e.targetSeatId)).toEqual(['a', 'b'])
    expect(entries[1]?.averages).toEqual({ q: 5 })
    expect(entries[0]?.averages).toBeNull()
  })
})
