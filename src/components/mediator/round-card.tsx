/**
 * One Mediator round inside a Consensus turn, styled like a
 * Roundtable answer card but tinted with the Mediator's violet so the
 * synthesis reads as a *distinct* voice from the Participant answers.
 *
 * Header bar: mediator logo + name, the `Round X of N` progress, and the
 * round's badges (`Final`, `Consensus reached` / `No consensus`). Body:
 * the synthesis markdown. When the round didn't converge, the points the
 * Mediator flagged as still-in-dispute render open by default inside a
 * warning notification — they're the "what still needs reconciling", so
 * they shouldn't be hidden behind a disclosure.
 */

import { useState } from 'react'
import { useStyletron } from 'baseui'
import {
  Button,
  KIND as ButtonKind,
  SIZE as ButtonSize,
} from 'baseui/button'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { Tag, KIND as TagKind, SIZE as TagSize } from 'baseui/tag'
import { LabelXSmall } from 'baseui/typography'
import { FiRotateCcw, FiShare2 } from 'react-icons/fi'
import { LuChevronRight, LuMessagesSquare } from 'react-icons/lu'
import { ErrorInspector } from '@/components/error-inspector'
import { Markdown } from '@/components/markdown'
import { StatusTag } from '@/components/status-tag'
import { compactNotificationOverrides } from '@/utils/notification-styles'
import { roleColors, roleHeaderBarStyle } from '@/utils/role-colors'
import { ARRIVAL_ANIMATION } from '@/utils/arrival-animation'

import { laneCardGeometry } from '@/hooks/use-lane-layout'
import { PEEK_OPACITY } from '@/hooks/use-carousel'
import type {
  MediatorRoundView,
  ResolvedMovement,
} from '@/types/session'

/** Stance → short verb + Tag kind for the movement chips. The colour is the
 *  glanceable signal (green moved / amber held); the verb disambiguates. */
const STANCE_META: Record<
  ResolvedMovement['stance'],
  { verb: string; kind: (typeof TagKind)[keyof typeof TagKind] }
> = {
  converged: { verb: 'moved', kind: TagKind.positive },
  shifted: { verb: 'shifted', kind: TagKind.accent },
  held: { verb: 'held', kind: TagKind.warning },
  'new-point': { verb: 'new point', kind: TagKind.neutral },
}

