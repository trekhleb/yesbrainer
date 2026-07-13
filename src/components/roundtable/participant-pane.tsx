/**
 * One Participant's answer pane inside a Roundtable / re-answer layout.
 * Holds the model-identity header bar, status tag, captured tool-call
 * strip, and the markdown body (or ghost-reason placeholder for
 * skipped seats).
 *
 * The header renders as a distinct *bar* (soft fill + hairline bottom
 * border) so the model identity reads as card chrome, not as the first
 * line of the answer — with several dense markdown columns side by
 * side, an inline header was getting lost in the text.
 */

import { useStyletron } from 'baseui'
import { Button, KIND as ButtonKind, SIZE as ButtonSize } from 'baseui/button'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { LabelSmall } from 'baseui/typography'
import { FiRotateCcw } from 'react-icons/fi'
import { Markdown } from '@/components/markdown'
import { ProviderLogo } from '@/components/provider-logo'
import { StatusTag } from '@/components/status-tag'
import { ThinkingStrip } from '@/components/roundtable/thinking-strip'
import { ToolCallStrip } from '@/components/roundtable/tool-call-strip'
import { getModel } from '@/models/registry'
import { compactNotificationOverrides } from '@/utils/notification-styles'
import type { RoundtablePane } from '@/types/session'

import { laneCardGeometry } from '@/hooks/use-lane-layout'
import { PEEK_OPACITY } from '@/hooks/use-carousel'
export function ParticipantPane({
  pane,
  layout = 'full',
  active = true,
  flash = false,
}: {
  pane: RoundtablePane
  /** How the pane sits in its lane:
   *  - `full` — single-seat lane; the pane spans the whole width
   *    (regular chat).
   *  - `carousel` — multi-pane focus carousel: ~80% of the lane
   *    (container-query units) so the next answer always peeks in from
   *    the edge — the visible sliver *is* the scroll affordance.
   *  - `grid` — the desktop Compare view: equal
   *    columns, all visible, no dimming. */
  layout?: 'full' | 'carousel' | 'grid'
  /** True when this pane is the centred (in-focus) card — **carousel
   *  only**. In-focus = full opacity; the peeking neighbours sit semi-
   *  transparent so the answer you're reading is the one that reads as
   *  solid. Keyed to the active index (not scroll position), so the
   *  focused card is always solid even flush at the lane ends; the
   *  `transition` animates the crossfade. Ignored in the grid, where
   *  every column is a first-class read. */
  active?: boolean
  /** Transient locate highlight (grid mode): the legend pager flashes a
   *  ring on the card it names, since there's nothing to scroll to. */
  flash?: boolean
}) {
  const [css, theme] = useStyletron()
  const model = getModel(pane.modelId)
  const ghosted = pane.ghostReason !== undefined
  // Focus dim composes with the ghost dim (a skipped seat stays ghosted
  // whether or not it's the one in focus). The grid never focus-dims.
  const focusDim = layout === 'carousel' && !active ? PEEK_OPACITY : 1
  const opacity = focusDim * (ghosted ? 0.55 : 1)
  return (
    <article
      className={css({
        opacity,
        transition: 'opacity 0.2s ease, outline-color 0.4s ease',
        // Locate ring drawn *inside* the card (inset outline), not a
        // box-shadow: an outward ring pokes 2px above the card into the
        // sticky stage header's opaque fill (z-index 3), which shaved its
        // top edge. Inside the bounds nothing can clip it, and it costs
        // no layout. Longhands only (styletron's atomic renderer warns on
        // shorthand+longhand mixes).
        outlineWidth: '2px',
        outlineStyle: 'solid',
        outlineColor: flash ? theme.colors.accent : 'transparent',
        outlineOffset: '-2px',
        // Lane card geometry is shared with the Voting targets and the
        // Mediator rounds (`laneCardGeometry`); `full` is the single-pane
        // case, where the pane stretches to its row instead.
        ...(layout === 'full'
          ? { flex: '0 0 auto', width: '100%' }
          : laneCardGeometry(layout)),
        backgroundColor: theme.colors.backgroundPrimary,
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '15px',
        lineHeight: 1.5,
        overflow: 'hidden',
      })}
    >
      <header
        className={css({
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '12px',
          paddingRight: '12px',
          fontSize: '13px',
          color: theme.colors.contentSecondary,
          backgroundColor: theme.colors.backgroundSecondary,
          borderBottom: `1px solid ${theme.colors.borderOpaque}`,
          flexShrink: 0,
        })}
      >
        <ProviderLogo provider={model.provider} size={14} />
        <LabelSmall
          marginTop="0"
          marginBottom="0"
          overrides={{ Block: { style: { fontWeight: 600 } } }}
        >
          {pane.displayLabel ?? model.label}
        </LabelSmall>
      </header>
      <div
        className={css({
          padding: '10px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          // No inner reading-measure cap: prose fills the card. The card's
          // own width cap (peek geometry above) is the only bound, so the
          // body uses the full panel rather than leaving inner gutters.
        })}
      >
        {!ghosted && pane.toolCalls && pane.toolCalls.length > 0 && (
          <ToolCallStrip toolCalls={pane.toolCalls} />
        )}
        <div>
          {ghosted ? (
            <span
              className={css({
                fontStyle: 'italic',
                color: theme.colors.contentTertiary,
                fontSize: '13px',
              })}
            >
              {pane.ghostReason}
            </span>
          ) : pane.output ? (
            <Markdown>{pane.output}</Markdown>
          ) : pane.status === 'streaming' ? (
            // Before any answer text: the live thinking feed when the model
            // streams one (reasoning models — the wait reads as a mind at
            // work), else the bare loader tag. Both are in-flight-only —
            // the moment output starts, the branch above takes over and the
            // thinking feed disappears (it is never persisted).
            pane.reasoning ? (
              <ThinkingStrip text={pane.reasoning} />
            ) : (
              // Loader sits at the top-left of the card body (under the
              // header), so it's instantly visible even when the header's
              // right edge is clipped on a narrow / peeking card.
              <StatusTag status="streaming" />
            )
          ) : null}
          {!ghosted && pane.error && (
            <Notification
              kind={NotificationKind.negative}
              overrides={compactNotificationOverrides({
                marginTop: '4px',
                fontSize: '13px',
              })}
            >
              <span
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                })}
              >
                <span>{pane.error}</span>
                {/* Re-run just this seat — the answer, not the affordance,
                    is what failed, so recovery lives right on the error
                    instead of making the user re-ask the whole council. */}
                {pane.onRetry && (
                  <Button
                    type="button"
                    kind={ButtonKind.secondary}
                    size={ButtonSize.mini}
                    onClick={pane.onRetry}
                    startEnhancer={() => <FiRotateCcw size={12} />}
                  >
                    Retry
                  </Button>
                )}
              </span>
            </Notification>
          )}
        </div>
      </div>
    </article>
  )
}
