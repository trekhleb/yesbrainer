/**
 * Reactive read of the BYOK keys.
 *
 * Components that gate behavior on key presence (model-picker
 * reachability, settings indicators) call this so they re-render
 * when the user saves a new key.
 */

import { keysAdapter, type ApiKeys } from '@/storage/keys'
import { useReactiveStorage } from '@/hooks/use-reactive-storage'

export function useApiKeys(): ApiKeys {
  return useReactiveStorage(keysAdapter)
}