export function RoundCard({
  round,
  maxRounds,
  isFinal,
  peek = false,
  active = true,
}: {
  round: MediatorRoundView
  maxRounds: number
  isFinal: boolean
  /** True when the card sits in a multi-round carousel lane — fixes it to
   *  ~80% of the lane (container-query units) so the next round always peeks
   *  in from the edge, matching the Roundtable answer lane. A single round
   *  spans the full width instead. */
  peek?: boolean
  /** True when this round is the centred (in-focus) card. In-focus = full
   *  opacity; the peeking rounds sit semi-transparent so the round you're
   *  reading reads as solid. Keyed to the active index (not scroll position),
   *  so the focused round is always solid even flush at the lane ends; the
   *  `transition` animates the crossfade. */
  active?: boolean
}) {
  const [css, theme] = useStyletron()
  const colors = roleColors('mediator', theme.name === 'dark-theme')
  const [digestOpen, setDigestOpen] = useState(false)
  return (
    <article
      className={css({
        ...(round.arrival ? ARRIVAL_ANIMATION : {}),
        opacity: active ? 1 : PEEK_OPACITY,
        transition: 'opacity 0.2s ease',
        backgroundColor: theme.colors.backgroundPrimary,
        // Uniform neutral grey outline across rounds (the `Final` badge marks
        // the answer); the Mediator's *colour* lives in the tinted header bar
        // below, not the outline — a coloured card outline read a bit dated.
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '15px',
        lineHeight: 1.5,
        overflow: 'hidden',
        // Carousel geometry — identical to the Roundtable panes so the
        // two lanes scroll/peek the same way (one definition:
        // `laneCardGeometry`).
        ...(peek ? laneCardGeometry('carousel') : {}),
      })}
    >
      {/* Teal-tinted header bar — the Mediator's colour identity; shared
          shape with the Judge verdict card (`roleHeaderBarStyle`). */}
      <header className={css(roleHeaderBarStyle(theme, colors.bg))}>
        {/* The round title — the card's heading. Bold + primary colour so it
            reads as a heading, not a third chip competing with the verdict
            badges beside it. */}
        <LabelXSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentPrimary}
          overrides={{
            Block: { style: { whiteSpace: 'nowrap', fontWeight: 700 } },
          }}
        >
          Round #{round.round} of {maxRounds}
        </LabelXSmall>
        {isFinal && <Badge kind={TagKind.accent}>Final</Badge>}
        {round.convergent === true && (
          <Badge kind={TagKind.positive}>Consensus reached</Badge>
        )}
        {round.convergent === false && (
          <Badge kind={TagKind.warning}>No consensus</Badge>
        )}
        <span className={css({ flex: 1 })} />
        {round.onShare && (
          // Quiet icon-only trigger, mirroring the Judge card — sharing is
          // an affordance on the result, not a badge competing with them.
          <button
            type="button"
            onClick={round.onShare}
            aria-label="Share consensus"
            title="Share consensus"
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
        {round.rawResponse && (
          <ErrorInspector
            label="Raw model response"
            description="What the Mediator model actually returned. For structured-output failures, this is the JSON that wouldn't parse / didn't match the expected schema (synthesis + convergent + divergencePoints + roundDigest)."
            rawResponse={round.rawResponse}
            ariaLabel={`Show raw Mediator response for round ${round.round}`}
          />
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
        <div>
          {round.synthesis ? (
            <Markdown>{round.synthesis}</Markdown>
          ) : round.status === 'mediating' ? (
            // Loader at the top-left of the body — the Mediator round is
            // non-streaming (the synthesis lands all at once), so this is the
            // sole progress cue for the whole round; it must be where the eye
            // already is, not clipped in the header's right edge.
            <StatusTag
              status="judging"
              label="seeking consensus"
              // Debate bubbles, not the default gavel — the Mediator referees
              // a conversation; it doesn't rule.
              icon={<LuMessagesSquare size={12} />}
            />
          ) : (
            <span className={css({ opacity: 0.5 })}>…</span>
          )}
        </div>

        {round.error && (
          <Notification
            kind={NotificationKind.negative}
            overrides={compactNotificationOverrides({ fontSize: '13px' })}
          >
            <span
              className={css({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '8px',
              })}
            >
              <span>{round.error}</span>
              {/* Re-run just this round — the whole debate up to here is
                  already paid for, so recovery lives right on the error
                  instead of making the user re-ask the council. */}
              {round.onRetry && (
                <Button
                  type="button"
                  kind={ButtonKind.secondary}
                  size={ButtonSize.mini}
                  onClick={round.onRetry}
                  startEnhancer={() => <FiRotateCcw size={12} />}
                >
                  Retry
                </Button>
              )}
            </span>
          </Notification>
        )}

        {round.divergencePoints && (
          <Notification
            kind={NotificationKind.warning}
            overrides={compactNotificationOverrides({ fontSize: '13px' })}
          >
            <div
              className={css({
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              })}
            >
              <span className={css({ fontWeight: 600 })}>
                Divergence points the Mediator flagged
              </span>
              <Markdown>{round.divergencePoints}</Markdown>
            </div>
          </Notification>
        )}

        {round.digest && round.digest.movements.length > 0 && (
          <div
            className={css({
              fontSize: '13px',
              // Set the round digest apart from the consensus prose above it.
              // Without a break the metadata reads as a trailing sentence of
              // the synthesis; a hairline divider (the card's own grey) plus
              // extra top space frames it as "outcome of the round" metadata.
              marginTop: '8px',
              paddingTop: '12px',
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            {/* Custom disclosure (not native <details>): the chevron, label,
                and stance chips share one flex row and wrap together — the
                native marker used to orphan onto its own line. */}
            <button
              type="button"
              onClick={() => setDigestOpen((o) => !o)}
              aria-expanded={digestOpen}
              className={css({
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                padding: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '13px',
                color: theme.colors.contentSecondary,
              })}
            >
              <LuChevronRight
                size={14}
                aria-hidden
                className={css({
                  flex: '0 0 auto',
                  transition: 'transform 0.15s ease',
                  transform: digestOpen ? 'rotate(90deg)' : 'none',
                })}
              />
              <span className={css({ fontWeight: 600 })}>
                What changed this round
              </span>
              {round.digest.movements.map((m, i) => {
                const meta = STANCE_META[m.stance]
                return (
                  <Badge key={`${i}-${m.displayLabel}`} kind={meta.kind}>
                    {m.displayLabel} {meta.verb}
                  </Badge>
                )
              })}
            </button>
            {digestOpen && (
              <div
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  paddingTop: '8px',
                })}
              >
                {round.digest.summary && (
                  <span
                    className={css({ color: theme.colors.contentSecondary })}
                  >
                    {round.digest.summary}
                  </span>
                )}
                <ul
                  className={css({
                    margin: 0,
                    paddingLeft: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  })}
                >
                  {round.digest.movements.map((m, i) => (
                    <li key={`${i}-${m.displayLabel}`}>
                      <strong>{m.displayLabel}</strong> —{' '}
                      {STANCE_META[m.stance].verb}: {m.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * Status / verdict badge. Base Web's `<Tag>` truncates its label past a
 * default max-width (that's what clipped "Consensus reached" → "Consensus
 * reach…"); the `Text` override lifts that cap so the badge always shows
 * its full text, and the `Root` override zeroes Base Web's stock side
 * margins so it sits flush in the header's flex gap.
 */
function Badge({
  kind,
  children,
}: {
  kind: (typeof TagKind)[keyof typeof TagKind]
  children: React.ReactNode
}) {
  return (
    <Tag
      closeable={false}
      kind={kind}
      // xSmall — the verdict badges sit beside the bold round title (itself
      // LabelXSmall) and status; the default (medium) font read heavy next to
      // them, so drop to the smallest tag scale to match the title.
      size={TagSize.xSmall}
      overrides={{
        Root: {
          style: {
            marginTop: 0,
            marginBottom: 0,
            marginLeft: 0,
            marginRight: 0,
          },
        },
        Text: { style: { maxWidth: 'none', whiteSpace: 'nowrap' } },
      }}
    >
      {children}
    </Tag>
  )
}
