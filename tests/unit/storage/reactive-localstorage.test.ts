import { describe, expect, it, vi } from 'vitest'
import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'

interface Shape {
  name?: string
  count?: number
}

function makeAdapter(sanitize?: (v: Shape) => Shape) {
  return createReactiveLocalStorage<Shape>({
    storageKey: 'yesbrainer:test-shape',
    eventName: 'yesbrainer:test-shape-changed',
    defaultValue: {},
    ...(sanitize ? { sanitize } : {}),
  })
}

describe('createReactiveLocalStorage', () => {
  it('round-trips values and dispatches the in-tab change event', () => {
    const adapter = makeAdapter()
    const listener = vi.fn()
    window.addEventListener(adapter.eventName, listener)
    adapter.set({ name: 'x', count: 2 })
    expect(adapter.get()).toEqual({ name: 'x', count: 2 })
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(adapter.eventName, listener)
  })

  it('shape-guards corrupt payloads back to the default', () => {
    const adapter = makeAdapter()
    localStorage.setItem('yesbrainer:test-shape', 'not json {')
    expect(adapter.get()).toEqual({})
    localStorage.setItem('yesbrainer:test-shape', '[1,2,3]')
    expect(adapter.get()).toEqual({})
    localStorage.setItem('yesbrainer:test-shape', '"a string"')
    expect(adapter.get()).toEqual({})
  })

  it('applies the sanitize step on write', () => {
    const adapter = makeAdapter((v) => ({
      ...(v.name?.trim() ? { name: v.name.trim() } : {}),
    }))
    adapter.set({ name: '  padded  ', count: 9 })
    expect(adapter.get()).toEqual({ name: 'padded' })
  })

  it('a quota failure logs the key only — never the value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    try {
      const adapter = makeAdapter()
      expect(() => adapter.set({ name: 'sk-super-secret' })).not.toThrow()
      const logged = warn.mock.calls[0]?.join(' ') ?? ''
      expect(logged).toContain('yesbrainer:test-shape')
      expect(logged).not.toContain('sk-super-secret')
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('keys adapter integration', () => {
  it('trims pasted whitespace and drops empty keys on write', async () => {
    const { getApiKeys, setApiKeys } = await import('@/storage/keys')
    setApiKeys({ anthropic: '  sk-padded-key-123  ', openai: '   ' })
    expect(getApiKeys()).toEqual({ anthropic: 'sk-padded-key-123' })
  })
})
