/**
 * React subscription to a `ReactiveStorage<T>` adapter.
 *
 * Dedupes the identical `useApiKeys` / `useBehaviorSettings` /
 * `useUserPrompts` hooks — each used to re-implement the same
 * dual-event (`storage` + custom) subscription with its own copy of
 * the boilerplate. Now they're each one line:
 *
 *     export const useApiKeys = () => useReactiveStorage(keysAdapter)
 *
 * Both event types are needed because the native `storage` event
 * only fires in *other* tabs — for in-tab updates we dispatch the
 * adapter's own `eventName`.
 */

import { useEffect, useState } from 'react'
import type { ReactiveStorage } from '@/storage/reactive-localstorage'

export function useReactiveStorage<T extends object>(
  adapter: ReactiveStorage<T>,
): T {
  const [value, setValue] = useState<T>(() => adapter.get())

  useEffect(() => {
    const refresh = () => setValue(adapter.get())
    window.addEventListener('storage', refresh)
    window.addEventListener(adapter.eventName, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(adapter.eventName, refresh)
    }
  }, [adapter])

  return value
}
