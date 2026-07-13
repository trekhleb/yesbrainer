import { describe, expect, it } from 'vitest'
import { replaceEventInCouncil } from '@/utils/session/replace-event-local'
import { council, participantEvent, turn } from '../../helpers/fixtures'

describe('replaceEventInCouncil', () => {
  it('swaps the event in place and re-aggregates both token totals', () => {
    const errored = participantEvent('s1', {
      id: 'target',
      error: 'boom',
      output: '',
    })
    const sibling = participantEvent('s2', {
      tokens: { input: 10, output: 10 },
    })
    const t = turn({ id: 't1', events: [errored, sibling] })
    const c = council({
      turns: [t],
      tokenTotal: { inputTokens: 20, outputTokens: 20 },
    })

    const retried = participantEvent('s1', {
      id: 'target',
      output: 'recovered',
      tokens: { input: 5, output: 5 },
    })
    const next = replaceEventInCouncil(c, 't1', retried)

    const nextTurn = next.turns[0]
    expect(nextTurn?.events.find((e) => e.id === 'target')?.output).toBe(
      'recovered',
    )
    // Turn total re-sums its events; council total moves by the delta.
    expect(nextTurn?.tokenTotal).toEqual({ inputTokens: 15, outputTokens: 15 })
    expect(next.tokenTotal).toEqual({ inputTokens: 25, outputTokens: 25 })
  })

  it('returns the council unchanged (same reference) when nothing matches', () => {
    const c = council({ turns: [turn({ id: 't1', events: [] })] })
    const stray = participantEvent('s9', { id: 'not-there' })
    expect(replaceEventInCouncil(c, 't1', stray)).toBe(c)
    expect(replaceEventInCouncil(c, 'missing-turn', stray)).toBe(c)
  })
})
