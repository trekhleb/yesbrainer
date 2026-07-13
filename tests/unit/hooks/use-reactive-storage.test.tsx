import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useReactiveStorage } from '@/hooks/use-reactive-storage'
import { useApiKeys } from '@/hooks/use-api-keys'
import { keysAdapter, setApiKeys } from '@/storage/keys'

describe('useReactiveStorage', () => {
  it('reads the current value and re-renders on the adapter’s custom event', () => {
    const { result } = renderHook(() => useReactiveStorage(keysAdapter))
    expect(result.current).toEqual({})
    act(() => setApiKeys({ anthropic: 'k1' }))
    expect(result.current).toEqual({ anthropic: 'k1' })
  })

  it('also refreshes on the cross-tab storage event', () => {
    const { result } = renderHook(() => useApiKeys())
    localStorage.setItem('yesbrainer:keys', JSON.stringify({ openai: 'k2' }))
    act(() => {
      window.dispatchEvent(new Event('storage'))
    })
    expect(result.current).toEqual({ openai: 'k2' })
  })
})
