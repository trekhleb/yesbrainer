/**
 * App-wide Base Web themes — the design-language foundation.
 *
 * One restrained **neutral-black** brand accent over otherwise neutral
 * chrome: primary actions, focus/selection states, and links all share the
 * same near-black ink (white on dark surfaces), so "what's interactive /
 * what's primary" is scannable at a glance while everything else stays calm.
 * The brand stays monochrome on purpose — the *colour* in the app comes from
 * the per-structure palette in `social-structure-colors.ts` (the council-type
 * pills / cards), which the brand no longer competes with.
 *
 * Radii are unified here too (the pre-redesign UI mixed 0/8/10/12/24px):
 * 10px controls, 12px popovers, 14px surfaces. Components that need a
 * different radius (pill send button, chat bubbles) opt out locally.
 *
 * `createLightTheme` / `createDarkTheme` clone Base Web's stock themes and
 * deep-merge these overrides, so `theme.name` stays `'light-theme'` /
 * `'dark-theme'` — code that branches on `theme.name === 'dark-theme'`
 * keeps working. Foundation `accent*` overrides cascade into Base Web's
 * semantic tokens (contentAccent, backgroundAccent, …); component tokens
 * built from *other* foundations (primary buttons, links, ticks) are
 * overridden explicitly.
 */

import { createDarkTheme, createLightTheme } from 'baseui'

/** Neutral-black brand ramp (light-surface variant): black ink with a
 *  grey tint ladder for the soft accent backgrounds. */
const ACCENT_LIGHT = {
  accent: '#000000',
  accent50: '#F5F5F5',
  accent100: '#E5E5E5',
  accent200: '#CCCCCC',
  accent300: '#999999',
  accent400: '#4D4D4D',
  accent500: '#000000',
  accent600: '#000000',
  accent700: '#000000',
}

/** Inverted for dark surfaces — a black brand reads as white ink on the
 *  near-black background (a pure-black accent would vanish there). */
const ACCENT_DARK = {
  accent: '#FFFFFF',
  accent50: '#F5F5F5',
  accent100: '#E5E5E5',
  accent200: '#CCCCCC',
  accent300: '#999999',
  accent400: '#B3B3B3',
  accent500: '#FFFFFF',
  accent600: '#FFFFFF',
  accent700: '#FFFFFF',
}

/** Unified corner radii — one rounding language across the app. */
const BORDERS = {
  buttonBorderRadius: '10px',
  checkboxBorderRadius: '6px',
  inputBorderRadius: '10px',
  popoverBorderRadius: '12px',
  surfaceBorderRadius: '14px',
  tagBorderRadius: '6px',
}

export const appLightTheme = createLightTheme({
  borders: BORDERS,
  colors: {
    ...ACCENT_LIGHT,
    // Primary actions carry the black brand ink; hover/active lift to grey.
    buttonPrimaryFill: '#000000',
    buttonPrimaryHover: '#262626',
    buttonPrimaryActive: '#404040',
    buttonPrimaryText: '#FFFFFF',
    // Selection / focus / checked states share the brand ink.
    borderSelected: '#000000',
    tickFillSelected: '#000000',
    tickFillSelectedHover: '#262626',
    tickFillSelectedHoverActive: '#404040',
    linkText: '#000000',
    linkHover: '#404040',
    linkVisited: '#000000',
  },
})

export const appDarkTheme = createDarkTheme({
  borders: BORDERS,
  colors: {
    ...ACCENT_DARK,
    // White brand fill on dark, with black text — the inverse of the
    // light theme's black-on-white primary.
    buttonPrimaryFill: '#FFFFFF',
    buttonPrimaryHover: '#E5E5E5',
    buttonPrimaryActive: '#CCCCCC',
    buttonPrimaryText: '#000000',
    borderSelected: '#FFFFFF',
    tickFillSelected: '#FFFFFF',
    tickFillSelectedHover: '#E5E5E5',
    tickFillSelectedHoverActive: '#CCCCCC',
    // Light-grey body links for contrast on the near-black background.
    linkText: '#E5E5E5',
    linkHover: '#FFFFFF',
    linkVisited: '#E5E5E5',
  },
})
