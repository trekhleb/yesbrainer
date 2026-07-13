/**
 * BYOK API keys, stored per-device in localStorage.
 *
 * Keys never travel to our server — they're loaded here and handed
 * directly to the AI SDK provider instance in the browser. See the
 * BYOK section of README.md for the architectural guarantee.
 */

import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'
import type { ProviderId } from '@/models/registry'

export type ApiKeys = Partial<Record<ProviderId, string>>

const adapter = createReactiveLocalStorage<ApiKeys>({
  storageKey: 'yesbrainer:keys',
  eventName: 'yesbrainer:keys-changed',
  defaultValue: {},
  // Trim pasted whitespace (a key copied with a trailing newline fails
  // provider auth with an opaque 401) and strip empty strings so absence
  // is unambiguous.
  sanitize: (keys) => {
    const clean: ApiKeys = {}
    for (const [k, v] of Object.entries(keys)) {
      const trimmed = v?.trim()
      if (trimmed) clean[k as ProviderId] = trimmed
    }
    return clean
  },
})

export const getApiKeys = adapter.get
export const setApiKeys = adapter.set
export const keysAdapter = adapter
