/**
 * Reusable prompt textarea with an inline default + override affordance.
 * Shared by Settings → Prompts and the per-seat config modal's system prompt,
 * so the "default-as-text, Reset to default" behaviour is defined in exactly
 * one place.
 *
 * The textarea is always pre-filled with the `defaultValue` so the user can
 * copy / tweak in place rather than starting from a blank slate (the default
 * is rendered as real text, *not* a placeholder). When the displayed text
 * differs from the default a "Reset to default" button shows on the right of
 * the label row — its presence is the sole "overridden" signal.
 *
 * **Storage invariant.** `onChange` is called with `undefined` whenever the
 * displayed text equals `defaultValue`, so the saved override stays absent
 * (not "string-equal-to-default"). Two benefits: a future release that
 * improves the default propagates to non-overriding users, and
 * override-detection collapses to `value !== undefined`.
 */

import type { ReactNode } from 'react'
import { FormControl } from 'baseui/form-control'
import { Textarea } from 'baseui/textarea'
import { FieldLabel } from '@/components/fields/field-label'
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea'
import { COMPACT_INPUT_FONT_STYLE } from '@/utils/input-styles'

/** Auto-grow cap for prompt fields (~24 lines) — generous enough to show a
 *  long system prompt in full, past which it scrolls internally so a single
 *  field can never run away with the whole form. */
const MAX_PROMPT_HEIGHT = 480
/** Floor in rows. Small and uniform so a short prompt sits at a couple of lines
 *  (still reading as a multi-line editor) and grows from there — the per-field
 *  `rows` is a fixed *height*, which is too tall to reuse as a minimum. */
const MIN_PROMPT_ROWS = 2

export function PromptField({
  label,
  caption,
  value,
  defaultValue,
  onChange,
  rows,
  noAutoFocus,
}: {
  label: string
  caption?: ReactNode
  value: string | undefined
  defaultValue: string
  onChange: (next: string | undefined) => void
  rows: number
  /** Exclude this textarea from a focus-lock's initial autofocus
   *  (`data-no-autofocus`). Use inside a modal so opening it doesn't pop the
   *  mobile keyboard — the trap focuses the next non-text element instead.
   *  No effect outside a focus-lock (e.g. the Settings page). */
  noAutoFocus?: boolean
}) {
  const isOverridden = value !== undefined
  const text = value ?? defaultValue
  const textareaRef = useAutosizeTextarea({
    value: text,
    minRows: MIN_PROMPT_ROWS,
    maxHeight: MAX_PROMPT_HEIGHT,
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
          const next = e.currentTarget.value
          onChange(next === defaultValue ? undefined : next)
        }}
        rows={rows}
        overrides={{
          Input: {
            props: {
              ref: textareaRef,
              spellCheck: false,
              ...(noAutoFocus ? { 'data-no-autofocus': true } : {}),
            },
            // `resize: none` — height is owned by the autosize hook, so the
            // manual drag handle would just fight it.
            style: { ...COMPACT_INPUT_FONT_STYLE, resize: 'none' },
          },
        }}
      />
    </FormControl>
  )
}
