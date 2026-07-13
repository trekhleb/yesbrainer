/**
 * Reactive read of the user's default prompts.
 *
 * The orchestrator reads `getUserPrompts()` directly (no React
 * there), but UI surfaces — Settings tab, seat-config caption — use
 * this hook so they pick up edits without a remount.
 */

import { promptsAdapter, type UserPrompts } from '@/storage/prompts'
import { useReactiveStorage } from '@/hooks/use-reactive-storage'

export function useUserPrompts(): UserPrompts {
  return useReactiveStorage(promptsAdapter)
}
