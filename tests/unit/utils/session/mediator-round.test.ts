import { describe, expect, it } from 'vitest'
import {
  buildMediatorEvent,
  buildMediatorRoundPrompt,
} from '@/utils/session/mediator-round'
import { participantEvent } from '../../helpers/fixtures'

describe('buildMediatorRoundPrompt', () => {
  it('substitutes the round framing the live loop and the retry must share', () => {
    const prompt = buildMediatorRoundPrompt({
      template:
        'Q {question} | round {round}/{maxRounds}\n{answers}\nPRIOR:{priorTranscript}',
      userMsg: 'the question',
      labels: { A: 's1', B: 's2' },
      roundEvents: [
        participantEvent('s1', { output: 'pos 1' }),
        participantEvent('s2', { output: 'pos 2' }),
      ],
      priorRounds: [
        {
          round: 1,
          status: 'done',
          synthesis: 'earlier synthesis',
          convergent: false,
          error: null,
        },
      ],
      round: 2,
      maxRounds: 3,
      stripSelfId: true,
      priorTurns: undefined,
    })
    expect(prompt).toContain('Q the question | round 2/3')
    expect(prompt).toContain('Model A:\npos 1')
    expect(prompt).toContain('Model B:\npos 2')
    expect(prompt).toContain('earlier synthesis')
  })
})

describe('buildMediatorEvent', () => {
  it('persists the outcome with round metadata and conditional extras', () => {
    const ev = buildMediatorEvent({
      id: 'm1',
      modelId: 'x',
      round: 2,
      result: {
        synthesis: 'the take',
        convergent: false,
        divergencePoints: 'still split on Y',
        aborted: false,
        tokens: { input: 1, output: 2 },
      },
    })
    expect(ev).toMatchObject({
      roleType: 'mediator',
      round: 2,
      output: 'the take',
      mediator: {
        round: 2,
        convergent: false,
        divergencePoints: 'still split on Y',
      },
    })
    expect('error' in ev).toBe(false)

    const errored = buildMediatorEvent({
      id: 'm2',
      modelId: 'x',
      round: 1,
      result: {
        synthesis: '',
        convergent: false,
        aborted: false,
        error: 'failed',
        rawResponse: 'raw',
      },
    })
    expect(errored.error).toBe('failed')
    expect(errored.rawResponse).toBe('raw')
  })
})
