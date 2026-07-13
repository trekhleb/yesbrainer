import { useCallback } from 'react'
import { useStyletron } from 'baseui'
import { LuUsersRound } from 'react-icons/lu'
import { PiChatsBold } from 'react-icons/pi'
import { FiShare2 } from 'react-icons/fi'
import { CardLane } from '@/components/card-lane'
import { RoleBlockHeader } from '@/components/role-block-header'
import { RoleIconChip } from '@/components/role-icon-chip'
import { ParticipantPane } from '@/components/roundtable/participant-pane'
import { SegmentedPager } from '@/components/roundtable/segmented-pager'
import { useCarousel } from '@/hooks/use-carousel'
import { useLaneLayout, useLocateFlash } from '@/hooks/use-lane-layout'
import { roleColors } from '@/utils/role-colors'
import { scrollColumnTopIntoView } from '@/utils/scroll'
import type { RoundtablePane } from '@/types/session'

/**
 * One turn's worth of Participant answers, grouped into a single visual
 * "Roundtable" block. Two lane layouts, decided live by `useLaneLayout`:
 *
 *  - **Carousel** (the base pattern — all phones, narrow desktop lanes, and
 *    any council with 4+ seats): panes at ~80% of the lane, center-snapped,
 *    the next answer peeking in from the edge; a provider-logo pager jumps
 *    between panes. It keeps streaming stable and reads "parallel voices,
 *    one at a time".
 *  - **Compare grid** (wide desktop lanes, ≤3 seats): every answer visible
 *    at once in equal full-opacity columns — the side-by-side comparison
 *    the Parallel structure promises. The pager stays as a roster *legend*
 *    (identity + status); clicking it flashes/locates a column instead of
 *    switching.
 */

/**
 * Visual variant of the panes section. `roundtable` is the default — the
 * round of Participant answers after the user message. `reanswer` is a
 * Consensus reconsider round: the same panes, headed
 * "Reconsider · round N" so the interleaved timeline reads as a sequence of
 * rounds. (The variant keeps the internal `reanswer` name — the role/mechanic
 * — while the user-facing label is "Reconsider".) The inner pane content is
 * identical, so one `RoundtablePane` shape powers both.
 */
type RoundtableVariant = 'roundtable' | 'reanswer'

export interface RoundtableGroupProps {
  panes: RoundtablePane[]
  /** Defaults to `'roundtable'`. Pass `'reanswer'` for a Consensus
   *  re-answer round. */
  variant?: RoundtableVariant
  /** Round number — suffixes the `reanswer` header ("Re-answer · round 2").
   *  Ignored for the default roundtable. */
  round?: number
  /** Share this answer fan-out as a card. Supplied by
   *  TurnView *only* for Parallel councils — where the answers ARE the
   *  result; on Trial/Consensus the answers are a phase and the share lives
   *  on the verdict block, so this stays undefined and no icon renders. */
  onShare?: () => void
}

export function RoundtableGroup({
  panes,
  variant = 'roundtable',
  round,
  onShare,
}: RoundtableGroupProps) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  // Shared center-snap carousel plumbing (scroll math + active tracking);
  // inert while the lane renders as a grid (nothing scrolls, activeIdx
  // stays put and the legend ignores it).
  const { scrollerRef, activeIdx, jumpTo, onScroll } = useCarousel(
    panes.length,
  )
  const layout = useLaneLayout(panes.length, scrollerRef)
  const { flashIdx, flash } = useLocateFlash()

  // Grid-mode click on a legend segment: nothing to scroll to horizontally —
  // flash the column it names, and pull the group top back under the sticky
  // header if the user has scrolled deep into a long answer.
  const locate = useCallback(
    (idx: number) => {
      flash(idx)
      const scroller = scrollerRef.current
      if (scroller) scrollColumnTopIntoView(scroller)
    },
    [flash, scrollerRef],
  )

  if (panes.length === 0) return null
  const multi = panes.length > 1
  const grid = multi && layout === 'grid'
  const isReanswer = variant === 'reanswer'
  const label = isReanswer
    ? round
      ? `Reconsider · round ${round}`
      : 'Reconsider'
    : 'Roundtable'
  return (
    // Flat: no tinted frame around the answer fan-out — a quiet uppercase
    // label + the answer cards themselves. Colour is reserved for the
    // synthesis blocks (Judge / Mediator), so the council's conclusion is
    // the only thing that pops. A re-answer round keeps the Parallel colour
    // (it's still the answer phase) — the label + interleaving carry the
    // "round N" story.
    <section aria-label={isReanswer ? 'Reconsider' : 'Roundtable'}>
      <RoleBlockHeader
        icon={
          // The answer fan-out wears the **Parallel** (roundtable) type colour
          // in every council — its chip + label match the Parallel structure.
          <RoleIconChip role="roundtable">
            {isReanswer ? (
              // A Consensus reconsider round — participants rework their
              // answer in light of the others; the "chats" glyph marks it
              // apart from the round-1 fan-out while keeping the Parallel
              // chip colour.
              <PiChatsBold size={13} aria-hidden />
            ) : (
              // Distinct from the social-structure icons (fork / gavel /
              // handshake): marks the universal *Roundtable* answer phase,
              // reused across every structure.
              <LuUsersRound size={13} aria-hidden />
            )}
          </RoleIconChip>
        }
        label={label}
        accent={roleColors('roundtable', isDark).label}
        // Pager sits on the *left*, right after the label — the icons read as
        // "who produced these parallel answers", and they no longer collide
        // visually with the right side (input / settings) of the screen. Left
        // alignment (inlineMeta) instead of the right-aligned action slot.
        inlineMeta={
          multi ? (
            <SegmentedPager
              panes={panes}
              activeIdx={activeIdx}
              onJump={grid ? locate : jumpTo}
              mode={grid ? 'legend' : 'switcher'}
            />
          ) : undefined
        }
      >
        {onShare && (
          // Quiet icon-only trigger in the stage header's action slot —
          // mirrors the Judge / Mediator cards. Only Parallel councils get
          // it (TurnView gates), since only there is the fan-out the result.
          <button
            type="button"
            onClick={onShare}
            aria-label="Share answers"
            title="Share answers"
            className={css({
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px',
              background: 'none',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: theme.colors.contentTertiary,
              ':hover': { color: theme.colors.contentPrimary },
              transition: 'color 120ms ease',
            })}
          >
            <FiShare2 size={14} aria-hidden />
          </button>
        )}
      </RoleBlockHeader>
      <CardLane
        layout={grid ? 'grid' : 'carousel'}
        scrollerRef={scrollerRef}
        onScroll={onScroll}
      >
        {panes.map((p, i) => (
          <ParticipantPane
            key={p.key}
            pane={p}
            layout={grid ? 'grid' : multi ? 'carousel' : 'full'}
            active={i === activeIdx}
            flash={grid && i === flashIdx}
          />
        ))}
      </CardLane>
    </section>
  )
}
