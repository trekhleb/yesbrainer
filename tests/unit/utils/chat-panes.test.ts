import { describe, expect, it } from 'vitest'
import {
  consensusRoundsForMediating,
  consensusRoundsForTurn,
  panesForStreamingTurn,
  panesForTurn,
} from '@/utils/chat-panes'
import {
  participantEvent,
  seat,
  synthesisEvent,
  turn,
} from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'

const VISION = 'openai:gpt-5.4'
const TEXT_ONLY = 'groq:llama-3.3-70b'

describe('panesForTurn', () => {
  it('one pane per seated answer, seat order, with tool calls when present', () => {
    const seats = [seat('a'), seat('b')]
    const t = turn({
      events: [
        participantEvent('b', { output: 'B says' }),
        participantEvent('a', {
          output: 'A says',
          toolCalls: [{ name: 'web_search' }],
        }),
      ],
    })
    const panes = panesForTurn(t, seats)
    expect(panes.map((p) => p.seatId)).toEqual(['a', 'b'])
    expect(panes[0]?.toolCalls).toEqual([{ name: 'web_search' }])
    expect(panes[1]?.status).toBe('done')
  })

  it('ghosts a non-vision seat skipped on an image turn; drops other absences', () => {
    const seats = [seat('answered', VISION), seat('skipped', TEXT_ONLY)]
    const withImages = turn({
      events: [participantEvent('answered')],
      userImages: ['data:image/png;base64,AA'],
    })
    const panes = panesForTurn(withImages, seats)
    expect(panes).toHaveLength(2)
    expect(panes[1]?.ghostReason).toContain("doesn't support image inputs")

    const textTurn = turn({ events: [participantEvent('answered')] })
    expect(panesForTurn(textTurn, seats)).toHaveLength(1)
  })
})

describe('panesForStreamingTurn', () => {
  it('mirrors the in-flight per-seat state including streaming status', () => {
    const seats = [seat('a')]
    const panes = panesForStreamingTurn(
      {
        id: 't1',
        userMsg: 'q',
        perSeat: {
          a: { status: 'streaming', error: null, output: 'so far', modelId: 'm' },
        },
      },
      seats,
    )
    expect(panes[0]).toMatchObject({ status: 'streaming', output: 'so far' })
  })

  it('carries the live thinking feed on in-flight panes only', () => {
    const seats = [seat('a')]
    const streaming = panesForStreamingTurn(
      {
        id: 't1',
        userMsg: 'q',
        perSeat: {
          a: {
            status: 'streaming',
            error: null,
            output: '',
            modelId: 'm',
            reasoning: 'weighing the options…',
          },
        },
      },
      seats,
    )
    expect(streaming[0]?.reasoning).toBe('weighing the options…')
    // Persisted turns have no reasoning field at all — live-only contract.
    const persisted = panesForTurn(
      turn({ events: [participantEvent('a')] }),
      seats,
    )
    expect(persisted[0]).not.toHaveProperty('reasoning')
  })

  it('ghosts a non-vision seat with no stream on an image-bearing turn', () => {
    const seats = [seat('answered', VISION), seat('skipped', TEXT_ONLY)]
    const panes = panesForStreamingTurn(
      {
        id: 't1',
        userMsg: 'q',
        userImages: ['data:image/png;base64,AA'],
        perSeat: {
          answered: {
            status: 'done',
            error: null,
            output: 'seen',
            modelId: VISION,
          },
        },
      },
      seats,
    )
    expect(panes).toHaveLength(2)
    expect(panes[1]?.ghostReason).toContain("doesn't support image inputs")

    // No images → the un-streamed seat is simply absent, not ghosted.
    const noImages = panesForStreamingTurn(
      {
        id: 't1',
        userMsg: 'q',
        perSeat: {
          answered: { status: 'done', error: null, output: 'x', modelId: VISION },
        },
      },
      seats,
    )
    expect(noImages).toHaveLength(1)
  })
})

