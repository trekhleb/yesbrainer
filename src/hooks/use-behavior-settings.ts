/**
 * Reactive read of the user's orchestrator-behaviour knobs.
 *
 * The orchestrator reads `getBehaviorSettings()` directly (no React
 * there), but UI surfaces — Settings tab, future per-council /
 * per-seat captions — use this hook so they pick up edits without a
 * remount.
 */

import {
  behaviorAdapter,
  type BehaviorSettings,
} from '@/storage/behavior'
import { useReactiveStorage } from '@/hooks/use-reactive-storage'

export function useBehaviorSettings(): BehaviorSettings {
  return useReactiveStorage(behaviorAdapter)
}
