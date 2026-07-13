import { describe, expect, it } from 'vitest'
import {
  buildJudgeContext,
  formatPriorTurnsForSynthesis,
} from '@/utils/judge-context'
import {
  participantEvent,
  seat,
  synthesisEvent,
  turn,
} from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

const seats = [seat('a'), seat('b')]

function voteEvent(voterId: string, comment: string): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: [{ targetSeatId: 'a', ratings: { accuracy: 4 }, comment }],
  }
}

describe('buildJudgeContext', () => {
  it('names full answers and renders the leaderboard + comment blocks', () => {
    const events = [
      participantEvent('a', { output: 'answer A' }),
      participantEvent('b', { output: 'answer B' }),
      voteEvent('b', 'sharp reasoning'),
    ]
    const subs = buildJudgeContext(events, seats)
    expect(subs.answers).toContain(':\nanswer A')
    expect(subs.answers).toContain(':\nanswer B')
    expect(subs.leaderboard).toContain('accuracy 4.0 (n=1)')
    expect(subs.leaderboard).toContain('no peer ratings')
    expect(subs.comments).toContain('"sharp reasoning"')
  })

  it('suppresses the leaderboard / comments when toggled off', () => {
    const events = [participantEvent('a'), voteEvent('b', 'hi')]
    const subs = buildJudgeContext(events, seats, {
      showLeaderboard: false,
      showComments: false,
    })
    expect(subs.leaderboard).toBe('')
    expect(subs.comments).toBe('')
  })

  it('prepends the compressed prior-turns block when provided', () => {
    const prior = turn({
      idx: 0,
      userMsg: 'earlier question',
      events: [synthesisEvent('judge', { output: 'earlier verdict' })],
    })
    const subs = buildJudgeContext([participantEvent('a')], seats, {
      priorTurns: [prior],
    })
    expect(subs.answers).toMatch(/^PRIOR TURNS/)
    expect(subs.answers).toContain('earlier verdict')
    expect(subs.answers).toContain('CURRENT TURN')
  })
})

describe('formatPriorTurnsForSynthesis', () => {
  it('returns empty with no qualifying prior synthesis', () => {
    expect(formatPriorTurnsForSynthesis([], 'judge')).toBe('')
    const noSynthesis = turn({ events: [participantEvent('a')] })
    expect(formatPriorTurnsForSynthesis([noSynthesis], 'judge')).toBe('')
  })

  it('for consensus, the highest non-errored mediator round is the final word', () => {
    const t = turn({
      idx: 2,
      userMsg: 'debated question',
      events: [
        synthesisEvent('mediator', {
          output: 'round 1 take',
          mediator: { round: 1, convergent: false },
        }),
        synthesisEvent('mediator', {
          output: 'final take',
          mediator: { round: 3, convergent: true },
        }),
        synthesisEvent('mediator', {
          output: 'ignored — errored',
          error: 'x',
          mediator: { round: 4, convergent: false },
        }),
      ],
    })
    const block = formatPriorTurnsForSynthesis([t], 'mediator')
    expect(block).toContain('Turn 3')
    expect(block).toContain('final take')
    expect(block).not.toContain('round 1 take')
    expect(block).not.toContain('ignored')
  })
})
