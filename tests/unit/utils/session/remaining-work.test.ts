import { describe, expect, it } from 'vitest'
import {
  isUsableAnswer,
  pendingReanswerSeats,
  readTurnProgress,
} from '@/utils/session/remaining-work'
import { MODEL_B, participantEvent, seat } from '../../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

/**
 * This module decides what a resume re-issues. Getting it wrong doesn't
 * throw — it silently either re-bills the user for work the turn already
 * holds, or drops work and calls the turn finished. So the tests are
 * written around that one invariant: **a persisted event means done, its
 * absence means pending**, per role.
 */

const seats = [seat('s1'), seat('s2', MODEL_B)]

function voteEvent(seatId: string, over: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: `v-${seatId}`,
    roleType: 'vote',
    seatId,
    modelId: MODEL_B,
    output: '',
    ts: 1,
    vote: [],
    ...over,
  }
}

function mediatorEvent(round: number, over: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: `m-${round}`,
    roleType: 'mediator',
    modelId: MODEL_B,
    output: `round ${round}`,
    ts: 1,
    round,
    mediator: { round, convergent: false },
    ...over,
  }
}

function reanswerEvent(
  seatId: string,
  round: number,
  over: Partial<TurnEvent> = {},
): TurnEvent {
  return {
    id: `r-${seatId}-${round}`,
    roleType: 'reanswer',
    seatId,
    modelId: MODEL_B,
    output: 'reconsidered',
    ts: 1,
    round,
    ...over,
  }
}

describe('readTurnProgress — answers', () => {
  it('treats every seat as pending when nothing is persisted', () => {
    const p = readTurnProgress({ activeSeats: seats, events: [] })
    expect(p.pendingAnswerSeats.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(p.respondingSeats).toEqual([])
  })

  it('only the seat with no event is pending', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [participantEvent('s1', { output: 'answered' })],
    })
    expect(p.pendingAnswerSeats.map((s) => s.id)).toEqual(['s2'])
    expect(p.respondingSeats.map((s) => s.id)).toEqual(['s1'])
  })

  it('an errored answer is done, not pending — a resume must not silently re-bill a real provider failure the user can retry deliberately', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [
        participantEvent('s1', { output: '', error: 'provider 500' }),
        participantEvent('s2', { output: 'answered' }),
      ],
    })
    expect(p.pendingAnswerSeats).toEqual([])
    // ...but it contributes no voice to the deliberation that follows.
    expect(p.respondingSeats.map((s) => s.id)).toEqual(['s2'])
  })

  it('an empty successful answer is done but not a responder', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [participantEvent('s1', { output: '' })],
    })
    expect(p.pendingAnswerSeats.map((s) => s.id)).toEqual(['s2'])
    expect(p.respondingSeats).toEqual([])
  })
})

describe('readTurnProgress — trial', () => {
  const answered = [
    participantEvent('s1', { output: 'a' }),
    participantEvent('s2', { output: 'b' }),
  ]

  it('every responder owes a vote when none landed', () => {
    const p = readTurnProgress({ activeSeats: seats, events: answered })
    expect(p.pendingVoterSeats.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(p.judgeDone).toBe(false)
  })

  it('a persisted vote retires that voter, errored or not', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [
        ...answered,
        voteEvent('s1'),
        voteEvent('s2', { error: 'bad json' }),
      ],
    })
    expect(p.pendingVoterSeats).toEqual([])
  })

  it('a judge event — even an errored one — counts as done', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [
        ...answered,
        {
          id: 'j',
          roleType: 'judge',
          modelId: MODEL_B,
          output: '',
          ts: 1,
          error: 'provider 500',
        },
      ],
    })
    expect(p.judgeDone).toBe(true)
  })
})

describe('readTurnProgress — consensus', () => {
  const answered = [
    participantEvent('s1', { output: 'a' }),
    participantEvent('s2', { output: 'b' }),
  ]

  it('rebuilds mediator rounds keyed by round, preserving the convergence verdict the loop reads to decide whether to continue', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [
        ...answered,
        mediatorEvent(1, {
          mediator: { round: 1, convergent: false, divergencePoints: 'x' },
        }),
        mediatorEvent(2, { mediator: { round: 2, convergent: true } }),
      ],
    })
    expect([...p.consensus.rounds.keys()]).toEqual([1, 2])
    expect(p.consensus.rounds.get(1)?.convergent).toBe(false)
    expect(p.consensus.rounds.get(1)?.divergencePoints).toBe('x')
    expect(p.consensus.rounds.get(2)?.convergent).toBe(true)
  })

  it('marks a replayed round errored so the two-consecutive-errors break still applies after a resume', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [...answered, mediatorEvent(1, { error: 'provider 500' })],
    })
    expect(p.consensus.rounds.get(1)?.status).toBe('error')
    expect(p.consensus.rounds.get(1)?.error).toBe('provider 500')
  })

  it('buckets re-answers by round', () => {
    const p = readTurnProgress({
      activeSeats: seats,
      events: [
        ...answered,
        mediatorEvent(1),
        reanswerEvent('s1', 2),
        reanswerEvent('s2', 2),
        reanswerEvent('s1', 3),
      ],
    })
    expect(p.consensus.reanswers.get(2)?.length).toBe(2)
    expect(p.consensus.reanswers.get(3)?.length).toBe(1)
  })
})

describe('pendingReanswerSeats', () => {
  it('is every responder for a round with nothing persisted', () => {
    const pending = pendingReanswerSeats(
      { rounds: new Map(), reanswers: new Map() },
      2,
      seats,
    )
    expect(pending.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('excludes seats that already re-answered that round — the half-finished fan-out case an interruption actually produces', () => {
    const pending = pendingReanswerSeats(
      { rounds: new Map(), reanswers: new Map([[2, [reanswerEvent('s1', 2)]]]) },
      2,
      seats,
    )
    expect(pending.map((s) => s.id)).toEqual(['s2'])
  })

  it('scopes by round — answering round 2 doesn’t excuse a seat from round 3', () => {
    const progress = {
      rounds: new Map(),
      reanswers: new Map([[2, [reanswerEvent('s1', 2)]]]),
    }
    expect(pendingReanswerSeats(progress, 3, seats).map((s) => s.id)).toEqual([
      's1',
      's2',
    ])
  })
})

describe('isUsableAnswer', () => {
  /**
   * Exported and tested on its own because three phases consult it and a
   * drifted copy decides double-billing: a seat one phase counts as having
   * answered and another counts as pending gets re-run and re-charged.
   */
  it('accepts an answer with text and no error', () => {
    expect(isUsableAnswer(participantEvent('s1', { output: 'a' }))).toBe(true)
  })

  it('rejects an errored answer even when it carries text', () => {
    expect(
      isUsableAnswer(
        participantEvent('s1', { output: 'partial', error: 'provider 500' }),
      ),
    ).toBe(false)
  })

  it('rejects an empty answer', () => {
    expect(isUsableAnswer(participantEvent('s1', { output: '' }))).toBe(false)
  })
})
