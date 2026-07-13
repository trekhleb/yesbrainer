/**
 * The body of a deliberation-mode card: the gradient structure icon-chip in a
 * left column, the title + description stacked in a right column. Shared by the
 * /about explainer cards and the New-council picker segments so the two
 * surfaces lay out identically and can't drift — the surrounding card chrome
 * (tint / border / selection state) belongs to each caller.
 */

import { useStyletron } from 'baseui'
import { LabelMedium, ParagraphSmall } from 'baseui/typography'
import { structureColorSet } from '@/models/social-structure-colors'
import { socialStructureMeta } from '@/models/social-structures'
import type { SocialStructure } from '@/types/council'

export function DeliberationCardContent({
  structure,
}: {
  structure: SocialStructure
}) {
  const [css, theme] = useStyletron()
  const colors = structureColorSet(structure, theme.name === 'dark-theme')
  const meta = socialStructureMeta(structure)
  if (!meta) return null
  const { Icon } = meta
  return (
    <div
      className={css({
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        textAlign: 'left',
        minWidth: 0,
        width: '100%',
      })}
    >
      <span
        className={css({
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '38px',
          height: '38px',
          borderRadius: '11px',
          backgroundColor: colors.solid,
          backgroundImage: colors.solidGradient,
          boxShadow: `0 6px 16px -5px ${colors.solid}66`,
          color: colors.onSolid,
        })}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          minWidth: 0,
        })}
      >
        <LabelMedium marginTop="0" marginBottom="0">
          {meta.label}
        </LabelMedium>
        <ParagraphSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentSecondary}
        >
          {meta.description}
        </ParagraphSmall>
      </div>
    </div>
  )
}
