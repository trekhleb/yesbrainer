import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/dom'
import { PausedNotice } from '@/components/chat-thread/paused-notice'
import { renderUi } from '../helpers/render'
import type { TurnRunState } from '@/types/council'

const NOW = 1_000_000

function runState(over: Partial<TurnRunState> = {}): TurnRunState {
  return {
    status: 'interrupted',
    phase: 'answers',
    startedAt: NOW - 120_000,
    heartbeatAt: NOW,
    activeSeatIds: ['s1'],
    ...over,
  }
}

describe('PausedNotice', () => {
  it('names the mechanism, not a failure — the whole point is that a backgrounded run did not break', () => {
    renderUi(<PausedNotice runState={runState()} now={NOW} />)
    expect(
      screen.getByText(/Paused when the app went to the background/),
    ).toBeTruthy()
  })

  it('says so plainly when the connection dropped instead', () => {
    renderUi(
      <PausedNotice runState={runState()} cause="connection" now={NOW} />,
    )
    expect(
      screen.getByText(/Paused when the connection dropped/),
    ).toBeTruthy()
  })

  it('carries the point-of-consumption honesty line: a council does not keep running while the app is away', () => {
    renderUi(<PausedNotice runState={runState()} now={NOW} />)
    expect(
      screen.getByText(/only runs while the app is open/),
    ).toBeTruthy()
  })

  it('reports where the debate got to', () => {
    renderUi(
      <PausedNotice
        runState={runState({ phase: 'mediating', round: 3, maxRounds: 5 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/at round 3 of 5/)).toBeTruthy()
  })

  it('falls back to a roundless description when the cap is unknown', () => {
    renderUi(
      <PausedNotice runState={runState({ phase: 'mediating' })} now={NOW} />,
    )
    expect(screen.getByText(/during the debate/)).toBeTruthy()
  })

  it('ages the heartbeat coarsely, and omits it entirely under a minute rather than implying precision the throttled heartbeat does not have', () => {
    const { unmount } = renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 4 * 60_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/4 minutes ago/)).toBeTruthy()
    unmount()

    renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 20_000 })}
        now={NOW}
      />,
    )
    expect(screen.queryByText(/ago/)).toBeNull()
  })

  it('offers Resume only when a resume is actually possible', async () => {
    const onResume = vi.fn()
    const { unmount } = renderUi(
      <PausedNotice runState={runState()} onResume={onResume} now={NOW} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onResume).toHaveBeenCalledOnce()
    unmount()

    // Without the handler the state is still explained — the card is not
    // just a button holder — but nothing invites a click that can't work.
    renderUi(<PausedNotice runState={runState()} now={NOW} />)
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.getByText(/Paused when/)).toBeTruthy()
  })
})

describe('PausedNotice — phase wording', () => {
  it.each([
    ['voting' as const, /during peer review/],
    ['judging' as const, /while the judge was deciding/],
    ['answers' as const, /while the council was answering/],
    ['reanswering' as const, /during the debate/],
  ])('describes the %s phase in the user’s terms', (phase, pattern) => {
    const { unmount } = renderUi(
      <PausedNotice runState={runState({ phase })} now={NOW} />,
    )
    expect(screen.getByText(pattern)).toBeTruthy()
    unmount()
  })

  it('rounds a long pause up to hours rather than counting minutes forever', () => {
    const { unmount } = renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 60 * 60_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 hour ago/)).toBeTruthy()
    unmount()

    renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 3 * 60 * 60_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/3 hours ago/)).toBeTruthy()
  })

  it('rolls past hours into days rather than reading "72 hours ago"', () => {
    const { unmount } = renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 24 * 60 * 60_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 day ago/)).toBeTruthy()
    unmount()

    renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 3 * 24 * 60 * 60_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/3 days ago/)).toBeTruthy()
  })

  it('says "1 minute ago" in the singular', () => {
    renderUi(
      <PausedNotice
        runState={runState({ heartbeatAt: NOW - 61_000 })}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 minute ago/)).toBeTruthy()
  })
})

describe('PausedNotice — a run owned by a previous mount', () => {
  it('reports the run instead of offering a Resume that would only bounce off its lock', () => {
    const onResume = vi.fn()
    renderUi(
      <PausedNotice
        runState={runState()}
        onResume={onResume}
        resuming
        now={NOW}
      />,
    )
    expect(screen.getByText(/Picking up where it stopped/)).toBeTruthy()
    expect(screen.getByText(/keeps going in the background/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })
})
