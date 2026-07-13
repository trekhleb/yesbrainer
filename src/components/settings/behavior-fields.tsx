/**
 * Reusable Behavior-tab field wrappers — numeric inputs, theme picker,
 * title-model picker. Each composes Base Web form controls with the shared
 * `<FieldLabel>` (Custom tag + Reset button) so the tab reads as a flat
 * list of consistent rows.
 *
 * **Storage invariant.** Every field calls `onChange(undefined)` when
 * the value equals the documented default — keeps the cascade-to-default
 * semantics honest and lets future releases ship an improved default to
 * users who haven't explicitly overridden.
 */

import type { ReactNode } from 'react'
import { FormControl } from 'baseui/form-control'
import { Input } from 'baseui/input'
import { Select, SIZE as SelectSize } from 'baseui/select'
import { FieldLabel } from '@/components/fields/field-label'
import { COMPACT_INPUT_FONT_STYLE } from '@/utils/input-styles'
import { useApiKeys } from '@/hooks/use-api-keys'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { pickTitleModelId } from '@/providers/run-title'
import {
  DEFAULT_THEME_MODE,
  TITLE_GENERATOR_CHAIN,
  type ThemeMode,
} from '@/storage/behavior'
import { registry } from '@/models/registry'
import {
  buildModelOptions,
  renderModelOption,
} from '@/components/model-options'
import {
  MODEL_PICKER_SELECT_OVERRIDES,
  NO_KEYBOARD_SELECT_OVERRIDES,
} from '@/utils/select-overrides'

export function BehaviorNumberField({
  label,
  caption,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  caption?: ReactNode
  value: number | undefined
  defaultValue: number
  min: number
  max: number
  step: number
  onChange: (next: number | undefined) => void
}) {
  const isOverridden = value !== undefined
  const effective = value ?? defaultValue
  return (
    <FormControl
      label={
        <FieldLabel
          label={label}
          isOverridden={isOverridden}
          onReset={() => onChange(undefined)}
        />
      }
      caption={caption}
    >
      <Input
        type="number"
        value={String(effective)}
        min={min}
        max={max}
        step={step}
        overrides={{ Input: { style: COMPACT_INPUT_FONT_STYLE } }}
        onChange={(e) => {
          const raw = e.currentTarget.value.trim()
          if (raw.length === 0) {
            onChange(undefined)
            return
          }
          const parsed = Number(raw)
          if (!Number.isFinite(parsed)) {
            // Ignore non-numeric input; let the browser's native
            // validation surface the issue without polluting storage.
            return
          }
          const clamped = Math.max(min, Math.min(max, parsed))
          onChange(clamped === defaultValue ? undefined : clamped)
        }}
      />
    </FormControl>
  )
}

/**
 * Theme picker. Three values (`system` / `light` / `dark`),
 * stored as `themeMode` in `BehaviorSettings`. Storage invariant
 * mirrors the other knobs: selecting the default (`system`) collapses
 * to `undefined` so the row stays absent in localStorage and a future
 * default flip propagates automatically.
 */
export function ThemeModeField({
  value,
  onChange,
}: {
  value: ThemeMode | undefined
  onChange: (next: ThemeMode | undefined) => void
}) {
  const effective: ThemeMode = value ?? DEFAULT_THEME_MODE
  const options: { id: ThemeMode; label: string }[] = [
    { id: 'system', label: 'System — follow OS preference' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]
  const selected = options.find((o) => o.id === effective)
  return (
    <FormControl label={<span>Theme</span>}>
      <Select
        options={options}
        value={selected ? [selected] : []}
        onChange={({ option }) => {
          if (!option) return
          const next = String(option.id) as ThemeMode
          onChange(next === DEFAULT_THEME_MODE ? undefined : next)
        }}
        size={SelectSize.compact}
        clearable={false}
        searchable={false}
        overrides={NO_KEYBOARD_SELECT_OVERRIDES}
      />
    </FormControl>
  )
}

/**
 * Title-generator model picker. The first-turn LLM titler picks
 * the first reachable model from the priority chain
 * (`TITLE_GENERATOR_CHAIN`); an explicit `titleModelId` preempts that
 * chain so users who want a deterministic titler can pin one.
 *
 * Surfaces a live "Currently picks: <model>" caption so users can see
 * *which* model the chain would actually use right now (depends on
 * which BYOK keys they've configured).
 */
export function TitleModelField({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (next: string | undefined) => void
}) {
  const keys = useApiKeys()
  const ollama = useOllamaReachable()
  const isOverridden = value !== undefined
  const effectivePick = pickTitleModelId(value, keys)
  const modelOptions = buildModelOptions(keys, ollama)
  // Sentinel id for the "use the chain" auto-pick row. Distinct from
  // any real modelId so the Select round-trips cleanly.
  const AUTO_ID = '__auto__'
  const options = [
    { id: AUTO_ID, label: 'Auto: cheapest reachable from priority chain' },
    ...modelOptions,
  ]
  const selectedId = value ?? AUTO_ID
  const selectedOption = options.find((o) => o.id === selectedId)
  const effectiveLabel = effectivePick
    ? (registry.find((m) => m.modelId === effectivePick)?.label ?? effectivePick)
    : null
  const chainLabel = TITLE_GENERATOR_CHAIN.map(
    (id) => registry.find((m) => m.modelId === id)?.label ?? id,
  ).join(' → ')
  return (
    <FormControl
      label={
        <FieldLabel
          label="Preferred titler model"
          isOverridden={isOverridden}
          onReset={() => onChange(undefined)}
        />
      }
      caption={
        <span>
          Names each council from its first question. Auto tries{' '}
          <code>{chainLabel}</code> in order.{' '}
          {effectiveLabel ? (
            <>
              Right now: <strong>{effectiveLabel}</strong>.
            </>
          ) : (
            <>
              Right now nothing is reachable — titles stay truncated
              questions.
            </>
          )}
        </span>
      }
    >
      <Select
        options={options}
        value={selectedOption ? [selectedOption] : []}
        onChange={({ option }) => {
          if (!option) return
          const id = String(option.id)
          onChange(id === AUTO_ID ? undefined : id)
        }}
        size={SelectSize.compact}
        clearable={false}
        searchable={false}
        overrides={MODEL_PICKER_SELECT_OVERRIDES}
        getOptionLabel={renderModelOption}
        getValueLabel={renderModelOption}
      />
    </FormControl>
  )
}
