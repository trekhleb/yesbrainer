/**
 * Multi-line `name: description` editor for the voting rating dimensions
 * knob. Same Custom / Reset affordances as `<PromptField>` —
 * stores `undefined` whenever the parsed list matches `defaultValue`
 * (string-compared via the canonical serialiser) so a future release
 * that ships an improved default propagates to non-overriding users.
 *
 * Empty input also collapses to `undefined` (zero dimensions is invalid
 * — there'd be nothing to rate — so we treat clearing as "reset"). A
 * Participant who wants a one-dimension rubric just types that single
 * name.
 */

import type { ReactNode } from 'react'
import { FormControl } from 'baseui/form-control'
import { Textarea } from 'baseui/textarea'
import { FieldLabel } from '@/components/fields/field-label'
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea'
import { COMPACT_INPUT_FONT_STYLE } from '@/utils/input-styles'

/** Auto-grow cap (~16 lines) — a rating rubric is short; past this it scrolls. */
const MAX_DIMENSIONS_HEIGHT = 320
import {
  parseDimensions,
  serializeDimensions,
} from '@/utils/dimensions-serde'
import type { DimensionConfig } from '@/storage/behavior'

export function DimensionsField({
  label,
  caption,
  value,
  defaultValue,
  onChange,
}: {
  label: string
  caption?: ReactNode
  value: DimensionConfig[] | undefined
  defaultValue: DimensionConfig[]
  onChange: (next: DimensionConfig[] | undefined) => void
}) {
  const isOverridden = value !== undefined
  const effective = value ?? defaultValue
  const text = serializeDimensions(effective)
  const textareaRef = useAutosizeTextarea({
    value: text,
    // Small uniform floor — grows to fit the rubric (the `rows={4}` on the
    // element is just the pre-JS fallback height).
    minRows: 2,
    maxHeight: MAX_DIMENSIONS_HEIGHT,
  })
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
      <Textarea
        value={text}
        onChange={(e) => {
          const parsed = parseDimensions(e.currentTarget.value)
          if (
            parsed.length === 0 ||
            serializeDimensions(parsed) === serializeDimensions(defaultValue)
          ) {
            onChange(undefined)
          } else {
            onChange(parsed)
          }
        }}
        rows={4}
        overrides={{
          Input: {
            props: { ref: textareaRef, spellCheck: false },
            // `resize: none` — the autosize hook owns the height.
            style: { ...COMPACT_INPUT_FONT_STYLE, resize: 'none' },
          },
        }}
      />
    </FormControl>
  )
}

// serializeDimensions / parseDimensions → src/utils/dimensions-serde.ts
