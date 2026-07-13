import { useCallback } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND as ButtonKind, SIZE as ButtonSize } from 'baseui/button'
import { FiRefreshCw } from 'react-icons/fi'
import { LuListChecks } from 'react-icons/lu'
import { CardLane } from '@/components/card-lane'
import { RoleBlockHeader } from '@/components/role-block-header'
import { RoleIconChip } from '@/components/role-icon-chip'
import { TargetVoteCard } from '@/components/voting/target-vote-card'
import { VotingPager } from '@/components/voting/voting-pager'
import { useCarousel } from '@/hooks/use-carousel'
import { useLaneLayout, useLocateFlash } from '@/hooks/use-lane-layout'
import { roleColors } from '@/utils/role-colors'
import { scrollColumnTopIntoView } from '@/utils/scroll'
import {
  aggregateInflightVotes,
  winningTargetSeatId,
  type LeaderboardEntry,
} from '@/utils/vote-leaderboard'
import type { Seat } from '@/types/council'
import type { VoterEntry } from '@/types/session'

/**
 * Trial-mode voting block. Mirrors the Roundtable: a flat, sticky `VOTING`
 * stage header (gold peer-review icon + label, like the Judge) + a focus-
 * carousel of **one card per target answer**, switched by the same segmented
 * pager. Each card shows that answer's *aggregated* per-dimension stars
 * (averages across voters) + the agreement dot, with a collapsed "How others
 * voted" disclosure for the raw per-voter ratings + comments. The peer-rated
 * winner wears a ★ on its pager tab + card. The voting *cards* stay **neutral
 * grey** (like the Roundtable); only the Judge's verdict card is gold-tinted —
 * the gold lives in Voting's header, while its cards read as the process.
 *
 * The carousel needs the per-target aggregate (`targets`), which only exists
 * once the votes land — so the in-flight phase (no `targets` yet) renders a
 * quiet voter-progress strip instead.
 */

export interface VotingBlockProps {
  /** All seats — used to label voters in the in-flight progress strip. */
  seats: Seat[]
  /** One entry per voter in this turn (drives the in-flight progress strip
   *  + the block-level retry gating). */
  voterEntries: VoterEntry[]
  /** Optional banner shown above the content (e.g. "voting…" during the
   *  in-flight phase before the events have been persisted). */
  banner?: React.ReactNode
  /** Re-run only the errored voters in this turn. Omit to hide the
   *  block-level retry button. */
  onRetryFailed?: () => void
  /** Per-target aggregate (one entry per rated answer). Present on persisted
   *  turns → drives the carousel; absent in-flight (mid-stream averages would
   *  flicker as voters land), so the block shows progress instead. */
  targets?: LeaderboardEntry[]
}

export function VotingBlock({
  seats,
  voterEntries,
  banner,
  onRetryFailed,
  targets,
}: VotingBlockProps) {
  const [css, theme] = useStyletron()
  const colors = roleColors('voting', theme.name === 'dark-theme')

  // Voting is still running until every voter settles.
  const loading = voterEntries.some((v) => v.status === 'voting')
  // Persisted turns pass the finished aggregate; mid-vote we build it from the
  // live voter set so the cards are visible (and fill in) while voting runs,
  // instead of popping in only once it finishes.
  const cards =
    targets ??
    aggregateInflightVotes(
      voterEntries.map((v) => ({
        seatId: v.voterSeatId,
        modelId: v.modelId,
        vote: v.vote ?? null,
      })),
      seats,
    )
  const hasTargets = cards.length > 0
  // No winner is crowned until every vote is in.
  const winnerSeatId =
    !loading && hasTargets ? winningTargetSeatId(cards) : null
  const multi = cards.length > 1
  const { scrollerRef, activeIdx, jumpTo, onScroll } = useCarousel(cards.length)
  // Carousel vs Compare grid — same lane rule as the
  // Roundtable answers; the voting cards are shorter, so they benefit even
  // more from landing side-by-side.
  const layout = useLaneLayout(cards.length, scrollerRef)
  const { flashIdx, flash } = useLocateFlash()
  const grid = multi && layout === 'grid'

  // Grid-mode legend click: flash the named card; pull the group top back
  // under the sticky header if scrolled past.
  const locate = useCallback(
    (idx: number) => {
      flash(idx)
      const scroller = scrollerRef.current
      if (scroller) scrollColumnTopIntoView(scroller)
    },
    [flash, scrollerRef],
  )

  // Retry only when at least one voter errored *and* nothing's in flight.
  const anyFailed = voterEntries.some((v) => v.status === 'error')
  const showRetryButton = !!onRetryFailed && anyFailed && !loading

  if (voterEntries.length === 0 && !banner) return null

  return (
    <section aria-label="Voting">
      <RoleBlockHeader
        icon={
          // Gold chip + label, like the Judge stage header — Voting shares the
          // gold "Trial verdict" family. (The voting *cards* below stay neutral
          // grey; only the Judge's verdict card is gold-tinted.)
          <RoleIconChip role="voting">
            <LuListChecks size={13} aria-hidden />
          </RoleIconChip>
        }
        label="Voting"
        accent={colors.label}
        // No voter count — the pager segments already convey how many there
        // are (mirrors the Roundtable header, which dropped its "N members").
        inlineMeta={
          multi ? (
            <VotingPager
              entries={cards}
              activeIdx={activeIdx}
              onJump={grid ? locate : jumpTo}
              winnerSeatId={winnerSeatId}
              mode={grid ? 'legend' : 'switcher'}
            />
          ) : undefined
        }
      >
        {showRetryButton && (
          <Button
            type="button"
            kind={ButtonKind.tertiary}
            size={ButtonSize.mini}
            onClick={onRetryFailed}
            aria-label="Retry failed voters"
            title="Retry only the voters that errored"
            overrides={{
              BaseButton: { style: { paddingLeft: '6px', paddingRight: '6px' } },
            }}
          >
            <FiRefreshCw size={14} aria-hidden />
          </Button>
        )}
      </RoleBlockHeader>

      {banner && <div className={css({ marginBottom: '8px' })}>{banner}</div>}

      {hasTargets && (
        <CardLane
          layout={grid ? 'grid' : 'carousel'}
          scrollerRef={scrollerRef}
          onScroll={onScroll}
        >
          {cards.map((entry, i) => (
            <TargetVoteCard
              key={entry.targetSeatId}
              entry={entry}
              isWinner={entry.targetSeatId === winnerSeatId}
              active={i === activeIdx}
              layout={grid ? 'grid' : multi ? 'carousel' : 'full'}
              flash={grid && i === flashIdx}
              loading={loading}
            />
          ))}
        </CardLane>
      )}
    </section>
  )
}
