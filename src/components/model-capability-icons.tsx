import { useStyletron } from 'baseui'
import { StatefulTooltip, PLACEMENT } from 'baseui/tooltip'
import { FiEye, FiTool } from 'react-icons/fi'
import { LuBrain } from 'react-icons/lu'
import { getModel } from '@/models/registry'
import { formatContextWindow } from '@/utils/format-tokens'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
/**
 * Compact icon row that surfaces a model's native capabilities next to
 * its label — shipped with the vision icon, later expanded with tools and
 * the reasoning brain.
 *
 * Lives in one place so the seat picker, "+ Add seat" menu, roster
 * chip, seat-config modal title, etc. all share the same visual cue
 * and ordering. Adding a new capability is one new icon block here,
 * not three coordinated edits across pickers.
 *
 * Stable left-to-right order: brain → eye → tools (fixed on purpose), so users learn the visual cue once. Skipped icons leave a
 * gap-free row. With `showContext`, a compact context-window figure
 * ("200K", "1M") trails the icons — turned on in the council model pickers
 * (create / edit) so seat choice can weigh context size alongside the flags.
 */
export interface ModelCapabilityIconsProps {
  modelId: string
  size?: number
  /** Append a compact context-window figure after the capability icons.
   *  Off by default so compact chips stay icon-only; the model pickers
   *  turn it on. */
  showContext?: boolean
}

export function ModelCapabilityIcons({
  modelId,
  size = 12,
  showContext = false,
}: ModelCapabilityIconsProps) {
  const [css, theme] = useStyletron()
  const entry = getModel(modelId)
  // Stable left-to-right order: brain → eye → tools, then the optional
  // context figure. Users learn the visual cue once and read it
  // consistently across every picker. An icon-only row collapses to nothing
  // when a model has no capabilities — but a shown context figure always
  // gives the row something to render.
  const hasReasoning = entry.capabilities.reasoning
  const hasVision = entry.capabilities.vision
  const hasTools = entry.capabilities.tools
  if (!showContext && !hasReasoning && !hasVision && !hasTools) return null
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
        color: theme.colors.contentTertiary,
        // Mobile: tighter gap so a 3-icon row doesn't push the model
        // label off a narrow chip. The icon size itself stays at the
        // caller's `size` — the 2-3px shave is negligible vs. the gap
        // win, and a single render keeps the component simple.
        [MOBILE_MEDIA_QUERY]: { gap: '2px' },
      })}
      aria-label="Model capabilities"
    >
      {hasReasoning && (
        <StatefulTooltip
          content="Supports extended thinking / reasoning"
          placement={PLACEMENT.top}
          showArrow
        >
          <span
            className={css({ display: 'inline-flex' })}
            aria-label="reasoning-capable"
          >
            <LuBrain size={size} aria-hidden />
          </span>
        </StatefulTooltip>
      )}
      {hasVision && (
        <StatefulTooltip
          content="Multi-modal — supports image inputs"
          placement={PLACEMENT.top}
          showArrow
        >
          <span
            className={css({ display: 'inline-flex' })}
            aria-label="vision-capable"
          >
            {/* An eye (not a picture frame) — vision means the model can
                *read* images you attach, not generate them; a picture glyph
                was being misread as image generation. */}
            <FiEye size={size} aria-hidden />
          </span>
        </StatefulTooltip>
      )}
      {hasTools && (
        <StatefulTooltip
          content="Supports tools (web search, …)"
          placement={PLACEMENT.top}
          showArrow
        >
          <span
            className={css({ display: 'inline-flex' })}
            aria-label="tools-capable"
          >
            <FiTool size={size} aria-hidden />
          </span>
        </StatefulTooltip>
      )}
      {showContext && (
        <StatefulTooltip
          content={`Context window: ${entry.contextWindow.toLocaleString()} tokens`}
          placement={PLACEMENT.top}
          showArrow
        >
          {/* A quantity, not another boolean flag — a quiet grey pill so it
              reads as a designed spec tag distinct from the icon cues (the
              old bracketed text looked like debug output). Neutral tokens
              only, numeral in the row's shared tertiary tone: the number
              must not compete with the model label (settled after trying
              inverse-filled and white-text variants — both too loud or
              too low-contrast in one of the themes). */}
          <span
            className={css({
              display: 'inline-flex',
              alignItems: 'center',
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '6px',
              paddingRight: '6px',
              borderRadius: '999px',
              backgroundColor: theme.colors.backgroundTertiary,
              fontSize: `${Math.max(10, size - 1)}px`,
              lineHeight: 1,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            })}
            aria-label={`context window ${formatContextWindow(entry.contextWindow)}`}
          >
            {formatContextWindow(entry.contextWindow)}
          </span>
        </StatefulTooltip>
      )}
    </span>
  )
}
