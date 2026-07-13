/**
 * Thinking-dial control for a seat — one segmented row (Default / Off / Low /
 * Med / High / Max). One ordinal scale, deliberately *not* a thinking toggle
 * plus a separate effort enum: most providers encode on/off inside the same
 * scale (OpenAI `'none'`, Gemini budget `0`), so a standalone toggle would be
 * a fake affordance on most seats. "Off" and "Max" clamp to each model's
 * nearest legal state in `providers/reasoning.ts`; the caption discloses the
 * native resolution for *this* seat's model so the mapping is never a
 * surprise.
 *
 * `value === undefined` means "no override" (provider default). Renders
 * nothing for models without reasoning support — a disabled control would be
 * a fake affordance (same rule as hiding Tools for Judge/Mediator).
 */

import { SegmentedField } from '@/components/fields/segmented-field'
import { describeReasoningResolution } from '@/providers/reasoning'
import type { ModelEntry } from '@/models/registry'
import type { ReasoningEffort } from '@/types/council'

/** Alias of the persisted union — kept exported for the composer/run-options
 *  prop types that historically imported it from here. */
export type ReasoningEffortValue = ReasoningEffort

const DEFAULT_KEY = 'default'

const OPTIONS = [
  { key: DEFAULT_KEY, label: 'Default' },
  { key: 'off', label: 'Off' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Med' },
  { key: 'high', label: 'High' },
  { key: 'max', label: 'Max' },
]

export function ReasoningField({
  entry,
  value,
  onChange,
}: {
  entry: ModelEntry
  value: ReasoningEffortValue | undefined
  onChange: (next: ReasoningEffortValue | undefined) => void
}) {
  if (!entry.capabilities.reasoning) return null
  return (
    <SegmentedField
      label="Thinking"
      caption={`How much deliberation the model puts in before answering, sent in its native shape — on ${entry.label}: ${describeReasoningResolution(entry, value)}.`}
      // Six rungs don't fit equal fixed slots on phones without ellipsising
      // ("Defa…") — intrinsic lets each segment hug its word.
      fill="intrinsic"
      options={OPTIONS}
      activeKey={value ?? DEFAULT_KEY}
      isOverridden={value !== undefined}
      onReset={() => onChange(undefined)}
      onChange={(k) =>
        onChange(k === DEFAULT_KEY ? undefined : (k as ReasoningEffortValue))
      }
    />
  )
}