describe('consensusRoundsForTurn', () => {
  function mediatorEvent(
    round: number,
    over: Partial<TurnEvent> = {},
  ): TurnEvent {
    return synthesisEvent('mediator', {
      round,
      mediator: { round, convergent: round === 2 },
      ...over,
    })
  }

  it('groups rounds: fan-out + mediator, re-answers + mediator', () => {
    const seats = [seat('a'), seat('b')]
    const t = turn({
      votingLabels: { A: 'a', B: 'b' },
      events: [
        participantEvent('a', { output: 'pos A' }),
        participantEvent('b', { output: 'pos B' }),
        mediatorEvent(1, { output: 'Model A and Model B disagree' }),
        {
          ...participantEvent('a', { output: 'revised A' }),
          roleType: 'reanswer',
          round: 2,
        },
        mediatorEvent(2, { output: 'Consensus reached' }),
      ],
    })
    const rounds = consensusRoundsForTurn(t, seats)
    expect(rounds).toHaveLength(2)
    expect(rounds[0]?.answerPanes).toHaveLength(2)
    expect(rounds[0]?.mediator?.convergent).toBe(false)
    expect(rounds[1]?.answerPanes.map((p) => p.output)).toEqual(['revised A'])
    expect(rounds[1]?.mediator?.convergent).toBe(true)
  })

  it('de-anonymizes Model X references into real seat names for display', () => {
    const seats = [seat('a'), seat('b', 'openai:gpt-5.4')]
    const t = turn({
      votingLabels: { A: 'a', B: 'b' },
      events: [
        participantEvent('a'),
        participantEvent('b'),
        mediatorEvent(1, {
          output: 'Model B made the stronger case',
          mediator: {
            round: 1,
            convergent: false,
            roundDigest: {
              summary: 'Model B moved',
              movements: [
                { label: 'B', stance: 'shifted', note: 'Model B softened' },
                { label: 'Model Z', stance: 'held', note: 'unknown label' },
              ],
            },
          },
        }),
      ],
    })
    const [round1] = consensusRoundsForTurn(t, seats)
    expect(round1?.mediator?.synthesis).not.toContain('Model B')
    expect(round1?.mediator?.synthesis).toContain('GPT-5.4')
    const movements = round1?.mediator?.digest?.movements
    expect(movements?.[0]?.displayLabel).toContain('GPT-5.4')
    expect(movements?.[0]?.note).not.toContain('Model B')
    // Unresolvable labels degrade to a cleaned fallback, never crash.
    expect(movements?.[1]?.displayLabel).toBe('Model Z')
  })
})

describe('consensusRoundsForMediating', () => {
  it('interleaves the live fan-out, mediator outcomes, and re-answer streams', () => {
    const seats = [seat('a')]
    const rounds = consensusRoundsForMediating(
      {
        id: 't1',
        userMsg: 'q',
        perSeat: {
          a: { status: 'done', error: null, output: 'pos', modelId: 'm' },
        },
      },
      {
        id: 't1',
        modelId: 'med-model',
        maxRounds: 3,
        currentRound: 2,
        rounds: [
          {
            round: 1,
            status: 'done',
            synthesis: 'split',
            convergent: false,
            error: null,
          },
          { round: 2, status: 'mediating', synthesis: '', error: null },
        ],
        reanswers: {
          2: {
            a: {
              status: 'streaming',
              error: null,
              output: 'rethinking…',
              modelId: 'm',
            },
          },
        },
        labels: { A: 'a' },
        status: 'mediating',
      },
      seats,
    )
    expect(rounds).toHaveLength(2)
    expect(rounds[0]?.mediator?.status).toBe('done')
    expect(rounds[1]?.mediator?.status).toBe('mediating')
    expect(rounds[1]?.answerPanes[0]?.output).toBe('rethinking…')
  })
})
