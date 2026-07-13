/**
 * Shared styling for the Settings → Councils structure accordion.
 *
 * Each panel is one social structure's recipe, tinted + glyphed from the same
 * `structureColorSet` / `socialStructureMeta` single sources of truth as the
 * StructurePill — so a header can never drift from the pill / picker / chat
 * tints, and the panel title reuses the canonical **full** structure name
 * (`Parallel answers` / `Trial verdict` / `Consensus debate`). Neutral panels
 * (Misc) take a grey treatment + a caller-supplied icon and label.
 *
 * Sizing stays close to Base Web's stock Accordion (`scale600`/`scale700`
 * header padding, roomy content) rather than a cramped custom override — the
 * panels should feel spacious. `useSettingsPanel` returns the `title` node +
 * the per-panel `Panel` `overrides`; Base Web keeps a child Panel's own
 * `overrides` (`accordion.js`: `child.props.overrides || overrides`), so the
 * tints stick.
 */

import type { ComponentType, ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { CustomTag } from '@/components/fields/field-label'
import { structureColorSet } from '@/models/social-structure-colors'
import { socialStructureMeta } from '@/models/social-structures'
import type { SocialStructure } from '@/types/council'

type IconType = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>

/** A panel is tinted by a social structure (palette + glyph + full name from
 *  `socialStructureMeta`) or neutral (grey + a caller-supplied icon + label,
 *  for Misc). */
export type PanelTint =
  | { structure: SocialStructure }
  | { neutral: IconType; label: string }

export function useSettingsPanel(
  tint: PanelTint,
  opts?: {
    compact?: boolean
    flat?: boolean
    /** True when any field inside differs from its default — surfaces the
     *  shared "Custom" tag on the collapsed header, so customization is
     *  visible without expanding the panel. */
    customized?: boolean
  },
) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  // `compact` dials the header down for a *secondary* surface (the per-council
  // overrides panel on the New-council form) — smaller chip, tighter padding,
  // smaller title — so it reads as a subordinate group, not a headline like the
  // spacious Settings → Councils panels. `flat` drops the icon chip entirely
  // (no box / gradient / shadow), leaving a plain inline glyph — quieter still.
  const compact = opts?.compact ?? false
  const flat = opts?.flat ?? false
  const chipPx = compact ? 22 : 28
  const iconPx = compact ? 14 : 16

  // `headerBg` tints the whole panel header bar; the leading glyph rides a
  // gradient icon-chip (the same treatment as the New-council picker / /about
  // cards), so the accordion speaks the same gradient language. Neutral panels
  // (Misc) get a flat grey chip — no structure gradient to draw from.
  let headerBg: string
  let chipBg: string
  let chipGradient: string | undefined
  let chipFg: string
  let Icon: IconType | undefined
  let label: string
  if ('structure' in tint) {
    const colors = structureColorSet(tint.structure, isDark)
    const meta = socialStructureMeta(tint.structure)
    headerBg = colors.bg
    chipBg = colors.solid
    chipGradient = colors.solidGradient
    chipFg = colors.onSolid
    Icon = meta?.Icon
    // Canonical full name — single source of truth shared with the pill.
    label = meta?.label ?? ''
  } else {
    headerBg = theme.colors.backgroundSecondary
    chipBg = theme.colors.backgroundTertiary
    chipGradient = undefined
    chipFg = theme.colors.contentSecondary
    Icon = tint.neutral
    label = tint.label
  }

  const title: ReactNode = (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '8px' : '10px',
      })}
    >
      {Icon &&
        (flat ? (
          // Plain inline glyph — no chip box, gradient, or shadow.
          <span
            className={css({
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              color: chipFg,
            })}
          >
            <Icon size={iconPx} aria-hidden />
          </span>
        ) : (
          <span
            className={css({
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${chipPx}px`,
              height: `${chipPx}px`,
              borderRadius: compact ? '6px' : '8px',
              backgroundColor: chipBg,
              backgroundImage: chipGradient,
              // Structure chips cast an accent-tinted shadow; the neutral Misc
              // chip casts a soft grey one so it floats in the same style.
              boxShadow: chipGradient
                ? `0 3px 8px -3px ${chipBg}59`
                : `0 3px 8px -3px rgba(2, 6, 23, ${isDark ? 0.55 : 0.18})`,
              color: chipFg,
            })}
          >
            <Icon size={iconPx} aria-hidden />
          </span>
        ))}
      <span>{label}</span>
      {opts?.customized && <CustomTag />}
    </span>
  )

  const overrides = {
    // Card-per-panel so the structures read as distinct units.
    PanelContainer: {
      style: {
        marginBottom: compact ? '0' : '12px',
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: compact ? '10px' : '12px',
        overflow: 'hidden',
        backgroundColor: theme.colors.backgroundPrimary,
      },
    },
    Header: {
      style: {
        backgroundColor: headerBg,
        fontSize: compact ? '13px' : '14px',
        fontWeight: '600',
        // Keep the tint on hover (Base Web's default greys it, fighting the
        // structure colour).
        ':hover': { backgroundColor: headerBg },
        // Compact trims the roomy stock scale600/700 padding for a secondary
        // surface; full panels keep Base Web's stock (spacious) header padding.
        ...(compact
          ? {
              paddingTop: '10px',
              paddingBottom: '10px',
              paddingLeft: '14px',
              paddingRight: '14px',
            }
          : {}),
      },
    },
    Content: {
      style: {
        // The fields are Base Web FormControls, which carry their own vertical
        // margins (label `marginTop` ~8px + a trailing `marginBottom` ~16px
        // below the caption) that the horizontal sides don't have. Trim the
        // top/bottom padding to compensate so the *visual* gap lands evenly.
        paddingTop: compact ? '8px' : '12px',
        paddingBottom: '4px',
        // Align the content edge with the tighter compact header padding.
        paddingLeft: compact ? '14px' : '20px',
        paddingRight: compact ? '14px' : '20px',
        backgroundColor: 'transparent',
      },
    },
  }

  return { title, overrides }
}
