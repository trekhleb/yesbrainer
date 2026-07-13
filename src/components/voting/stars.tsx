/**
 * 1–5 star rating render. Used for both an individual voter's integer rating
 * and a target's *fractional* average (e.g. 4.5). Renders a grey 5-star base
 * with a gold layer clipped to `value/5` width, so half-points show as a
 * partial star instead of being truncated. aria-label exposes the numeric
 * value for screen readers.
 *
 * Stars are drawn as SVG icons (`FaStar`, the same Font Awesome family as the
 * winner `FaTrophy`) rather than the `★` text glyph — the glyph depends on a
 * system symbols font, which minimal Linux (and the headless visual-test
 * container) lack, so it fell back to a tofu rectangle. SVG renders
 * identically everywhere.
 */

import { useStyletron } from 'baseui'
import { FaStar } from 'react-icons/fa'

const STAR_COUNT = 5

/** A single non-wrapping row of 5 stars in one colour, sized to the current
 *  font (`1em`) so it tracks the surrounding text like the old glyph did. */
function StarRow({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ display: 'inline-flex', gap: '1px', color, lineHeight: 1 }}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <FaStar key={i} size="1em" />
      ))}
    </span>
  )
}

export function Stars({ value }: { value: number }) {
  const [, theme] = useStyletron()
  const pct = (Math.max(0, Math.min(5, value)) / 5) * 100
  return (
    <span
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
      style={{
        position: 'relative',
        display: 'inline-block',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {/* Grey base: all five outlined in the tertiary ink. */}
      <span style={{ opacity: 0.4 }}>
        <StarRow color={theme.colors.contentTertiary} />
      </span>
      {/* Gold overlay clipped to value/5 — the same fractional-fill trick as
          the old two-layer glyph, so 4.5 shows half a gold star. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'hidden',
          width: `${pct}%`,
        }}
      >
        <StarRow color={theme.colors.warning} />
      </span>
    </span>
  )
}
