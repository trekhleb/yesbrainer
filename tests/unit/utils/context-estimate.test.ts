import { describe, expect, it } from 'vitest'
import { estimateContextUsage } from '@/utils/context-estimate'
import {
  council,
  participantEvent,
  seat,
  turn,
} from '../helpers/fixtures'

describe('estimateContextUsage', () => {
  it('returns null for an empty roster', () => {
    expect(estimateContextUsage(council({ seats: [] }), 'q')).toBeNull()
  })

  it('estimates chars/4 with per-message overhead and reports the worst seat', () => {
    // ollama:llama3.1 has an 8k window — the worst seat by percentage
    // next to a 200k-class cloud model.
    const c = council({
      seats: [seat('small', 'ollama:llama3.1'), seat('big')],
      turns: [
        turn({
          userMsg: 'x'.repeat(4000),
          events: [
            participantEvent('small', { output: 'y'.repeat(4000) }),
          ],
        }),
      ],
    })
    const hint = estimateContextUsage(c, 'the next question')
    expect(hint?.seatId).toBe('small')
    expect(hint?.max).toBe(8192)
    expect(hint?.used).toBeGreaterThan(2000) // ~1000 + ~1000 + overheads
    expect(hint?.pct).toBeGreaterThan(0.2)
    expect(hint?.pct).toBeLessThanOrEqual(1)
  })

  it('counts an explicit system prompt at its real size', () => {
    const base = council({ seats: [seat('s', 'ollama:llama3.1')] })
    const withPrompt = council({
      seats: [
        {
          ...seat('s', 'ollama:llama3.1'),
          config: { systemPrompt: 'p'.repeat(8000) },
        },
      ],
    })
    const small = estimateContextUsage(base, 'q')
    const big = estimateContextUsage(withPrompt, 'q')
    expect((big?.used ?? 0) - (small?.used ?? 0)).toBeGreaterThan(1500)
  })

  it('clamps the percentage at 100%', () => {
    const c = council({
      seats: [seat('s', 'ollama:llama3.1')],
    })
    const hint = estimateContextUsage(c, 'z'.repeat(80_000))
    expect(hint?.pct).toBe(1)
  })
})
