import { describe, expect, it, vi } from 'vitest'
import {
  abortAllCouncilStreams,
  abortCouncilStreams,
  getStreamingCouncilIds,
  registerCouncilStream,
  releaseCouncilStream,
  subscribeCouncilStreams,
} from '@/utils/session/active-streams'

describe('active-streams registry', () => {
  it('aborts every controller registered for the council', () => {
    const a = new AbortController()
    const b = new AbortController()
    registerCouncilStream('c1', a)
    registerCouncilStream('c1', b)
    abortCouncilStreams('c1')
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(true)
    releaseCouncilStream('c1', a)
    releaseCouncilStream('c1', b)
  })

  it('scopes aborts to the council id', () => {
    const mine = new AbortController()
    const other = new AbortController()
    registerCouncilStream('c1', mine)
    registerCouncilStream('c2', other)
    abortCouncilStreams('c1')
    expect(mine.signal.aborted).toBe(true)
    expect(other.signal.aborted).toBe(false)
    releaseCouncilStream('c1', mine)
    releaseCouncilStream('c2', other)
  })

  it('released controllers are no longer aborted', () => {
    const settled = new AbortController()
    registerCouncilStream('c1', settled)
    releaseCouncilStream('c1', settled)
    abortCouncilStreams('c1')
    expect(settled.signal.aborted).toBe(false)
  })

  it('abort and release are no-ops for unknown councils', () => {
    expect(() => abortCouncilStreams('missing')).not.toThrow()
    expect(() =>
      releaseCouncilStream('missing', new AbortController()),
    ).not.toThrow()
  })

  it('abortAllCouncilStreams aborts every controller across all councils', () => {
    const a = new AbortController()
    const b = new AbortController()
    const c = new AbortController()
    registerCouncilStream('c1', a)
    registerCouncilStream('c1', b)
    registerCouncilStream('c2', c)
    abortAllCouncilStreams()
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(true)
    expect(c.signal.aborted).toBe(true)
    releaseCouncilStream('c1', a)
    releaseCouncilStream('c1', b)
    releaseCouncilStream('c2', c)
    // Empty registry → no-op, no throw.
    expect(() => abortAllCouncilStreams()).not.toThrow()
  })

  it('exposes the busy-council ids as a stable snapshot (the sidebar feed)', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCouncilStreams(listener)
    const idle = getStreamingCouncilIds()
    expect(idle.size).toBe(0)

    const a = new AbortController()
    const b = new AbortController()
    registerCouncilStream('c1', a)
    expect(getStreamingCouncilIds().has('c1')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    // A second run on the same council changes nothing observable — the
    // snapshot keeps its identity (what `useSyncExternalStore` compares)
    // and subscribers stay quiet.
    const afterFirst = getStreamingCouncilIds()
    registerCouncilStream('c1', b)
    expect(getStreamingCouncilIds()).toBe(afterFirst)
    expect(listener).toHaveBeenCalledTimes(1)
    releaseCouncilStream('c1', a)
    expect(getStreamingCouncilIds()).toBe(afterFirst)
    expect(listener).toHaveBeenCalledTimes(1)

    // The last release clears the id and notifies.
    releaseCouncilStream('c1', b)
    expect(getStreamingCouncilIds().has('c1')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    registerCouncilStream('c1', a)
    expect(listener).toHaveBeenCalledTimes(2)
    releaseCouncilStream('c1', a)
  })
})
