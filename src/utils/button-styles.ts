/**
 * Shared Base Web `Button` overrides for **destructive** actions, in two
 * ranks so a danger zone can grade severity:
 *
 *  - `destructiveButtonOverrides` — **solid** negative fill. The primary
 *    destructive action (ConfirmModal's red confirm, Settings → Storage's
 *    "Wipe everything" factory reset).
 *  - `destructiveSecondaryButtonOverrides` — **outline** red (transparent
 *    fill, red border + text) that fills solid on hover/focus. One rank
 *    below, for *scoped* destructive actions that sit beside the solid one —
 *    the partial Storage wipes ("Wipe keys" / "Wipe councils").
 *
 * One definition each, not per-site copies.
 */

import type { Theme } from 'baseui'

interface ButtonOverride {
  BaseButton: { style: Record<string, string | Record<string, string>> }
}

export function destructiveButtonOverrides(theme: Theme): ButtonOverride {
  return {
    BaseButton: {
      style: {
        backgroundColor: theme.colors.negative,
        color: theme.colors.contentInversePrimary,
        ':hover': { backgroundColor: theme.colors.negative600 },
        ':active': { backgroundColor: theme.colors.negative700 },
        ':focus': { backgroundColor: theme.colors.negative600 },
      },
    },
  }
}

/** 1px solid border in longhand — Styletron mangles the `border` shorthand
 *  (same caveat as `popover-styles.ts`'s `hairline`). */
function outline1px(color: string): Record<string, string> {
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
  }
}

export function destructiveSecondaryButtonOverrides(
  theme: Theme,
): ButtonOverride {
  // Hover/focus fill the outline solid — the same negative tokens as the
  // solid variant, so the two ranks share one red at their most-emphasised
  // state. The border persists across states (pseudo-classes only override
  // the fill), keeping the red edge visible.
  const filled: Record<string, string> = {
    backgroundColor: theme.colors.negative,
    color: theme.colors.contentInversePrimary,
  }
  return {
    BaseButton: {
      style: {
        backgroundColor: 'transparent',
        color: theme.colors.negative,
        ...outline1px(theme.colors.negative),
        ':hover': filled,
        ':focus': filled,
        ':active': {
          backgroundColor: theme.colors.negative700,
          color: theme.colors.contentInversePrimary,
        },
      },
    },
  }
}
