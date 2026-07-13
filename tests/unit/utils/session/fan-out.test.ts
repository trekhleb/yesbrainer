import { describe, expect, it } from 'vitest'
import { fanOutSeats, seedPerSeatStreams } from '@/utils/session/fan-out'
import { seat } from '../../helpers/fixtures'

describe('seedPerSeatStreams', () => {
  it('starts every seat streaming with empty output', () => {
    const seeded = seedPerSeatStreams([seat('s1'), seat('s2', 'openai:gpt-5.4')])
    expect(seeded).toEqual({
      s1: {
        status: 'streaming',
        error: null,
        output: '',
        modelId: 'anthropic:claude-sonnet-5',
      },
      s2: {
        status: 'streaming',
        error: null,
        output: '',
        modelId: 'openai:gpt-5.4',
      },
    })
  })
})

describe('fanOutSeats', () => {
  it('pairs each seat with its result, in seat order', async () => {
    const outcomes = await fanOutSeats([seat('s1'), seat('s2')], (s) =>
      Promise.resolve(`ran ${s.id}`),
    )
    expect(outcomes).toEqual([
      { seat: expect.objectContaining({ id: 's1' }), result: 'ran s1' },
      { seat: expect.objectContaining({ id: 's2' }), result: 'ran s2' },
    ])
  })

  it('one seat rejecting never kills its siblings', async () => {
    const outcomes = await fanOutSeats(
      [seat('ok1'), seat('boom'), seat('ok2')],
      (s) =>
        s.id === 'boom'
          ? Promise.reject(new Error('provider exploded'))
          : Promise.resolve(s.id),
    )
    expect(outcomes.map((o) => o.result)).toEqual(['ok1', 'ok2'])
  })
})
