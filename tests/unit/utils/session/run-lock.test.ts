import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRunOwned, withRunLock } from '@/utils/session/run-lock'

/**
 * Run ownership is what stops two pages driving one turn — i.e. what stops
 * the user being billed twice for the same council. jsdom ships no Web
 * Locks, so the API is stubbed here rather than left untested: the
 * unsupported path is a real branch too (older WebKit), and the difference
 * between "couldn't take the lock" and "the work itself threw" is exactly
 * the distinction a careless fallback would collapse.
 */

const original = Object.getOwnPropertyDescriptor(navigator, 'locks')

function stubLocks(request: LockManager['request'] | undefined): void {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: request ? { request } : undefined,
  })
}

/** A manager whose lock is free: the callback gets a lock object. */
function freeManager(): LockManager['request'] {
  return (async (_name: string, _opts: unknown, cb: (l: unknown) => unknown) =>
    cb({ name: 'lock', mode: 'exclusive' })) as unknown as LockManager['request']
}

/** A manager whose lock is already held: `ifAvailable` passes `null`. */
function heldManager(): LockManager['request'] {
  return (async (_name: string, _opts: unknown, cb: (l: unknown) => unknown) =>
    cb(null)) as unknown as LockManager['request']
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'locks', original)
  else Reflect.deleteProperty(navigator, 'locks')
})

describe('isRunOwned', () => {
  it('claims nothing where Web Locks is unavailable, so a run can always be recovered', async () => {
    stubLocks(undefined)
    expect(await isRunOwned('t1')).toBe(false)
  })

  it('is false when the lock is free', async () => {
    stubLocks(freeManager())
    expect(await isRunOwned('t1')).toBe(false)
  })

  it('is true when another page holds it', async () => {
    stubLocks(heldManager())
    expect(await isRunOwned('t1')).toBe(true)
  })

  it('degrades to "not owned" when the API exists but refuses', async () => {
    stubLocks((() => Promise.reject(new Error('SecurityError'))) as never)
    expect(await isRunOwned('t1')).toBe(false)
  })
})

describe('withRunLock', () => {
  it('runs the work when the lock is free', async () => {
    stubLocks(freeManager())
    const fn = vi.fn().mockResolvedValue('done')
    expect(await withRunLock('t1', fn)).toBe('done')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('does not run the work when another page holds the lock', async () => {
    stubLocks(heldManager())
    const fn = vi.fn().mockResolvedValue('done')
    expect(await withRunLock('t1', fn)).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it('runs unguarded where Web Locks is unavailable', async () => {
    stubLocks(undefined)
    const fn = vi.fn().mockResolvedValue('done')
    expect(await withRunLock('t1', fn)).toBe('done')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('falls back to running unguarded when the lock cannot be acquired', async () => {
    stubLocks((() => Promise.reject(new Error('SecurityError'))) as never)
    const fn = vi.fn().mockResolvedValue('done')
    expect(await withRunLock('t1', fn)).toBe('done')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('propagates a failure from the work itself WITHOUT re-running it — `request` rejects for both reasons, and retrying here would run the user’s council turn a second time', async () => {
    stubLocks(freeManager())
    const fn = vi.fn().mockRejectedValue(new Error('the run failed'))
    await expect(withRunLock('t1', fn)).rejects.toThrow('the run failed')
    expect(fn).toHaveBeenCalledOnce()
  })
})
