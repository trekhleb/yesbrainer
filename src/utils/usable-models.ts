/**
 * "Can the user actually talk to any model right now?" — the gate behind
 * the first-run onboarding and the seed for a new council's first seat.
 *
 * A model is usable when its provider has a configured key, or (for Ollama)
 * the opt-in toggle is on *and* the live reachability ping succeeds. Pair
 * the `ollamaReachable` argument with `useOllamaReachable().reachable`
 * (false whenever the toggle is off) and `keys` with `useApiKeys()`.
 */

import { registry } from '@/models/registry'
import { isProviderReachable } from '@/providers'
import type { ApiKeys } from '@/storage/keys'

export function hasUsableModel(
  keys: ApiKeys,
  ollamaReachable: boolean,
): boolean {
  return registry.some(
    (m) => !m.deprecated && isProviderReachable(m, keys, ollamaReachable),
  )
}

/**
 * First non-deprecated registry model the user can actually call, in
 * registry order — used to seed a new council's seat instead of a hardcoded
 * Ollama default. Null when nothing is reachable.
 */
export function firstUsableModelId(
  keys: ApiKeys,
  ollamaReachable: boolean,
): string | null {
  return (
    registry.find(
      (m) => !m.deprecated && isProviderReachable(m, keys, ollamaReachable),
    )?.modelId ?? null
  )
}

/**
 * The **"Smartest available"** roster preset: each reachable provider's
 * `smartest`-flagged model — the explicit "most powerful" designation on the
 * registry entry (exactly one per native provider, guarded by a registry
 * test), deliberately independent of registry order, which stays the
 * *default-seat* / picker order (Anthropic's default is Opus 4.8, but its
 * `smartest` is Fable 5 — the preset click is the explicit max-power
 * request). OpenRouter is excluded — it re-routes models you can already
 * seat natively, so it would duplicate a pick under a middleman.
 *
 * Padded up to `minSeats` with the next reachable models in registry order
 * (so a single-provider user still meets Trial / Consensus's two-seat
 * floor). Empty when nothing is reachable (the caller hides the preset in
 * that case — the add-keys callout is the only action then).
 */
export function pickSmartestModelIds(
  keys: ApiKeys,
  ollamaReachable: boolean,
  minSeats = 1,
): string[] {
  const reachable = registry.filter(
    (m) =>
      !m.deprecated &&
      m.provider !== 'openrouter' &&
      isProviderReachable(m, keys, ollamaReachable),
  )
  // One model per provider: the entry explicitly flagged `smartest`.
  const picks = reachable.filter((m) => m.smartest).map((m) => m.modelId)
  // Top up to the structure's seat floor from the remaining reachable
  // models (registry order — each group's default flagship first).
  for (const m of reachable) {
    if (picks.length >= minSeats) break
    if (!picks.includes(m.modelId)) picks.push(m.modelId)
  }
  return picks
}
