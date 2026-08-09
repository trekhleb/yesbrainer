import { describe, expect, it } from 'vitest'
import {
  classifyInterruption,
  isNetworkClassError,
  watchVisibility,
} from '@/utils/session/interruption'

/**
 * Misclassifying here is expensive in both directions: call a real provider
 * failure an interruption and the app quietly re-bills the user for it;
 * call an interruption a failure and the council shows a wall of red for
 * something that didn't fail.
 */

describe('isNetworkClassError', () => {
  it.each([
    ['Safari fetch', 'Load failed'],
    ['iOS suspend', 'The network connection was lost.'],
    ['Chromium fetch', 'TypeError: Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['dropped socket', 'socket hang up'],
    ['Chrome net error', 'net::ERR_INTERNET_DISCONNECTED'],
  ])('recognises %s', (_label, message) => {
    expect(isNetworkClassError(message)).toBe(true)
  })

  it('matches inside the longer sentence the runners actually persist', () => {
    expect(
      isNetworkClassError(
        'Mediator (openai:gpt-5.4) failed: TypeError: Load failed',
      ),
    ).toBe(true)
  })

  it.each([
    ['a rate limit', 'provider returned 429 Too Many Requests'],
    ['a bad key', 'provider returned 401 invalid x-api-key'],
    ['a schema failure', 'failed to produce valid structured output'],
    ['a server error', 'provider returned 503 overloaded'],
  ])('leaves %s alone', (_label, message) => {
    expect(isNetworkClassError(message)).toBe(false)
  })

  it('does not claim a user-pressed Stop — the runners report aborts separately, and folding them in here would turn every cancel into an offer to resume', () => {
    expect(isNetworkClassError('The operation was aborted.')).toBe(false)
    expect(isNetworkClassError('AbortError')).toBe(false)
  })
})

describe('classifyInterruption', () => {
  const never = { lastHiddenAt: () => 0 }

  it('is null with no error at all', () => {
    expect(
      classifyInterruption({ error: undefined, startedAt: 0, watch: never }),
    ).toBeNull()
  })

  it('is null for a genuine provider failure', () => {
    expect(
      classifyInterruption({
        error: 'provider returned 500',
        startedAt: 0,
        watch: never,
      }),
    ).toBeNull()
  })

  it('reports a dropped transport on a page that stayed visible', () => {
    expect(
      classifyInterruption({
        error: 'Load failed',
        startedAt: 1_000,
        watch: never,
      }),
    ).toBe('connection')
  })

  it('reports backgrounding when the page hid while the call was in flight', () => {
    expect(
      classifyInterruption({
        error: 'Load failed',
        startedAt: 1_000,
        watch: { lastHiddenAt: () => 1_500 },
      }),
    ).toBe('backgrounded')
  })

  it('does not blame an earlier backgrounding for a later call — the run may have been away and come back long before this request was even issued', () => {
    expect(
      classifyInterruption({
        error: 'Load failed',
        startedAt: 2_000,
        watch: { lastHiddenAt: () => 1_000 },
      }),
    ).toBe('connection')
  })
})

describe('watchVisibility', () => {
  it('reports nothing hidden while the page stays visible', () => {
    const watch = watchVisibility()
    expect(watch.lastHiddenAt()).toBe(0)
    watch.dispose()
  })

  it('records the transition — reading visibilityState at failure time would be too late, since a suspended page is visible again by the moment its promises reject', () => {
    const watch = watchVisibility()
    const original = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'visibilityState',
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(watch.lastHiddenAt()).toBeGreaterThan(0)

    if (original) {
      Object.defineProperty(Document.prototype, 'visibilityState', original)
    }
    // @ts-expect-error -- removing the instance shim restores the prototype's
    delete document.visibilityState
    watch.dispose()
  })

  it('stops recording once disposed', () => {
    const watch = watchVisibility()
    watch.dispose()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(watch.lastHiddenAt()).toBe(0)
    // @ts-expect-error -- see above
    delete document.visibilityState
  })
})
