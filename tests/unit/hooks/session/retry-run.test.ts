import { describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import {
  replaceRetriedEvent,
  runSessionRetry,
} from '@/hooks/session/retry-run'
import { abortCouncilStreams } from '@/utils/session/active-streams'
import { replaceEvent } from '@/storage/councils'
import { council, participantEvent, turn } from '../../helpers/fixtures'

vi.mock('@/storage/councils', () => ({ replaceEvent: vi.fn() }))
const replaceEventMock = vi.mocked(replaceEvent)

function ref(): MutableRefObject<AbortController | null> {
  return { current: null }
}

describe('runSessionRetry', () => {
  it('wires the controller into abortRef and the per-council registry', async () => {
    const abortRef = ref()
    let observed: AbortSignal | undefined
    await runSessionRetry(
      'c1',
      abortRef,
      (signal) => {
        observed = signal
        expect(abortRef.current?.signal).toBe(signal)
        // The delete flow can reach this run while it's in flight.
        abortCouncilStreams('c1')
        expect(signal.aborted).toBe(true)
        return Promise.resolve()
      },
      () => {},
    )
    expect(observed).toBeDefined()
    expect(abortRef.current).toBeNull()
  })

  it('releases everything even when the body throws, after onSettled', async () => {
    const abortRef = ref()
    const order: string[] = []
    await expect(
      runSessionRetry(
        'c1',
        abortRef,
        () => {
          order.push('body')
          throw new Error('boom')
        },
        () => order.push('settled'),
      ),
    ).rejects.toThrow('boom')
    expect(order).toEqual(['body', 'settled'])
    expect(abortRef.current).toBeNull()
    // Registry released: a late delete-abort has nothing left to cancel.
    expect(() => abortCouncilStreams('c1')).not.toThrow()
  })
})

describe('replaceRetriedEvent', () => {
  it('persists then mirrors into local state', async () => {
    replaceEventMock.mockResolvedValue(undefined)
    const errored = participantEvent('s1', { id: 'target', error: 'x' })
    const c = council({ turns: [turn({ id: 't1', events: [errored] })] })
    const setCouncil = vi.fn()
    const next = participantEvent('s1', { id: 'target', output: 'fixed' })

    await replaceRetriedEvent({
      councilId: c.id,
      turnId: 't1',
      event: next,
      site: 'test',
      setCouncil,
    })
    expect(replaceEventMock).toHaveBeenCalledWith(c.id, 't1', next)
    const updater = setCouncil.mock.calls[0]?.[0] as (
      cur: typeof c | null,
    ) => typeof c | null
    expect(updater(c)?.turns[0]?.events[0]?.output).toBe('fixed')
    expect(updater(null)).toBeNull()
  })

  it('a failed write logs and leaves local state untouched', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    replaceEventMock.mockRejectedValue(new Error('idb gone'))
    const setCouncil = vi.fn()
    await replaceRetriedEvent({
      councilId: 'c1',
      turnId: 't1',
      event: participantEvent('s1'),
      site: 'retryX',
      setCouncil,
    })
    expect(setCouncil).not.toHaveBeenCalled()
    expect(error.mock.calls[0]?.[0]).toContain('[retryX]')
  })
})
