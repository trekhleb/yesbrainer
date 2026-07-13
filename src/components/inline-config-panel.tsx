/**
 * Shared chrome for an inline per-model config panel — the bordered inset
 * that expands under a roster row or a Judge / Mediator picker in the
 * New-council and Council-settings modals, so the two surfaces can't drift.
 *
 * Mount-on-first-expand contract: the parent only renders this (with a
 * `SeatConfigForm` inside) once the panel has been opened, because the
 * form's segmented controls must first mount *visible* to measure their
 * active pill. After that the panel stays mounted and collapsing merely
 * hides it (`display:none`), so edits survive until Save / Create.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'

export function InlineConfigPanel({
  expanded,
  children,
}: {
  expanded: boolean
  children: ReactNode
}) {
  const [css, theme] = useStyletron()
  return (
    <div
      className={css({
        display: expanded ? 'block' : 'none',
        marginTop: '6px',
        marginBottom: '10px',
        paddingTop: '12px',
        paddingBottom: '12px',
        paddingLeft: '14px',
        paddingRight: '14px',
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '10px',
      })}
    >
      {children}
    </div>
  )
}
