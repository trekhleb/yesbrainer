/**
 * Base Web popover overrides for menu-style popovers (the sidebar's
 * per-row kebab menu, and any future action menus): a normal surface
 * card — theme background, hairline border, soft shadow, 12px radius —
 * matching the app's design language in both light and dark themes.
 *
 * (Earlier versions inverted the popover to `contentPrimary` — a black
 * card in light mode — which read as a foreign tooltip rather than a
 * menu. Inversion is now reserved for actual tooltips.)
 *
 * Takes the theme as an argument because Base Web doesn't expose the
 * colour token from outside a component; callers pass their own
 * `useStyletron()[1]` result.
 */

import type { useStyletron } from 'baseui'

export function menuPopoverOverrides(
  theme: ReturnType<typeof useStyletron>[1],
) {
  const isDark = theme.name === 'dark-theme'
  const bg = theme.colors.backgroundPrimary
  return {
    Body: {
      style: {
        backgroundColor: bg,
        borderTopLeftRadius: '12px',
        borderTopRightRadius: '12px',
        borderBottomLeftRadius: '12px',
        borderBottomRightRadius: '12px',
        // Longhand (not the `border` shorthand) — styletron's atomic
        // renderer warns when a shorthand mixes with the longhand border
        // props Base Web itself sets on the popover surface.
        ...hairline(theme.colors.borderOpaque),
        boxShadow: isDark
          ? '0 8px 24px rgba(0, 0, 0, 0.5)'
          : '0 8px 24px rgba(0, 0, 0, 0.12)',
        overflow: 'hidden',
      },
    },
    Inner: { style: { backgroundColor: bg } },
    Arrow: { style: { backgroundColor: bg } },
  } as const
}

/** 1px solid border in longhand form (see the styletron note above). */
function hairline(color: string) {
  return {
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: color,
    borderLeftColor: color,
  } as const
}

/**
 * Same surface card, for popovers rendered with `showArrow` (the composer's
 * run controls): the anchor-pointing triangle protrudes past the Body edge,
 * so `overflow: hidden` (which would clip it off) moves to the Inner — the
 * radius rides along so corners stay rounded. The arrow is a rotated square
 * behind the Inner; it only shows its outer half, tinted like the card.
 */
export function menuPopoverWithArrowOverrides(
  theme: ReturnType<typeof useStyletron>[1],
) {
  const base = menuPopoverOverrides(theme)
  const radius = {
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
  } as const
  return {
    Body: { style: { ...base.Body.style, overflow: 'visible' } },
    Inner: { style: { ...base.Inner.style, ...radius, overflow: 'hidden' } },
    Arrow: {
      style: {
        backgroundColor: theme.colors.backgroundPrimary,
        ...hairline(theme.colors.borderOpaque),
      },
    },
  } as const
}
