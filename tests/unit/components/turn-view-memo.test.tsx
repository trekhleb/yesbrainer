import { fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderUi } from '../helpers/render'
import { participantEvent, seat, turn } from '../helpers/fixtures'
import type { Turn } from '@/types/council'

/**
 * Guards `memo(TurnView)`. While a new turn streams below, the whole
 * thread re-renders per flush; the memo must keep *settled* turns from
 * re-rendering. `ubSpy` counts renders via `UserBubble` — a leaf TurnView
 * always renders once and which is itself un-memoized, so it re-renders iff its
 * TurnView did.
 */
const { ubSpy } = vi.hoisted(() => ({ ubSpy: vi.fn() }))
vi.mock('@/components/user-bubble', () => ({
  UserBubble: () => {
    ubSpy()
    return null
  },
}))
// Keep the answer panes cheap — we're counting TurnView renders, not parsing.
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <>{children}</>,
}))
vi.mock('@/utils/shiki-highlighter', () => ({ getShikiHighlighter: () => ({}) }))

import { TurnView } from '@/components/chat-thread/turn-view'

// Stable references (as at the real council-view seam): a parent re-render must
// hand TurnView shallow-equal props for the memo to bite.
const seats = [seat('s1')]
const onRetryFailedVotes = vi.fn()

function Harness({ initial }: { initial: Turn }) {
  const [t, setT] = useState(initial)
  const [, setBump] = useState(0)
  return (
    <>
      <button onClick={() => setBump((v) => v + 1)}>bump</button>
      <button
        onClick={() =>
          setT(
            turn({
              id: 'changed',
              events: [participantEvent('s1', { output: 'a different answer' })],
            }),
          )
        }
      >
        change
      </button>
      <TurnView
        turn={t}
        seats={seats}
        socialStructure="roundtable"
        votingTurnOverlay={null}
        actionsEnabled
        onRetryFailedVotes={onRetryFailedVotes}
        seatRetryOverlay={null}
        synthRetryOverlay={null}
      />
    </>
  )
}

describe('memo(TurnView)', () => {
  beforeEach(() => ubSpy.mockClear())

  it('does not re-render a settled turn when the parent re-renders around it', () => {
    const settled = turn({
      events: [participantEvent('s1', { output: 'settled answer' })],
    })
    const { getByText } = renderUi(<Harness initial={settled} />)
    expect(ubSpy).toHaveBeenCalledTimes(1)
    // Five parent re-renders with identical props — the memo skips every one.
    for (let i = 0; i < 5; i++) fireEvent.click(getByText('bump'))
    expect(ubSpy).toHaveBeenCalledTimes(1)
  })

  it('re-renders when the turn prop actually changes', () => {
    const settled = turn({
      events: [participantEvent('s1', { output: 'settled answer' })],
    })
    const { getByText } = renderUi(<Harness initial={settled} />)
    expect(ubSpy).toHaveBeenCalledTimes(1)
    fireEvent.click(getByText('change'))
    expect(ubSpy).toHaveBeenCalledTimes(2)
  })
})
