/**
 * Color-coded pill identifying a council's deliberation shape (structure
 * icon + label, tinted with the structure's type accent). The single
 * visual for "what kind of council is this?" — reused by the council
 * header's mode chip (`roster.tsx`, wrapped in a description tooltip) and
 * the sidebar council rows. Colours come from the shared
 * `structureColorSet` so every surface stays in lockstep.
 *
 * `forwardRef` + prop spread so Base Web's `StatefulTooltip` can use the
 * pill directly as its trigger (it clones the child to inject a ref +
 * hover handlers). `size="small"` is the denser sidebar variant.
 */

import { forwardRef } from 'react'
import { useStyletron } from 'baseui'
import { structureColorSet } from '@/models/social-structure-colors'
import { socialStructureMeta } from '@/models/social-structures'
import type { SocialStructure } from '@/types/council'

export interface StructurePillProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  structure: SocialStructure
  /** `medium` (default) = council-header metrics; `small` = denser
   *  sidebar-row variant. */
  size?: 'small' | 'medium'
}

export const StructurePill = forwardRef<HTMLSpanElement, StructurePillProps>(
  function StructurePill({ structure, size = 'medium', ...rest }, ref) {
    const [css, theme] = useStyletron()
    const meta = socialStructureMeta(structure)
    if (!meta) return null
    const colors = structureColorSet(structure, theme.name === 'dark-theme')
    const small = size === 'small'
    return (
      <span
        ref={ref}
        // aria / tooltip keep the full descriptive name; the visible chip
        // uses the concise one-word label to stay compact.
        aria-label={`Deliberation mode: ${meta.label}`}
        {...rest}
        className={css({
          display: 'inline-flex',
          alignItems: 'center',
          gap: small ? '4px' : '5px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          paddingTop: small ? '2px' : '4px',
          paddingBottom: small ? '2px' : '4px',
          paddingLeft: small ? '6px' : '8px',
          paddingRight: small ? '8px' : '10px',
          // Fully rounded — with the short label the chip is small enough
          // that a pill radius reads cleaner than the old 16px corners.
          borderRadius: '999px',
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.bg,
          fontSize: small ? '11px' : '13px',
          fontWeight: 600,
          color: theme.colors.contentPrimary,
          cursor: 'inherit',
        })}
      >
        <span className={css({ display: 'inline-flex', color: colors.accent })}>
          <meta.Icon size={small ? 12 : 14} aria-hidden />
        </span>
        {/* Concise one-word type name (Parallel / Trial / Consensus) — the
            full descriptive label lives on the Create-council picker and the
            pill's tooltip / aria, never inline here. */}
        <span>{meta.shortLabel}</span>
      </span>
    )
  },
)
