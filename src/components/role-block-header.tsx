import { useEffect, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { LabelXSmall } from 'baseui/typography'
import { findScrollParent } from '@/utils/scroll'

/**
 * Shared, **sticky** header for the role-grouped chat blocks:
 *   - `<RoundtableGroup>` (Participants — answers + Consensus re-answers)
 *   - `<VotingBlock>` (Trial voting)
 *   - `<JudgeBlock>` (Trial Judge synthesis)
 *   - `<MediatorRoundBlock>` (Consensus Mediator, one per round)
 *
 * Each block had ~30 lines of nearly identical markup: an inline-flex
 * icon + uppercase label + optional count + right-aligned action cluster.
 * Pulling the layout here keeps spacing / typography / color-tokens
 * consistent across them (and any future role blocks we add).
 *
 * **The spine (iteration 3).** Every header is `position: sticky;
 * top: 0`, so as you scroll a long answer the *stage* label (Parallel
 * answers / Voting / Judge…) stays pinned at the top of the thread and is
 * handed off to the next stage's header when you cross into it — exactly
 * one pinned at a time (each header is scoped to its own block). This is
 * the "where am I in the council" orientation cue, and it's why the
 * Roundtable segmented control no longer scrolls out of reach. A
 * soft shadow appears only once the header is actually stuck (detected
 * against the thread scroll container).
 *
 * Callers pass:
 *   - `icon` — the leading lucide / react-icons element
 *   - `label` — the uppercase title ("PARALLEL ANSWERS", "VOTING"…)
 *   - `count` — optional small "{n} voters" / "{n} members" suffix
 *   - `inlineMeta` — inline content kept adjacent to the title
 *   - `children` — action cluster (status tags, retry, inspector)
 *
 * The pinned bar is always the neutral page surface — the synthesis blocks
 * (Judge / Mediator) keep their tint on the answer *card* below, not the stage
 * header, so colour lives one row down and the spine stays uniform.
 *
 * The action cluster is pushed to the right by a flex spacer so callers
 * don't have to repeat `marginLeft: auto` per item.
 */
export interface RoleBlockHeaderProps {
  icon: React.ReactNode
  label: string
  /** Optional count suffix shown next to the label (e.g. "3 voters"). */
  count?: string
  /** Richer inline content placed between the count and the flex spacer
   *  — used by JudgeBlock to keep the model identity + status badge
   *  adjacent to the title (instead of right-aligned with the actions). */
  inlineMeta?: React.ReactNode
  /** Colour the uppercase label text with the block's role tint (the
   *  synthesis / voting blocks pass `roleColors().label`, an AA-safe shade).
   *  Defaults to the muted `contentTertiary`. */
  accent?: string
  children?: React.ReactNode
}

export function RoleBlockHeader({
  icon,
  label,
  count,
  inlineMeta,
  accent,
  children,
}: RoleBlockHeaderProps) {
  const [css, theme] = useStyletron()
  const ref = useRef<HTMLElement | null>(null)
  const [stuck, setStuck] = useState(false)

  // "Stuck" detection without a scroll listener: observe the header
  // against its scroll container with a -1px top inset. The instant the
  // header pins to top:0 its intersection ratio drops below 1 → it's
  // stuck → fade in the separating shadow. Robust across the nested
  // thread scroller (root must be that container, not the viewport).
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const root = findScrollParent(el)
    if (!root) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStuck(entry.intersectionRatio < 1)
      },
      { root, threshold: [1], rootMargin: '-1px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <header
      ref={ref}
      className={css({
        position: 'sticky',
        // -1px (not 0): at fractional scroll offsets the content scrolling
        // past peeks through a 1px seam at the pinned bar's top edge before
        // the scroll clip catches it. Sticking 1px *higher* lets the bar's
        // opaque fill overlap and cover that seam; the 1px above the
        // viewport top is clipped, so there's no visible downside. The extra
        // top padding keeps the label's optical position unchanged.
        top: '-1px',
        zIndex: 3,
        backgroundColor: theme.colors.backgroundPrimary,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        // Padding (not margin) carries the gap to the content, so the
        // opaque fill covers it and nothing shows through under the
        // pinned bar.
        paddingTop: '5px',
        paddingBottom: '8px',
        paddingLeft: '2px',
        boxShadow: stuck
          ? `0 1px 0 ${theme.colors.borderOpaque}, 0 6px 10px -9px rgba(0, 0, 0, 0.45)`
          : 'none',
        transitionProperty: 'box-shadow',
        transitionDuration: '160ms',
      })}
    >
      <span
        className={css({
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: theme.colors.contentTertiary,
        })}
      >
        {icon}
        <LabelXSmall
          marginTop="0"
          marginBottom="0"
          color={accent ?? theme.colors.contentTertiary}
          overrides={{
            Block: {
              style: {
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              },
            },
          }}
        >
          {label}
        </LabelXSmall>
      </span>
      {count && (
        <LabelXSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentTertiary}
        >
          {count}
        </LabelXSmall>
      )}
      {inlineMeta}
      <span className={css({ flex: 1 })} />
      {children}
    </header>
  )
}
