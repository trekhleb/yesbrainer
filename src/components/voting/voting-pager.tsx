/**
 * Voting carousel pager — one segment per target (the rated answers), over the
 * shared `<SegmentedTabs>` chrome so it looks identical to the Roundtable
 * answer pager + Mediator round pager. Idle segments show the provider logo;
 * the active one expands to logo + label. The peer-rated **winner** wears a
 * gold ★ on its segment (mirrors how the Mediator marks its consensus round),
 * so who came out on top is visible without opening every card.
 */

import { useStyletron } from 'baseui'
import { FaTrophy } from 'react-icons/fa'
import { ProviderLogo } from '@/components/provider-logo'
import {
  ActiveSegmentLabel,
  SegmentedTabs,
} from '@/components/segmented-tabs'
import { getModel } from '@/models/registry'
import type { LeaderboardEntry } from '@/utils/vote-leaderboard'


export function VotingPager({
  entries,
  activeIdx,
  onJump,
  winnerSeatId,
  mode = 'switcher',
}: {
  entries: LeaderboardEntry[]
  activeIdx: number
  onJump: (idx: number) => void
  winnerSeatId: string | null
  /** `legend` when the lane renders as the Compare grid — identity/status
   *  (incl. the winner ★) stay; a click *locates* instead of switching. */
  mode?: 'switcher' | 'legend'
}) {
  return (
    <SegmentedTabs
      ariaLabel={
        mode === 'legend' ? 'Highlight a rated answer' : 'Jump to a rated answer'
      }
      activeIdx={activeIdx}
      onJump={onJump}
      mode={mode}
      tabs={entries.map((entry) => {
        const label = entry.targetDisplayLabel
        const isWinner = entry.targetSeatId === winnerSeatId
        return {
          key: entry.targetSeatId,
          ariaLabel: isWinner ? `${label} (top rated)` : label,
          content: (active: boolean) => (
            <TargetSegment
              entry={entry}
              label={label}
              active={active}
              isWinner={isWinner}
            />
          ),
        }
      })}
    />
  )
}

function TargetSegment({
  entry,
  label,
  active,
  isWinner,
}: {
  entry: LeaderboardEntry
  label: string
  active: boolean
  isWinner: boolean
}) {
  const [css, theme] = useStyletron()
  const model = getModel(entry.targetModelId)
  return (
    <>
      {isWinner && (
        <span
          title="Top rated"
          className={css({
            display: 'inline-flex',
            flexShrink: 0,
            color: theme.colors.warning,
          })}
        >
          <FaTrophy size={12} aria-hidden />
        </span>
      )}
      <ProviderLogo provider={model.provider} size={15} />
      {active && <ActiveSegmentLabel>{label}</ActiveSegmentLabel>}
    </>
  )
}
