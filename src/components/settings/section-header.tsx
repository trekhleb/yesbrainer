/**
 * Sub-section divider inside a Councils accordion panel, grouping a structure's
 * fields into "Roundtable / Voting / Judge / Re-answer / Mediator" pillars.
 * Visually: uppercase small caps with a hairline border above + a generous gap
 * so the sub-sections breathe rather than crowd each other.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { LabelSmall } from 'baseui/typography'

export function SectionHeader({
  children,
  // The hairline + top gap separate one section from the previous one. The
  // first section in a panel has nothing above it to divide from, so pass
  // `divider={false}` to drop the rule (and tighten it to the top).
  divider = true,
  // Optional leading glyph — the Councils sub-sections pass the same icon the
  // chat thread's matching stage header wears, so the two stay in lockstep.
  // Inherits the label's `contentSecondary` colour (via `currentColor`).
  icon,
}: {
  children: ReactNode
  divider?: boolean
  icon?: ReactNode
}) {
  const [css, theme] = useStyletron()
  return (
    <LabelSmall
      marginTop={divider ? '28px' : '0'}
      marginBottom="4px"
      color={theme.colors.contentSecondary}
      overrides={{
        Block: {
          style: {
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: 600,
            // Roomy gap between the divider rule and the title text.
            paddingTop: divider ? '16px' : '0',
            ...(divider
              ? { borderTop: `1px solid ${theme.colors.borderOpaque}` }
              : {}),
          },
        },
      }}
    >
      <span
        className={css({
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        })}
      >
        {icon}
        {children}
      </span>
    </LabelSmall>
  )
}
