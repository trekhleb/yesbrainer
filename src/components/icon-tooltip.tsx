/**
 * Base Web tooltip for icon-only buttons — a themed body with an arrow and a
 * native-like ~600ms hover delay (so it doesn't pop instantly), hiding
 * immediately on leave. Purely visual (`accessibilityType` `none`): the
 * trigger's own `aria-label` is the accessible name, so a `tooltip` type
 * would make screen readers announce the text twice.
 *
 * Used by the header toolbar buttons (default `bottom` placement) and the
 * footer theme toggle (`top`, since the footer sits at the viewport bottom).
 */

import type { ReactNode } from 'react'
import {
  ACCESSIBILITY_TYPE,
  PLACEMENT,
  StatefulTooltip,
} from 'baseui/tooltip'

// Tooltips are a hover affordance. On touch devices a tap fires the "enter"
// that shows it but nothing fires the "leave" that hides it (no mouseleave;
// the trigger keeps focus), so it gets stuck on screen — e.g. over a drawer
// the same tap just opened. Skip the tooltip entirely where the primary
// pointer can't hover.
const CAN_HOVER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover)').matches

export function IconTooltip({
  label,
  placement = PLACEMENT.bottom,
  children,
}: {
  label: string
  placement?: (typeof PLACEMENT)[keyof typeof PLACEMENT]
  children: ReactNode
}) {
  if (!CAN_HOVER) return <>{children}</>
  return (
    <StatefulTooltip
      content={label}
      accessibilityType={ACCESSIBILITY_TYPE.none}
      placement={placement}
      showArrow
      onMouseEnterDelay={600}
      onMouseLeaveDelay={0}
    >
      {children}
    </StatefulTooltip>
  )
}
