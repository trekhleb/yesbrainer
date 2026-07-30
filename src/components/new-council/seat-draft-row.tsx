/**
 * One seat row — a model picker with an optional remove button. Shared by
 * the new-council modal (draft seats) and the council-settings roster
 * editor (live seats, which inject a configure toggle via `trailing`), so
 * the two surfaces stay visually identical. The remove button is
 * `undefined` on the only seat so the user can't delete their way down to
 * zero (both surfaces refuse that anyway, but the affordance shouldn't
 * even surface).
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Select } from 'baseui/select'
import { FiX } from 'react-icons/fi'
import {
  MODEL_PICKER_SELECT_PROPS,
  type ModelOption,
  selectValueForModelId,
} from '@/components/model-options'

export interface SeatDraft {
  id: string
  modelId: string
}

export function SeatDraftRow({
  seat,
  options,
  onChange,
  onRemove,
  trailing,
}: {
  seat: SeatDraft
  options: ModelOption[]
  onChange: (modelId: string) => void
  onRemove?: () => void
  /** Extra per-row controls between the picker and the remove button
   *  (the settings roster's configure toggle). */
  trailing?: ReactNode
}) {
  const [css] = useStyletron()
  return (
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
          value={selectValueForModelId(options, seat.modelId)}
          onChange={({ option }) => {
            if (option && option.id) onChange(String(option.id))
          }}
        />
      </div>
      {trailing}
      {onRemove && (
        <Button
          type="button"
          kind={KIND.tertiary}
          size={SIZE.compact}
          onClick={onRemove}
          aria-label="Remove seat"
          title="Remove this seat"
        >
          <FiX size={14} />
        </Button>
      )}
    </div>
  )
}
