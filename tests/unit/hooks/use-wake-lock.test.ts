import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '@/hooks/use-wake-lock'

/**
 * The wake lock removes the commonest *cause* of an interrupted run — a
 * phone put down mid-debate and auto-locked. jsdom ships no Screen Wake
 * Lock, so it's stubbed: the failure paths (unsupported engine, a refused
 * request) all have to be silent, and the release-on-teardown paths are
 * where a leaked lock would keep someone's screen on after their council
 * finished.
 */

const original = Object.getOwnPropertyDescriptor(navigator, 'wakeLock')

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  /** Fire the sentinel's own `release` event, which is how a real browser
   *  tells the page it took the lock back (it does so on every hide). */
  fireRelease: () => void
}

function makeSentinel(): FakeSentinel {
  const listeners: (() => void)[] = []
  return {
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((_event: string, cb: () => void) =>
      listeners.push(cb),
    ),
    fireRelease: () => listeners.forEach((cb) => cb()),
  }
}

function stubWakeLock(
  request: (() => Promise<unknown>) | undefined,
): void {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: request ? { request } : undefined,
  })
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'wakeLock', original)
  else Reflect.deleteProperty(navigator, 'wakeLock')
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('useWakeLock', () => {
  it('takes the lock while a run is active', async () => {
    const sentinel = makeSentinel()
    const request = vi.fn().mockResolvedValue(sentinel)
    stubWakeLock(request)
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
  })

  it('takes nothing when no run is active', () => {
    const request = vi.fn()
    stubWakeLock(request)
    renderHook(() => useWakeLock(false))
    expect(request).not.toHaveBeenCalled()
  })

  it('does nothing at all on an engine without the API', () => {
    stubWakeLock(undefined)
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()
  })

  it('swallows a refused request — no user activation, battery saver, and other perfectly normal refusals must never surface', async () => {
    const request = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    stubWakeLock(request)
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(request).toHaveBeenCalled())
  })

  it('releases when the run ends', async () => {
    const sentinel = makeSentinel()
    stubWakeLock(vi.fn().mockResolvedValue(sentinel))
    const hook = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await waitFor(() => expect(sentinel.addEventListener).toHaveBeenCalled())
    hook.rerender({ active: false })
    expect(sentinel.release).toHaveBeenCalled()
  })

  it('releases a lock that arrives after teardown, so it cannot outlive the run that asked for it', async () => {
    const sentinel = makeSentinel()
    let settle: ((s: FakeSentinel) => void) | undefined
    stubWakeLock(
      vi.fn().mockReturnValue(
        new Promise<FakeSentinel>((resolve) => {
          settle = resolve
        }),
      ),
    )
    const hook = renderHook(() => useWakeLock(true))
    hook.unmount()
    settle?.(sentinel)
    await waitFor(() => expect(sentinel.release).toHaveBeenCalled())
  })

  it('re-takes the lock when the page comes back, since the browser drops it on hide', async () => {
    const first = makeSentinel()
    const request = vi.fn().mockResolvedValue(first)
    stubWakeLock(request)
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(first.addEventListener).toHaveBeenCalled())

    // Hiding: the browser reclaims the lock and says so. No new request —
    // a hidden page cannot hold one.
    setVisibility('hidden')
    first.fireRelease()
    expect(request).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })
})
