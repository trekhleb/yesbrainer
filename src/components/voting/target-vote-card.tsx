/**
 * One target's peer-review card in the Voting carousel — the same per-LLM,
 * focus-carousel shape as the Roundtable answer it mirrors, in **neutral grey**
 * chrome (the same borders the Roundtable cards use). Voting is the *process*,
 * so only the final Judge verdict carries the gold — that's what makes the two
 * phases distinguishable while scrolling.
 *
 * Header: the target's identity + a gold ★ when it's the peer-rated winner,
 * and — right-aligned — the overall peer score (`overallScore`: the mean of
 * dimension averages). The score is the exact number that awards the winner
 * trophy, displayed so the ★ isn't a black box and so the grid compares in
 * one glance; it stays a quiet header chip (not a hero number) because the
 * *Judge* is the phase's real conclusion — a big score would compete with it.
 * Body: the *aggregated* per-dimension stars (averages across voters) + the
 * numeric mean, then the inline agreement signal (a colour-coded dot + label,
 * shown without a hover so it works on touch), then a collapsed "How others
 * voted" disclosure that reveals each voter's stars + comment (`<VoteDetail>`).
 */

import { useState } from 'react'
import { useStyletron } from 'baseui'
import { LabelXSmall } from 'baseui/typography'
import { FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { FaRegStar, FaTrophy } from 'react-icons/fa'
import { LoadingText } from '@/components/loading-text'
import { ModelIdentity } from '@/components/model-identity'
import { VoteDetail } from '@/components/voting/vote-detail'
import { Stars } from '@/components/voting/stars'
import {
  agreementLabel,
  agreementTextColor,
  agreementTooltip,
} from '@/utils/agreement'
import { humanizeDimension } from '@/utils/dimension-label'
import { overallScore } from '@/utils/vote-leaderboard'
import type { LeaderboardEntry } from '@/utils/vote-leaderboard'

import { laneCardGeometry } from '@/hooks/use-lane-layout'
import { PEEK_OPACITY } from '@/hooks/use-carousel'

export function TargetVoteCard({
  entry,
  isWinner,
  active = true,
  layout = 'full',
  flash = false,
  loading = false,
}: {
  entry: LeaderboardEntry
  /** This target had the highest aggregated score — gets the ★ marker. */
  isWinner: boolean
  /** Centred (in-focus) card — full opacity; peeks dim. Carousel only;
   *  the grid never dims. */
  active?: boolean
  /** How the card sits in its lane — mirrors `ParticipantPane`:
   *  `full` (single card), `carousel` (focus carousel + peek), or `grid`
   *  (the desktop Compare view — equal columns, all visible). */
  layout?: 'full' | 'carousel' | 'grid'
  /** Transient locate highlight (grid mode) — see `useLocateFlash`. */
  flash?: boolean
  /** Voting is still running — a target with no ratings yet shows an
   *  "awaiting votes" loader instead of the "no peer ratings" final state. */
  loading?: boolean
}) {
  const [css, theme] = useStyletron()
  const [expanded, setExpanded] = useState(false)
  const dimensions = entry.averages ? Object.entries(entry.averages) : []
  const voterCount = entry.ratings.length
  const score = overallScore(entry)

  return (
    <article
      className={css({
        opacity: layout === 'carousel' && !active ? PEEK_OPACITY : 1,
        transition: 'opacity 0.2s ease, outline-color 0.4s ease',
        // Inset locate ring — see ParticipantPane: an outward box-shadow
        // gets its top edge shaved by the sticky stage header's opaque
        // fill, so the ring lives inside the card bounds.
        outlineWidth: '2px',
        outlineStyle: 'solid',
        outlineColor: flash ? theme.colors.accent : 'transparent',
        outlineOffset: '-2px',
        backgroundColor: theme.colors.backgroundPrimary,
        // Neutral grey, like the Roundtable answer cards — Voting is the
        // *process*, so only the final Judge verdict carries the gold.
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '15px',
        lineHeight: 1.5,
        overflow: 'hidden',
        // Shared lane card geometry — one definition with the answer
        // panes and Mediator rounds (`laneCardGeometry`).
        ...laneCardGeometry(layout),
      })}
    >
      <header
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '13px',
          color: theme.colors.contentSecondary,
          backgroundColor: theme.colors.backgroundSecondary,
          borderBottom: `1px solid ${theme.colors.borderOpaque}`,
        })}
      >
        {isWinner && (
          <span
            title="Top peer-rated answer"
            aria-label="Top peer-rated answer"
            className={css({
              color: theme.colors.warning,
              display: 'inline-flex',
              flexShrink: 0,
            })}
          >
            <FaTrophy size={13} aria-hidden />
          </span>
        )}
        <ModelIdentity
          modelId={entry.targetModelId}
          displayLabel={entry.targetDisplayLabel}
        />
        {score !== null && (
          <span
            title={`Mean of the dimension averages across ${voterCount} ${
              voterCount === 1 ? 'voter' : 'voters'
            } — the score behind the ★`}
            aria-label={`Peer score ${score.toFixed(1)} out of 5`}
            className={css({
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            })}
          >
            {score.toFixed(1)}
            <FaRegStar aria-hidden size="0.85em" />
          </span>
        )}
      </header>

      <div
        className={css({
          padding: '10px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        })}
      >
        {dimensions.length > 0 ? (
          <div
            className={css({
              display: 'grid',
              gridTemplateColumns: 'auto auto auto',
              alignItems: 'center',
              rowGap: '4px',
              columnGap: '10px',
              width: 'fit-content',
              fontSize: '13px',
              color: theme.colors.contentSecondary,
            })}
          >
            {dimensions.map(([dim, avg]) => (
              <RatingRow key={dim} dim={dim} avg={avg} />
            ))}
          </div>
        ) : loading ? (
          <span className={css({ fontSize: '13px' })}>
            <LoadingText>awaiting votes</LoadingText>
          </span>
        ) : (
          <LabelXSmall
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentTertiary}
          >
            No peer ratings
          </LabelXSmall>
        )}

        {voterCount > 0 && (
          <div
            className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '10px',
              // Hairline separating the *final scores* above from the *context*
              // below — the agreement verdict + the raw per-voter votes.
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            <AgreementInline entry={entry} />
            <div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className={css({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  color: theme.colors.contentTertiary,
                  ':hover': { color: theme.colors.contentPrimary },
                  transition: 'color 120ms ease',
                })}
              >
                {expanded ? (
                  <FiChevronDown size={13} aria-hidden />
                ) : (
                  <FiChevronRight size={13} aria-hidden />
                )}
                How others voted ({voterCount})
              </button>
              {expanded && <VoteDetail entry={entry} />}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function RatingRow({ dim, avg }: { dim: string; avg: number }) {
  const [css, theme] = useStyletron()
  return (
    <>
      <span>{humanizeDimension(dim)}</span>
      <Stars value={avg} />
      <span
        className={css({
          color: theme.colors.contentPrimary,
          fontVariantNumeric: 'tabular-nums',
        })}
      >
        {avg.toFixed(1)}
      </span>
    </>
  )
}

/**
 * Inline agreement signal — a colour-coded dot + label ("Strong agreement" /
 * "Mixed agreement" / "Divergent views") in an AA-safe green / amber / red,
 * grounded by the **spread** (mean rating stdev across the dimensions, 1–5
 * scale) that drove the verdict — so the conclusion isn't a black box. Shown
 * without a hover (the old dot's tooltip was unreachable on touch); the full
 * sentence stays as a `title` for desktop. Renders nothing for `insufficient`
 * (fewer than two voters — no signal yet).
 */
function AgreementInline({ entry }: { entry: LeaderboardEntry }) {
  const [css, theme] = useStyletron()
  const color = agreementTextColor(entry.agreement, theme.name === 'dark-theme')
  if (!color) return null
  return (
    <span
      title={agreementTooltip(entry)}
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
      })}
    >
      <span
        aria-hidden
        className={css({
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        })}
      />
      <span className={css({ color, fontWeight: 500 })}>
        {agreementLabel(entry.agreement)}
      </span>
      {entry.meanStdev !== null && (
        <span
          className={css({
            color: theme.colors.contentTertiary,
            fontVariantNumeric: 'tabular-nums',
          })}
        >
          · scores ~{entry.meanStdev.toFixed(1)}
          <FaRegStar
            aria-hidden
            size="0.85em"
            style={{ verticalAlign: '-0.08em', marginLeft: '1px' }}
          />{' '}
          apart
        </span>
      )}
    </span>
  )
}
