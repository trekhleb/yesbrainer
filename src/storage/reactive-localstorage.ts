/**
 * Reactive localStorage adapter factory.
 *
 * Three storage modules — `keys.ts`, `behavior.ts`, `prompts.ts` —
 * each implemented the same `getX` / `setX` / `X_CHANGED_EVENT`
 * pattern with shape-guarded JSON.parse and a custom dispatchEvent
 * for in-tab reactivity. This factory hosts that pattern in one
 * place so the three call sites stop drifting independently.
 *
 * The only thing that varies per call site is the sanitize step —
 * different shapes have different "empty / absent" semantics (an
 * unset BYOK key is `undefined`; an unset Behavior knob is also
 * `undefined`, but `false` / `0` are valid values that must survive).
 * Callers provide their own `sanitize` if the default identity isn't
 * enough.
 */

export interface ReactiveStorage<T extends object> {
  /** Read the current value. Returns `defaultValue` for missing /
   *  corrupt rows. Never throws. */
  get(): T
  /** Write + dispatch the custom event. Cross-tab updates also fire
   *  the native `storage` event automatically. */
  set(value: T): void
  /** Custom event name; hooks subscribe to this *and* `'storage'`. */
  eventName: string
}

export function createReactiveLocalStorage<T extends object>(opts: {
  storageKey: string
  eventName: string
  defaultValue: T
  /** Optional: post-process value before write (strip empty fields,
   *  etc.). Defaults to identity. */
  sanitize?: (value: T) => T
}): ReactiveStorage<T> {
  const {
    storageKey,
    eventName,
    defaultValue,
    sanitize = (v: T) => v,
  } = opts

  function get(): T {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultValue
    try {
      const parsed: unknown = JSON.parse(raw)
      // Guard against corrupt payloads (manual DevTools edits, future
      // schema migrations, hostile imports) — anything that isn't a
      // plain object falls back to the default so the cast can't
      // smuggle in invalid data.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaultValue
      }
      return parsed as T
    } catch {
      return defaultValue
    }
  }

  function set(value: T): void {
    const clean = sanitize(value)
    try {
      localStorage.setItem(storageKey, JSON.stringify(clean))
    } catch (err) {
      // Quota exceeded / privacy-mode restrictions. Settings auto-save
      // calls this per edit — a throw here would crash the page to the
      // error boundary over a lost preference write. Log the key only
      // (never the value: this adapter also carries the BYOK keys).
      console.warn(
        `[reactive-localstorage] write failed for ${storageKey}:`,
        err instanceof Error ? err.name : 'unknown error',
      )
      return
    }
    // Notify in-tab listeners — the native `storage` event only
    // fires in *other* tabs that share the origin.
    window.dispatchEvent(new Event(eventName))
  }

  return { get, set, eventName }
}
