/**
 * Agreement-level display helpers — turn the `AgreementLevel` enum
 * from the vote aggregator into theme colours + screen-reader labels
 * + tooltip strings.
 *
 * `agreementColor` returns null for the `insufficient` level so the
 * dot disappears entirely when there aren't enough voters to draw an
 * agreement signal; the other levels map to positive / warning /
 * negative theme tokens.
 */

import type {
  AgreementLevel,
  LeaderboardEntry,
} from '@/utils/vote-leaderboard'

/**
 * AA-safe colour for the agreement label rendered as inline *text* — the
 * bright theme tokens (esp. the `warning` amber) are too light to clear WCAG
 * AA as small text on white, so this maps to darker green / amber / red.
 * Light-on-dark in dark mode. `null` for `insufficient` (no signal).
 */
export function agreementTextColor(
  level: AgreementLevel,
  isDark: boolean,
): string | null {
  switch (level) {
    case 'strong':
      return isDark ? '#34d399' : '#047857'
    case 'mixed':
      return isDark ? '#fbbf24' : '#b45309'
    case 'divergent':
      return isDark ? '#f87171' : '#b91c1c'
    case 'insufficient':
      return null
  }
}

export function agreementLabel(level: AgreementLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong agreement'
    case 'mixed':
      return 'Mixed agreement'
    case 'divergent':
      return 'Divergent views'
    case 'insufficient':
      return ''
  }
}

export function agreementTooltip(entry: LeaderboardEntry): string {
  const label = agreementLabel(entry.agreement)
  if (entry.meanStdev === null) {
    return `${label} — at least two voters are needed for an agreement signal.`
  }
  return `${label} — mean stdev across the configured rating dimensions = ${entry.meanStdev.toFixed(2)} on the 1–5 scale.`
}
