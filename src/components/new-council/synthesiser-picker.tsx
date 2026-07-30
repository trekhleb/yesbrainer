/**
 * Single-model Select for the Judge (Trial) or Mediator (Consensus)
 * slot. Same shape for both roles — they share `{ modelId, config }`
 * — so one component handles both via a `role` discriminator.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { FormControl } from 'baseui/form-control'
import { Select } from 'baseui/select'
import { STRUCTURE_ICON } from '@/models/social-structures'
import {
  MODEL_PICKER_SELECT_PROPS,
  type ModelOption,
  selectValueForModelId,
} from '@/components/model-options'

const COPY: Record<'judge' | 'mediator', { label: string; caption: ReactNode }> =
  {
    judge: {
      label: 'Judge',
      caption:
        'Reads all answers and peer ratings, then delivers the final verdict.',
    },
    mediator: {
      label: 'Mediator',
      caption:
        'Referees the debate — each round it checks for convergence and distills the open disagreements.',
    },
  }

export function SynthesiserPicker({
  role,
  modelId,
  onChange,
  options,
  trailing,
}: {
  role: 'judge' | 'mediator'
  modelId: string
  onChange: (modelId: string) => void
  options: ModelOption[]
  /** Extra controls to the picker's right (the settings roster's
   *  configure toggle) — keeps the row shape identical to seat rows. */
  trailing?: ReactNode
}) {
  const [css, theme] = useStyletron()
  const copy = COPY[role]
  // Flat role glyph (scales = Judge, handshake = Mediator) — the same icons the
  // app uses everywhere, plain (no gradient chip), to match the Participants
  // header above.
  const Icon = role === 'judge' ? STRUCTURE_ICON.trial : STRUCTURE_ICON.consensus
  return (
    <FormControl
      label={
        <span
          className={css({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          })}
        >
          <span
            className={css({
              display: 'inline-flex',
              color: theme.colors.contentSecondary,
            })}
          >
            <Icon size={15} aria-hidden />
          </span>
          <span>{copy.label}</span>
        </span>
      }
      caption={copy.caption}
    >
      <div
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        })}
      >
        <div className={css({ flex: 1, minWidth: 0 })}>
          <Select
            {...MODEL_PICKER_SELECT_PROPS}
            options={options}
            value={selectValueForModelId(options, modelId)}
            onChange={({ option }) => {
              if (option && option.id) onChange(String(option.id))
            }}
          />
        </div>
        {trailing}
      </div>
    </FormControl>
  )
}
