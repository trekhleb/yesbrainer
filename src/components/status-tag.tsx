import { useStyletron } from 'baseui'
import { Tag, KIND as TagKind } from 'baseui/tag'
import { LuGavel, LuMessageCircleMore, LuVote } from 'react-icons/lu'
import { LoadingText } from '@/components/loading-text'

/**
 * Compact status pill — the "working…" cue at the **top-left of a card
 * body** (under the header), shown while a card is generating with no
 * content yet. Lives in the body, not the header's right edge, so it's
 * instantly visible even when a narrow / peeking card clips its header.
 *
 * Statuses (default labels lean into the council metaphor):
 *   - `streaming` → "deliberating", `voting` → "casting votes",
 *     `judging` → "reaching a verdict" — rendered as a **compact, monochrome**
 *     pill with shimmering text + an animated ellipsis, led by a gently
 *     "breathing" status glyph (speech bubble / ballot / gavel). Monochrome
 *     (not the blue accent) so it reads as quiet progress.
 *   - `error`                          → negative (red) Tag, no icon/ellipsis
 *   - any other (`done`, `idle`, etc.) → renders nothing
 *
 * Callers can override the displayed text via `label` (e.g. the Mediator
 * passes "seeking consensus") and the glyph via `icon` (the thinking strip
 * passes a brain); a trailing "…" on the override is stripped so the
 * animated ellipsis is the only one. Icons are wrapped in the breathing
 * animation here, so every pill breathes the same way; the motion settles
 * under `prefers-reduced-motion`.
 */
type StatusKind =
  | 'streaming'
  | 'voting'
  | 'judging'
  | 'error'
  | 'done'
  | 'idle'

/** Council-themed default labels for the active statuses (no trailing "…" —
 *  the animated ellipsis supplies it). */
const DEFAULT_LABEL: Partial<Record<StatusKind, string>> = {
  streaming: 'deliberating',
  voting: 'casting votes',
  judging: 'reaching a verdict',
}

/** Default glyph per active status — composing an answer / casting a ballot /
 *  ruling. Presentational (not domain data), so the map lives here. */
const DEFAULT_ICON: Partial<Record<StatusKind, React.ReactNode>> = {
  streaming: <LuMessageCircleMore size={12} />,
  voting: <LuVote size={12} />,
  judging: <LuGavel size={12} />,
}

/** Slow scale-and-fade pulse — the pill glyph reads as alive without any
 *  new imagery. Settles solid and still under reduced motion. */
function BreathingIcon({ children }: { children: React.ReactNode }) {
  const [css] = useStyletron()
  return (
    <span
      aria-hidden
      className={css({
        display: 'inline-flex',
        animationName: {
          '0%': { transform: 'scale(1)', opacity: 0.55 },
          '50%': { transform: 'scale(1.18)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 0.55 },
        },
        animationDuration: '1.8s',
        animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in-out',
        '@media (prefers-reduced-motion: reduce)': {
          animationName: 'none',
          opacity: 1,
        },
      })}
    >
      {children}
    </span>
  )
}

export interface StatusTagProps {
  status: StatusKind
  label?: string
  /** Overrides the status's default glyph (e.g. the thinking strip's brain).
   *  Pass a bare icon — the pill wraps it in the breathing animation. */
  icon?: React.ReactNode
}

export function StatusTag({ status, label, icon }: StatusTagProps) {
  const [css, theme] = useStyletron()
  if (status === 'done' || status === 'idle') return null
  if (status === 'error') {
    return (
      <Tag closeable={false} kind={TagKind.negative}>
        {label ?? 'error'}
      </Tag>
    )
  }
  // Strip any trailing ellipsis from the label so the animated one is the
  // single source of the "…".
  const base = (label ?? DEFAULT_LABEL[status] ?? status).replace(/[….]+$/, '')
  const glyph = icon ?? DEFAULT_ICON[status]
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        // Tight vertical padding keeps the pill shorter than the header's
        // model identity, so it never drives the row height (no jump on clear).
        paddingTop: '1px',
        paddingBottom: '1px',
        paddingLeft: '8px',
        paddingRight: '8px',
        borderRadius: '999px',
        backgroundColor: theme.colors.backgroundSecondary,
        color: theme.colors.contentSecondary,
        fontSize: '11px',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      })}
    >
      {glyph && <BreathingIcon>{glyph}</BreathingIcon>}
      <LoadingText tone="inherit">{base}</LoadingText>
    </span>
  )
}
