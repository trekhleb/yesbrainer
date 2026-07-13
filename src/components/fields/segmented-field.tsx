/**
 * Labeled segmented-control row with the shared override affordance
 * (Custom tag + Reset in the label). For settings that are one choice among
 * a few named states — replaces checkbox+select pairs and coupled-checkbox
 * groups whose valid combinations are really a single enum.
 *
 * Purely presentational: callers own the key↔storage mapping (including
 * multi-field mappings like Consensus's reconsider input) and the
 * "default collapses to undefined" invariant.
 */

import type { ReactNode } from 'react'
import { FormControl } from 'baseui/form-control'
import { Segment, SegmentedControl } from 'baseui/segmented-control'
import { FieldLabel } from '@/components/fields/field-label'

export interface SegmentedFieldOption {
  key: string
  label: string
  /** Optional short second line under the segment label. */
  description?: string
}

export function SegmentedField({
  label,
  caption,
  options,
  activeKey,
  isOverridden,
  onReset,
  onChange,
  fill = 'fixed',
}: {
  label: string
  caption?: ReactNode
  options: SegmentedFieldOption[]
  activeKey: string
  isOverridden: boolean
  onReset: () => void
  onChange: (key: string) => void
  /** `'fixed'` (default): equal-width segments — reads as one control and
   *  keeps tap targets uniform on phones. `'intrinsic'`: each segment hugs
   *  its label — for rows with too many options to share fixed slots
   *  without ellipsising (the six-rung thinking dial). */
  fill?: 'fixed' | 'intrinsic'
}) {
  return (
    <FormControl
      label={
        <FieldLabel
          label={label}
          isOverridden={isOverridden}
          onReset={onReset}
        />
      }
      caption={caption}
    >
      <SegmentedControl
        activeKey={activeKey}
        onChange={({ activeKey: k }) => onChange(String(k))}
        fill={fill}
        overrides={{
          // Full-bleed only when slots share the width; an intrinsic row
          // sizes to its content and hugs the field's left edge.
          Root: { style: fill === 'fixed' ? { width: '100%' } : {} },
        }}
      >
        {options.map((o) => (
          <Segment
            key={o.key}
            label={o.label}
            description={o.description}
            overrides={{
              // The stock segment is tall and generously padded; trim toward
              // the app's compact input scale so worded options
              // ("Disagreements", the six-rung thinking dial) fit a 390px
              // phone without truncating. MUST be `paddingInline` — the base
              // Segment pads with that logical property, and an override only
              // wins deterministically when it names the same property (Base
              // Web merges style objects); paddingLeft/Right would coexist
              // with the base's paddingInline and lose the cascade.
              Segment: {
                style: { paddingInline: '6px' },
              },
              // The text (and its ellipsis) live on `Label`, not the
              // LabelBlock wrapper.
              Label: {
                style: {
                  fontSize: '13px',
                  lineHeight: '18px',
                  // Step down on phones so the longest label
                  // ("Disagreements") still fits a three-way split at 390px.
                  '@media (max-width: 479px)': { fontSize: '12px' },
                },
              },
              Description: { style: { fontSize: '11px', lineHeight: '14px' } },
            }}
          />
        ))}
      </SegmentedControl>
    </FormControl>
  )
}
