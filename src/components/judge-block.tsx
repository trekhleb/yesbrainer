import { useStyletron } from 'baseui'
import {
  Button,
  KIND as ButtonKind,
  SIZE as ButtonSize,
} from 'baseui/button'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { LabelXSmall } from 'baseui/typography'
import { FiRotateCcw, FiShare2 } from 'react-icons/fi'
import { STRUCTURE_ICON } from '@/models/social-structures'
import { Markdown } from '@/components/markdown'
import { ModelIdentity } from '@/components/model-identity'
import { RoleBlockHeader } from '@/components/role-block-header'
import { RoleIconChip } from '@/components/role-icon-chip'
import { StatusTag } from '@/components/status-tag'
import { roleColors, roleHeaderBarStyle } from '@/utils/role-colors'
import { compactNotificationOverrides } from '@/utils/notification-styles'
import { ARRIVAL_ANIMATION } from '@/utils/arrival-animation'

/**
 * Final-decision block for Trial mode (one Judge per turn). Mirrors the
 * Mediator round-card layout so the two synthesis roles read identically:
 *
 *   - a **flat, sticky stage header** — the gavel icon in the Judge's accent +
 *     the model name in a grey identity pill (`ModelIdentity pill`), no tinted
 *     frame and no inline prompt-inspector (the Judge prompt lives in
 *     Settings → Prompts, same as the Mediator);
 *   - a single **colored answer card** shaped like a Mediator round card — the
 *     Judge's tint on the border + a tinted header bar carrying the bold
 *     "Verdict" title and the live status, over a white synthesis body.
 *
 * Streams while the Judge is generating; flips to the persisted shape once the
 * turn lands.
 */

export interface JudgeBlockProps {
  modelId: string
  output: string
  status: 'judging' | 'done' | 'error'
  error?: string | null
  /** Re-run the errored verdict in place. Supplied only where the retry is
   *  offered (persisted latest turn, nothing in flight); undefined hides
   *  the button. */
  onRetry?: () => void
  /** Open the share modal for this verdict. Supplied
   *  only on persisted, non-errored verdicts; undefined hides the button. */
  onShare?: () => void
  /** Play the one-shot arrival entrance (the "reveal").
   *  TurnView sets it on the latest turn's verdict only. */
  arrival?: boolean
}

export function JudgeBlock({
  modelId,
  output,
  status,
  error,
  onRetry,
  onShare,
  arrival = false,
}: JudgeBlockProps) {
  const [css, theme] = useStyletron()
  const colors = roleColors('judge', theme.name === 'dark-theme')

  return (
    <section aria-label="Judge">
      <RoleBlockHeader
        icon={
          <RoleIconChip role="judge">
            {/* Judge shares the Trial structure's icon (scales). */}
            <STRUCTURE_ICON.trial size={13} aria-hidden />
          </RoleIconChip>
        }
        label="Judge"
        accent={colors.label}
      />

      {/* Colored answer card — same shape as the Mediator round card: the
          Judge's tint on the border + header bar, white synthesis body. */}
      <article
        className={css({
          ...(arrival ? ARRIVAL_ANIMATION : {}),
          backgroundColor: theme.colors.backgroundPrimary,
          // Neutral grey outline like the Roundtable / Voting cards — the
          // *colour* identity lives in the tinted header bar below, not the
          // outline (a coloured card outline read a bit dated / "2000s").
          border: `1px solid ${theme.colors.borderOpaque}`,
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '15px',
          lineHeight: 1.5,
        })}
      >
        {/* Gold-tinted header bar — the Judge's colour identity; shared
            shape with the Mediator round card (`roleHeaderBarStyle`). */}
        <header className={css(roleHeaderBarStyle(theme, colors.bg))}>
          {/* Model identity leads the card header (like the Roundtable answer
              cards); the quiet "VERDICT" label sits to its right so the card
              reads as "<model>'s verdict". The role chip now lives on the
              stage header above, so it isn't duplicated here. */}
          <ModelIdentity modelId={modelId} />
          <LabelXSmall
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentTertiary}
            overrides={{
              Block: {
                style: {
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontWeight: 600,
                },
              },
            }}
          >
            Verdict
          </LabelXSmall>
          {onShare && (
            <>
              <span className={css({ flex: 1 })} />
              {/* Quiet icon-only trigger — the verdict card is the content;
                  sharing is an affordance, not a headline. */}
              <button
                type="button"
                onClick={onShare}
                aria-label="Share verdict"
                title="Share verdict"
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
            </>
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
            {output ? (
              <Markdown>{output}</Markdown>
            ) : status === 'judging' ? (
              // Loader at the top-left of the body (under the header) so it's
              // instantly visible, not clipped in the header's right edge.
              <StatusTag status="judging" />
            ) : (
              <span className={css({ opacity: 0.5 })}>…</span>
            )}
          </div>

          {error && (
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
                <span>{error}</span>
                {/* Re-run just the verdict — every answer and vote in this
                    turn is already paid for, so recovery lives right on the
                    error instead of making the user re-ask the council. */}
                {onRetry && (
                  <Button
                    type="button"
                    kind={ButtonKind.secondary}
                    size={ButtonSize.mini}
                    onClick={onRetry}
                    startEnhancer={() => <FiRotateCcw size={12} />}
                  >
                    Retry
                  </Button>
                )}
              </span>
            </Notification>
          )}
        </div>
      </article>
    </section>
  )
}
