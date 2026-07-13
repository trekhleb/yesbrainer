/**
 * The per-row "configure this model" toggle in the shared roster editor
 * (New-council + Council-settings) and on the Judge / Mediator pickers — a
 * sliders icon that expands the row's inline `SeatConfigForm`. A small
 * accent dot marks rows with persisted customizations (system prompt, tools,
 * thinking…), so a tuned seat is visible without expanding anything.
 */

import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { LuSlidersHorizontal } from 'react-icons/lu'

export function ConfigToggleButton({
  expanded,
  customized,
  onClick,
}: {
  expanded: boolean
  customized: boolean
  onClick: () => void
}) {
  const [css, theme] = useStyletron()
  return (
    <Button
      type="button"
      kind={KIND.tertiary}
      size={SIZE.compact}
      isSelected={expanded}
      onClick={onClick}
      aria-label="Configure this model"
      aria-expanded={expanded}
      title="System prompt, tools, thinking"
    >
      <span
        className={css({
          position: 'relative',
          display: 'inline-flex',
        })}
      >
        <LuSlidersHorizontal size={14} aria-hidden />
        {customized && (
          <span
            aria-hidden
            className={css({
              position: 'absolute',
              top: '-3px',
              right: '-4px',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: theme.colors.accent,
            })}
          />
        )}
      </span>
    </Button>
  )
}
