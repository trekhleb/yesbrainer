import { beforeEach, describe, expect, it, vi } from 'vitest'
import { throttleAccumulated } from '@/utils/throttle-accumulated'

/**
 * The rate-limiter behind stream-render throttling. Time is driven by a controlled
 * `Date.now()` so the interval logic is deterministic (no real waiting).
 * `restoreMocks: true` (vitest config) restores `Date.now` after each test.
 */
describe('throttleAccumulated', () => {
  let now = 0
  beforeEach(() => {
    now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
  })

  it('emits the first value immediately (leading edge)', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('a')
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('a')
  })

  it('coalesces a burst within the interval down to the latest value', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('a') // leading edge → emit
    now += 10
    t.push('ab') // +10ms → dropped
    now += 10
    t.push('abc') // +20ms → dropped
    now += 45
    t.push('abcd') // +65ms since last emit → emit the latest
    expect(emit.mock.calls).toEqual([['a'], ['abcd']])
  })

  it('emits again once the interval has elapsed', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('x')
    now += 60
    t.push('xy')
    now += 60
    t.push('xyz')
    expect(emit.mock.calls).toEqual([['x'], ['xy'], ['xyz']])
  })

  it('flush() emits the final value even when the interval has not elapsed', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('a') // emit
    now += 5
    t.push('ab') // dropped (within interval)
    t.flush('ab') // forced final → emit
    expect(emit.mock.calls).toEqual([['a'], ['ab']])
  })

  it('flush() is idempotent — it never re-fires an already-painted value', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('a')
    now += 100
    t.push('final') // interval elapsed → emit
    t.flush('final') // same as the last emit → no-op
    expect(emit.mock.calls).toEqual([['a'], ['final']])
  })

  it('never loses the tail: flush emits the complete text after dropped frames', () => {
    const emit = vi.fn()
    const t = throttleAccumulated(emit, 60)
    t.push('The quick') // emit
    now += 20
    t.push('The quick brown') // dropped
    now += 20
    t.push('The quick brown fox') // dropped
    t.flush('The quick brown fox') // final → the full string is guaranteed
    expect(emit).toHaveBeenLastCalledWith('The quick brown fox')
  })
})
