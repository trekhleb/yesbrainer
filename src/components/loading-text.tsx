/**
 * Animated loading text — the app's "working…" cue, one reusable place to
 * tune every loader. Two pieces:
 *
 *   - `<LoadingText>` — the whole word shimmers (a brighter band sweeps across
 *     it) **and** a trailing animated ellipsis. Surface-agnostic: the shimmer
 *     sweeps the text's *own* colour (`currentColor` at varying alpha), so it
 *     reads the same on muted prose (`tone="muted"`, the default) and on a
 *     tinted `StatusTag` pill (`tone="inherit"`, keeps the accent text colour).
 *   - `<AnimatedEllipsis>` — just the three cycling dots, for the rare wordless
 *     placeholder (a participant pane before its first token).
 *
 * Both honour `prefers-reduced-motion`: the shimmer freezes to solid text and
 * the dots settle fully visible, so nothing animates for users who asked for
 * stillness.
 */

import { useStyletron } from 'baseui'

/** The three cycling dots. `aria-hidden` — the surrounding label already
 *  conveys the loading state to assistive tech, so the dots are decorative. */
function AnimatedEllipsis() {
  const [css] = useStyletron()
  const dot = (delay: string) =>
    css({
      animationName: {
        '0%': { opacity: 0.2 },
        '40%': { opacity: 1 },
        '100%': { opacity: 0.2 },
      },
      animationDuration: '1.4s',
      animationIterationCount: 'infinite',
      animationTimingFunction: 'ease-in-out',
      animationDelay: delay,
      '@media (prefers-reduced-motion: reduce)': {
        animationName: 'none',
        opacity: 1,
      },
    })
  return (
    <span aria-hidden>
      <span className={dot('0s')}>.</span>
      <span className={dot('0.2s')}>.</span>
      <span className={dot('0.4s')}>.</span>
    </span>
  )
}

export function LoadingText({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  /** `muted` (default) — quiet grey loader for prose / full-screen states.
   *  `inherit` — keep the surrounding text colour (e.g. a StatusTag pill's
   *  accent), shimmering that colour instead. */
  tone?: 'muted' | 'inherit'
}) {
  const [css, theme] = useStyletron()
  // Dim the base colour at the gradient ends and let the full colour sweep
  // through the middle — a brightness band moving across the word. `currentColor`
  // keeps it tied to whatever colour the text already is.
  const dim = 'color-mix(in srgb, currentColor 28%, transparent)'
  return (
    // Outer span sets the base colour; the *word* shimmers and the dots (a
    // sibling, not nested) pulse in that colour. The dots must stay outside the
    // shimmer span — `background-clip: text` + transparent fill swallow them.
    <span
      className={css(
        tone === 'muted' ? { color: theme.colors.contentTertiary } : {},
      )}
    >
      <span
        className={css({
          backgroundImage: `linear-gradient(90deg, ${dim} 20%, currentColor 50%, ${dim} 80%)`,
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          // Hide the solid fill so the gradient shows — but via text-fill-color,
          // not `color`, so `currentColor` above still resolves to the real colour.
          WebkitTextFillColor: 'transparent',
          animationName: {
            '0%': { backgroundPosition: '200% 0' },
            '100%': { backgroundPosition: '-200% 0' },
          },
          animationDuration: '1.6s',
          animationIterationCount: 'infinite',
          animationTimingFunction: 'linear',
          '@media (prefers-reduced-motion: reduce)': {
            animationName: 'none',
            backgroundImage: 'none',
            WebkitTextFillColor: 'currentColor',
          },
        })}
      >
        {children}
      </span>
      <AnimatedEllipsis />
    </span>
  )
}
