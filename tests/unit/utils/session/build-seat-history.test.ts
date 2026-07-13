import { describe, expect, it } from 'vitest'
import { buildSeatHistory } from '@/utils/session/build-seat-history'
import { participantEvent, seat, turn } from '../../helpers/fixtures'

const VISION_MODEL = 'openai:gpt-5.4'
const TEXT_ONLY_MODEL = 'groq:llama-3.3-70b'
const IMAGES = ['data:image/png;base64,AA']

describe('buildSeatHistory', () => {
  it('each seat sees only its own prior answers (no cross-contamination)', () => {
    const prior = turn({
      userMsg: 'q1',
      events: [
        participantEvent('mine', { output: 'my answer' }),
        participantEvent('other', { output: 'their answer' }),
      ],
    })
    const history = buildSeatHistory([prior], seat('mine'), 'q2')
    expect(history).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'my answer' },
      { role: 'user', content: 'q2' },
    ])
  })

  it('an errored prior answer leaves the user message unanswered', () => {
    const prior = turn({
      userMsg: 'q1',
      events: [participantEvent('mine', { error: 'failed' })],
    })
    const history = buildSeatHistory([prior], seat('mine'), 'q2')
    expect(history.map((m) => m.role)).toEqual(['user', 'user'])
  })

  it('in a debate turn, the seat’s LAST re-answer wins over round 1', () => {
    const prior = turn({
      userMsg: 'q1',
      events: [
        participantEvent('mine', { output: 'round 1 position' }),
        participantEvent('mine', {
          roleType: 'reanswer',
          round: 2,
          output: 'final position',
        }),
      ],
    })
    const history = buildSeatHistory([prior], seat('mine'), 'q2')
    expect(history[1]).toEqual({
      role: 'assistant',
      content: 'final position',
    })
  })

  it('replays images only into vision-capable seats — on every message', () => {
    const prior = turn({ userMsg: 'about this image', userImages: IMAGES })
    const forVision = buildSeatHistory(
      [prior],
      seat('v', VISION_MODEL),
      'next',
      IMAGES,
    )
    expect(forVision[0]?.images).toEqual(IMAGES)
    expect(forVision.at(-1)?.images).toEqual(IMAGES)

    const forTextOnly = buildSeatHistory(
      [prior],
      seat('t', TEXT_ONLY_MODEL),
      'next',
      IMAGES,
    )
    expect(forTextOnly.every((m) => !('images' in m))).toBe(true)
  })
})
