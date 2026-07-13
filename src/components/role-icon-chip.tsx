/**
 * Small gradient icon-chip that leads each chat-thread **stage header** —
 * Roundtable / Voting / Judge / Mediator. The in-thread counterpart
 * of the structure icon-chips on the /about + picker cards: a white role glyph
 * on the role's bright two-stop gradient with a soft accent-tinted shadow.
 *
 * The colour-coded synthesis / voting phases ride their role gradient; the
 * answer phases (Roundtable + Consensus re-answer) reuse the Parallel role
 * colour, since they're still the answer round.
 */

import { useStyletron } from 'baseui'
import { roleColors, type SynthesisRole } from '@/utils/role-colors'

export function RoleIconChip({
  role,
  children,
}: {
  /** A coloured synthesis/voting phase, or `'neutral'` for the answer phases. */
  role: SynthesisRole | 'neutral'
  /** The role glyph (sized ~13px), rendered over the chip fill. */
  children: React.ReactNode
}) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  const c = role === 'neutral' ? null : roleColors(role, isDark)
  const solid = c ? c.solid : theme.colors.backgroundTertiary
  return (
    <span
      className={css({
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '7px',
        backgroundColor: solid,
        backgroundImage: c ? c.solidGradient : undefined,
        boxShadow: c
          ? `0 3px 8px -3px ${solid}59`
          : `0 3px 8px -3px rgba(2, 6, 23, ${isDark ? 0.55 : 0.18})`,
        color: c ? c.onSolid : theme.colors.contentSecondary,
      })}
    >
      {children}
    </span>
  )
}
