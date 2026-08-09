/**
 * The card an interrupted turn wears instead of a wall of red.
 *
 * When iOS suspends a locked phone (or a desktop tab is discarded) every
 * in-flight provider stream loses its transport at once. Nothing about the
 * council failed, so nothing here is styled as a failure: this is a quiet,
 * neutral card that sits *below* everything the turn did finish, which is
 * the part that actually undoes the "it crashed" feeling — the completed
 * rounds are all still there above it.
 *
 * Deliberately not a Base Web `<Notification>`: those are the app's
 * problem-banner vocabulary (see DEVELOPMENT.md → "banners are for
 * problems"), and reusing that vocabulary here would say "error" in the
 * one place the design is trying not to.
 *
 * Copy follows the project's posture — the mechanism, stated as fact, with
 * no promise attached. It says the run paused and that resuming continues
 * from what's saved; it never claims the council keeps working in the
 * background, because it doesn't.
 */

import { useState } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { LoadingText } from '@/components/loading-text'
import type { InterruptionCause } from '@/utils/session/interruption'
import type { TurnRunState } from '@/types/council'

/** "4 minutes ago" — coarse on purpose. The heartbeat that feeds this is
 *  throttled while the page is hidden, so anything finer would be dressing
 *  up an estimate as a measurement. */
function agoLabel(since: number, now: number): string | null {
  const minutes = Math.floor((now - since) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return null
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  // A turn recovered days later shouldn't read "72 hours ago".
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function causeLabel(cause: InterruptionCause): string {
  return cause === 'connection'
    ? 'Paused when the connection dropped'
    : 'Paused when the app went to the background'
}

/** Where the run got to, in the user's terms rather than the phase enum's. */
function phaseLabel(runState: TurnRunState): string | null {
  switch (runState.phase) {
    case 'answers':
      return 'while the council was answering'
    case 'voting':
      return 'during peer review'
    case 'judging':
      return 'while the judge was deciding'
    case 'mediating':
    case 'reanswering':
      return runState.round && runState.maxRounds
        ? `at round ${runState.round} of ${runState.maxRounds}`
        : 'during the debate'
  }
}

export interface PausedNoticeProps {
  runState: TurnRunState
  /** Which explanation to show. Not persisted — a turn recovered on a cold
   *  start has no record of *why* the page went away, and backgrounding is
   *  the honest default guess for a run that stopped without an error. */
  cause?: InterruptionCause
  /** Absent when the turn can't be resumed right now — something else is in
   *  flight, or it isn't the latest turn any more. Same `actionsEnabled`
   *  gate the retry affordances use: a control that fires provider calls is
   *  hidden, not disabled, when it can't fire them. */
  onResume?: () => void
  /** A run for this council is already going, started before the user
   *  navigated away and back. The streaming view can't render it — its
   *  state died with the previous mount — so this card carries the news
   *  instead of offering a Resume that would only bounce off the run's
   *  lock. */
  resuming?: boolean
  /** Injected in tests so the "N minutes ago" line is deterministic. */
  now?: number
}

export function PausedNotice({
  runState,
  cause = 'backgrounded',
  onResume,
  resuming = false,
  now,
}: PausedNoticeProps) {
  const [css, theme] = useStyletron()
  // Read once, in a state initializer, rather than per render: `Date.now()`
  // in the render body is impure (and lint-caught). Not re-read on a tick
  // either — the label is deliberately coarse, and a card that sits on
  // screen long enough for the minute to roll over is not worth a timer.
  const [mountedAt] = useState(() => Date.now())
  const ago = agoLabel(runState.heartbeatAt, now ?? mountedAt)
  const where = phaseLabel(runState)

  return (
    <div
      className={css({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundSecondary,
      })}
    >
      <div className={css({ flex: '1 1 260px', minWidth: 0 })}>
        <div
          className={css({
            ...theme.typography.LabelSmall,
            color: theme.colors.contentPrimary,
          })}
        >
          {resuming ? (
            <LoadingText>Picking up where it stopped</LoadingText>
          ) : (
            <>
              {causeLabel(cause)}
              {where ? ` ${where}` : ''}
              {ago ? ` · ${ago}` : ''}
            </>
          )}
        </div>
        <div
          className={css({
            ...theme.typography.ParagraphXSmall,
            color: theme.colors.contentTertiary,
            marginTop: '2px',
          })}
        >
          {resuming
            ? 'Started before you navigated away — it keeps going in the background.'
            : 'A council only runs while the app is open — everything it finished is saved, and resuming continues from there.'}
        </div>
      </div>
      {onResume && !resuming ? (
        <Button kind={KIND.secondary} size={SIZE.compact} onClick={onResume}>
          Resume
        </Button>
      ) : null}
    </div>
  )
}
