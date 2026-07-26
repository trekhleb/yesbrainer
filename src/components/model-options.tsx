/**
 * Shared helpers for Base Web `<Select>` pickers over the model registry.
 *
 * Three call sites use the same pattern:
 *   - Roster's per-seat model swap
 *   - Roster's "Add seat" picker
 *   - New-council modal (both Participant rows and the Judge picker)
 *
 * Pulling the option-list build, the option renderer, and the
 * value→Option lookup into one place keeps the reachability logic + the
 * inline provider logo styling consistent across them. The renderer
 * lives next to the helpers (not inside a JSX component) so the call
 * sites can drop it straight into `getOptionLabel` / `getValueLabel`.
 */

import type { Option, Value } from 'baseui/select'
import { Link } from 'react-router-dom'
import { ModelCapabilityIcons } from '@/components/model-capability-icons'
import { ProviderLogo } from '@/components/provider-logo'
import type { useApiKeys } from '@/hooks/use-api-keys'
import type { OllamaStatus } from '@/hooks/use-ollama-reachable'
import { isProviderReachable } from '@/providers'
import { getModel, registry, type ProviderId } from '@/models/registry'

export interface ModelOption extends Option {
  id: string
  label: string
  provider: ProviderId
  disabled?: boolean
  /** Mirrors the registry entry's `smartest` flag — the provider's most
   *  powerful model. Lets UI copy about the "Smartest available" preset
   *  (e.g. the roster tooltip) derive from the same designation
   *  `pickSmartestModelIds` seats, instead of a parallel rule. */
  smartest?: boolean
}

/**
 * Build the Select-ready option list for the model registry. Reachability
 * is computed against the API-keys hook so cloud models without a key
 * render greyed with an "add key" link and are non-selectable. Pass the
 * `OllamaStatus` from `useOllamaReachable()`: while the opt-in toggle is
 * off the local model is omitted outright (no dead row for the majority
 * without a local daemon); when on but the daemon is down it renders
 * greyed as "(not running)".
 *
 * Reachable models are listed first and disabled ones (missing key or a
 * down Ollama daemon) after, so the greyed-out rows always sink to the
 * bottom of the picker instead of sitting wherever registry order puts them.
 */
export function buildModelOptions(
  keys: ReturnType<typeof useApiKeys>,
  ollama: Pick<OllamaStatus, 'enabled' | 'reachable'>,
): ModelOption[] {
  const options = registry
    // Deprecated (superseded) models never appear in pickers — history still
    // renders them via `getModel`, but new seats shouldn't start on one. A
    // seat *already* on a deprecated model keeps rendering its real label:
    // `selectValueForModelId` falls back to the registry entry when the id
    // isn't in this list, so the Select shows the seat's model while the
    // dropdown stays clean. Net effect: a superseded model can be kept, but
    // not newly chosen.
    .filter((m) => !m.deprecated)
    .filter((m) => m.provider !== 'ollama' || ollama.enabled)
    .map((m) => ({
      id: m.modelId,
      label: m.label,
      provider: m.provider,
      disabled: !isProviderReachable(m, keys, ollama.reachable),
      ...(m.smartest ? { smartest: true } : {}),
    }))
  // Group reachable models first, the disabled ones (missing key *or* a
  // not-running local Ollama) after — a stable partition that keeps registry
  // order within each group. Without it the registry-first Ollama entry sits
  // at the top even when its daemon is down, above selectable cloud models.
  return [
    ...options.filter((o) => !o.disabled),
    ...options.filter((o) => o.disabled),
  ]
}

/**
 * The option renderer used by all model `<Select>` pickers. Shows the
 * provider logo + label; disabled rows carry an unobtrusive but actionable
 * "add key" link into Settings → Keys (clicks land on the anchor even
 * though the row itself is non-selectable). The New-council modal closes
 * itself when the navigation drops its `?new-council` param; the
 * state-driven Council-settings modal is closed by the settings route
 * (see the effect in `app.tsx`).
 */
export function renderModelOption({ option }: { option?: Option }) {
  if (!option) return null
  const provider = option.provider as ProviderId | undefined
  if (!provider) return <span>{option.label as React.ReactNode}</span>
  const modelId = typeof option.id === 'string' ? option.id : undefined
  return (
    // Full-width flex row so the capability icons can pin to the right edge
    // (`marginLeft: auto`) instead of sitting ragged right after each label.
    <span
      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}
    >
      <ProviderLogo provider={provider} size={14} />
      <span>
        {option.label as React.ReactNode}
        {/* Ollama needs no key — when disabled it's because the local
            daemon isn't answering, not a missing key (the row only exists
            at all once the opt-in toggle is on). */}
        {option.disabled ? (
          provider === 'ollama' ? (
            ' (not running)'
          ) : (
            <>
              {' '}
              <Link
                to="/settings/keys"
                style={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                add key
              </Link>
            </>
          )
        ) : (
          ''
        )}
      </span>
      {modelId && (
        <span style={{ marginLeft: 'auto', paddingLeft: 8, flexShrink: 0 }}>
          {/* Context window trails the capability flags here (create / edit
              council pickers) so a seat choice can weigh model reach too. */}
          <ModelCapabilityIcons modelId={modelId} size={12} showContext />
        </span>
      )}
    </span>
  )
}

/**
 * Resolve a `modelId` to the corresponding Base Web `Value` (a single-item
 * array) — or an empty array when there's no model to show at all.
 *
 * A seat can legitimately point at a model `buildModelOptions` omits: a
 * superseded (`deprecated`) entry it was seated on before the catalog moved
 * on, or the Ollama entry while the opt-in toggle is off. Rendering those as
 * an empty Select would read as "no model chosen" for a seat that very much
 * has one — and the recorded demo councils, seeded into every pristine
 * profile, sit in exactly that state after a flagship bump. So fall back to
 * the registry for display: `getModel` resolves deprecated entries with their
 * real label, provider, and capabilities, and degrades to its "(unlisted)"
 * stub only for ids the catalog dropped entirely — still more legible than a
 * blank control. Display-only: the fallback is deliberately absent from
 * `options`, so it can be shown but not re-selected once changed.
 */
export function selectValueForModelId(
  options: ModelOption[],
  modelId: string | null | undefined,
): Value {
  if (!modelId) return []
  const found = options.find((o) => o.id === modelId)
  if (found) return [found]
  const entry = getModel(modelId)
  return [
    {
      id: entry.modelId,
      label: entry.label,
      provider: entry.provider,
      ...(entry.smartest ? { smartest: true } : {}),
    } satisfies ModelOption,
  ]
}
