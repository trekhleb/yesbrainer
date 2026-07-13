/**
 * Ollama status — the opt-in toggle (Settings → Keys) plus a live daemon
 * ping (`GET localhost:11434/api/tags`).
 *
 * Ollama support is opt-in, default off (see `storage/ollama.ts` for why):
 * while the toggle is off this hook **never touches the network** and
 * reports a settled "nothing there" state, so the rest of the app hides
 * Ollama entirely — no picker rows, no onboarding mentions, no probes.
 *
 * When enabled, reachability is the real ping: unlike cloud providers
 * (optimistically "reachable" whenever a key is configured), Ollama has no
 * key to check, so the only honest signal is whether the local daemon
 * actually answers. This drives the first-run onboarding gate, the
 * New-council seat default, the model pickers' grey-out, and the inline
 * status on the Keys page. Re-pings when the tab regains focus — the user
 * may have just started Ollama elsewhere.
 */

import { useEffect, useState } from 'react'
import { useReactiveStorage } from '@/hooks/use-reactive-storage'
import { ollamaAdapter } from '@/storage/ollama'

const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags'
const PING_TIMEOUT_MS = 1500

export interface OllamaStatus {
  /** The Settings → Keys opt-in. Off → Ollama is hidden app-wide. */
  enabled: boolean
  /** Enabled *and* the daemon answered the last ping. */
  reachable: boolean
  /** True once the state is settled (disabled counts as settled), so
   *  callers can avoid deciding the onboarding gate on a stale value. */
  checked: boolean
}

export function useOllamaReachable(): OllamaStatus {
  const enabled = useReactiveStorage(ollamaAdapter).enabled === true
  const [ping, setPing] = useState({ reachable: false, checked: false })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function probe() {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
      try {
        const res = await fetch(OLLAMA_TAGS_URL, { signal: controller.signal })
        if (!cancelled) setPing({ reachable: res.ok, checked: true })
      } catch {
        // Connection refused / aborted / CORS — treat as not running.
        if (!cancelled) setPing({ reachable: false, checked: true })
      } finally {
        clearTimeout(timer)
      }
    }

    void probe()
    const onFocus = () => void probe()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled])

  if (!enabled) return { enabled: false, reachable: false, checked: true }
  return { enabled: true, reachable: ping.reachable, checked: ping.checked }
}
