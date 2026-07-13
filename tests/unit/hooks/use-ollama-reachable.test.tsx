import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { setOllamaEnabled } from '@/storage/ollama'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOllamaReachable', () => {
  it('never touches the network while the opt-in is off', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { result } = renderHook(() => useOllamaReachable())
    expect(result.current).toEqual({
      enabled: false,
      reachable: false,
      checked: true,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('pings the daemon and reports reachable when it answers', async () => {
    setOllamaEnabled(true)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
    const { result } = renderHook(() => useOllamaReachable())
    await waitFor(() => expect(result.current.checked).toBe(true))
    expect(result.current).toEqual({
      enabled: true,
      reachable: true,
      checked: true,
    })
  })

  it('treats a refused connection as not running', async () => {
    setOllamaEnabled(true)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const { result } = renderHook(() => useOllamaReachable())
    await waitFor(() => expect(result.current.checked).toBe(true))
    expect(result.current.reachable).toBe(false)
  })
})
