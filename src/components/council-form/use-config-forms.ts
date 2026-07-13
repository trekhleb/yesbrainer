/**
 * Shared inline-config form machinery for the two council modals
 * (`new-council-modal.tsx`, `council-settings-modal.tsx`) — the expand
 * state, the mount-on-first-expand tracking, and the per-slot form-handle
 * registry their Save/Create paths read `buildConfig()` from. The two
 * modals used to carry ~120 parallel lines of this; the semantics live
 * here once.
 *
 * Mount-on-first-expand (`everExpanded`): a config form first mounts when
 * its panel is *visible* — Base Web's SegmentedControl measures its active
 * pill on mount, and inside `display:none` it measures 0 wide — then stays
 * mounted through collapses so hidden edits survive until Save. A
 * never-opened slot has no handle in the registry, so `builtConfig` falls
 * back to whatever the caller passes (stored config when editing, empty
 * when creating).
 */

import { useCallback, useRef, useState } from 'react'
import type { SeatConfigFormHandle } from '@/components/seat-config/seat-config-form'
import type { SeatConfig } from '@/types/council'

export function useConfigForms(options?: {
  /** Called with the toggled key before the expand state updates — the
   *  New-council modal uses it to mark the roster "touched" when a seat's
   *  config opens (an open form pins that seat against re-seeding). */
  onToggle?: (key: string) => void
}) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [everExpanded, setEverExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const formsRef = useRef(new Map<string, SeatConfigFormHandle | null>())

  const onToggle = options?.onToggle
  const toggleConfig = useCallback(
    (key: string) => {
      onToggle?.(key)
      setExpandedKeys((cur) => {
        const next = new Set(cur)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      setEverExpanded((cur) => (cur.has(key) ? cur : new Set(cur).add(key)))
    },
    [onToggle],
  )

  // Stable per-key registrar (callback-ref factory) — hoisted into
  // useCallback so the ref write isn't flagged as a render-time ref
  // access; the forms are collected on Save, not during render.
  const registerForm = useCallback(
    (key: string) => (h: SeatConfigFormHandle | null) => {
      formsRef.current.set(key, h)
    },
    [],
  )

  /** The slot's edited config, or `fallback` when its form never mounted. */
  const builtConfig = useCallback(
    (key: string, fallback: SeatConfig = {}): SeatConfig =>
      formsRef.current.get(key)?.buildConfig() ?? fallback,
    [],
  )

  return { expandedKeys, everExpanded, toggleConfig, registerForm, builtConfig }
}
