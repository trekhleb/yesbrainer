/**
 * Capture the browser's PWA install prompt.
 *
 * The `beforeinstallprompt` event fires when Chrome / Edge / Android
 * Chrome have decided the page meets PWA install criteria. Stashing
 * the event lets us call `.prompt()` later from a button click —
 * which is the only way to surface the native install UI on demand.
 *
 * Other browsers don't fire this event:
 *  - iOS Safari: no programmatic prompt; users go via Share → Add to
 *    Home Screen. The hook returns `null` for `prompt` on those
 *    platforms; the calling button is hidden.
 *  - Firefox desktop: PWA install is configured via about:config and
 *    skips the event entirely. Same null return.
 *
 * `installed` flips true once the user actually accepts the prompt
 * (via the `appinstalled` event) so the button can self-hide.
 */

import { useCallback, useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt(): {
  prompt: (() => Promise<'accepted' | 'dismissed' | 'unavailable'>) | null
  installed: boolean
} {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(display-mode: standalone)').matches
  })

  useEffect(() => {
    function onBefore(e: Event) {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!event) return 'unavailable' as const
    await event.prompt()
    const { outcome } = await event.userChoice
    // Single-use: clear regardless of outcome — Chrome refires the
    // event on next eligible page load if the user dismissed.
    setEvent(null)
    return outcome
  }, [event])

  return {
    prompt: event ? prompt : null,
    installed,
  }
}
