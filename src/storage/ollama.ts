/**
 * Opt-in Ollama support, stored per-device in localStorage.
 *
 * Default OFF — a hosted web page probing `localhost:11434` unsolicited
 * reads as a port scan (and Chrome is moving local-network access behind
 * a permission prompt), so the app never pings, lists, or mentions Ollama
 * until the user flips the toggle at the bottom of Settings → Keys.
 * Enabling is the moral equivalent of configuring a key: reachability
 * then defers to the live daemon ping (see `useOllamaReachable`).
 */

import { createReactiveLocalStorage } from '@/storage/reactive-localstorage'

interface OllamaSettings {
  enabled?: boolean
}

const adapter = createReactiveLocalStorage<OllamaSettings>({
  storageKey: 'yesbrainer:ollama',
  eventName: 'yesbrainer:ollama-changed',
  defaultValue: {},
})

export const ollamaAdapter = adapter

/** Synchronous read for non-React paths (e.g. the titler chain). */
export function getOllamaEnabled(): boolean {
  return adapter.get().enabled === true
}

export function setOllamaEnabled(enabled: boolean): void {
  adapter.set({ enabled })
}
