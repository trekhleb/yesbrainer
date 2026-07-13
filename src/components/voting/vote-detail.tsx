/**
 * "How others voted" detail for one target — toggled open inside a
 * `<TargetVoteCard>`. One block per voter: their identity, their per-dimension
 * star ratings, and their italic comment (when present).
 *
 * This is the only place the raw per-voter votes live: the old always-expanded
 * voter-column grid showed the same ratings + comments a second time
 * (voter-centric), so it was removed and its content folded here — read
 * target-centric, under the answer you care about.
 */

import { Fragment } from 'react'
import { useStyletron } from 'baseui'
import { ParagraphXSmall } from 'baseui/typography'
import { ModelIdentity } from '@/components/model-identity'
import { Stars } from '@/components/voting/stars'
import { humanizeDimension } from '@/utils/dimension-label'
import type { LeaderboardEntry } from '@/utils/vote-leaderboard'

export function VoteDetail({ entry }: { entry: LeaderboardEntry }) {
  const [css, theme] = useStyletron()
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        marginTop: '4px',
        paddingTop: '8px',
        borderTop: `1px solid ${theme.colors.borderOpaque}`,
      })}
    >
      {entry.ratings.map((rating, i) => {
        const comment = rating.vote.comment.trim()
        const dimensions = Object.entries(rating.vote.ratings)
        return (
          <div
            key={`${entry.targetSeatId}:${rating.voterSeatId}`}
            className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              // Breathing room + a hairline between each voter's vote so the
              // stacked blocks don't read as one dense wall.
              ...(i > 0
                ? {
                    marginTop: '14px',
                    paddingTop: '14px',
                    borderTop: `1px solid ${theme.colors.borderOpaque}`,
                  }
                : {}),
            })}
          >
            <span
              className={css({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                color: theme.colors.contentTertiary,
              })}
            >
              <span>From</span>
              <ModelIdentity
                modelId={rating.voterModelId}
                displayLabel={rating.voterDisplayLabel}
              />
            </span>
            {dimensions.length > 0 && (
              <div
                className={css({
                  display: 'grid',
                  gridTemplateColumns: 'auto auto',
                  rowGap: '1px',
                  columnGap: '8px',
                  width: 'fit-content',
                  fontSize: '12px',
                  color: theme.colors.contentSecondary,
                })}
              >
                {dimensions.map(([dim, value]) => (
                  <Fragment key={dim}>
                    <span>{humanizeDimension(dim)}</span>
                    <Stars value={value} />
                  </Fragment>
                ))}
              </div>
            )}
            {comment && (
              <ParagraphXSmall
                marginTop="0"
                marginBottom="0"
                color={theme.colors.contentPrimary}
                overrides={{ Block: { style: { fontStyle: 'italic' } } }}
              >
                “{comment}”
              </ParagraphXSmall>
            )}
          </div>
        )
      })}
    </div>
  )
}
