import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from '@/hooks/use-install-prompt'

function fireBeforeInstall(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  e.prompt = vi.fn().mockResolvedValue(undefined)
  e.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(e)
  return e
}

describe('useInstallPrompt', () => {
  it('exposes no prompt until the browser offers one', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.prompt).toBeNull()
  })

  it('captures the event, prompts on demand, and clears after use', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    let evt!: ReturnType<typeof fireBeforeInstall>
    act(() => {
      evt = fireBeforeInstall('accepted')
    })
    await waitFor(() => expect(result.current.prompt).not.toBeNull())

    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.prompt!()
    })
    expect(evt.prompt).toHaveBeenCalledOnce()
    expect(outcome).toBe('accepted')
    // Single-use: the prompt clears itself.
    expect(result.current.prompt).toBeNull()
  })

  it('flips installed on the appinstalled event', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    await waitFor(() => expect(result.current.installed).toBe(true))
  })
})
