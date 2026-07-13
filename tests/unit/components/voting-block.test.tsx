import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VotingBlock } from '@/components/voting-block'
import { aggregateVotesByTarget } from '@/utils/vote-leaderboard'
import { renderUi } from '../helpers/render'
import { participantEvent, seat } from '../helpers/fixtures'
import type { TurnEvent } from '@/types/council'
import type { VoterEntry } from '@/types/session'

const seats = [seat('s1'), seat('s2')]

function voteEvent(voterId: string, targetId: string): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    vote: [{ targetSeatId: targetId, ratings: { accuracy: 5 }, comment: 'strong' }],
  }
}

const settledEvents = [
  participantEvent('s1'),
  participantEvent('s2'),
  voteEvent('s1', 's2'),
  voteEvent('s2', 's1'),
]

function voterEntries(status: VoterEntry['status']): VoterEntry[] {
  return seats.map((s) => ({
    key: `t:${s.id}:vote`,
    voterSeatId: s.id,
    modelId: s.modelId,
    status,
    error: status === 'error' ? 'parse fail' : null,
    vote: null,
    rawResponse: null,
  }))
}

describe('VotingBlock', () => {
  it('renders the target carousel with aggregated scores once settled', () => {
    const { container } = renderUi(
      <VotingBlock
        seats={seats}
        voterEntries={voterEntries('done')}
        targets={aggregateVotesByTarget(settledEvents, seats)}
      />,
    )
    expect(container.textContent?.toUpperCase()).toContain('VOTING')
    // Aggregated target cards render (the winner's model identity shows).
    expect(container.textContent).toContain('Sonnet')
  })

  it('shows the quiet progress strip while voting is in flight', () => {
    const { container } = renderUi(
      <VotingBlock seats={seats} voterEntries={voterEntries('voting')} />,
    )
    expect(container.textContent?.toUpperCase()).toContain('VOTING')
  })

  it('offers the retry button only when a voter errored and nothing is in flight', () => {
    const onRetryFailed = vi.fn()
    const { container } = renderUi(
      <VotingBlock
        seats={seats}
        voterEntries={voterEntries('error')}
        targets={aggregateVotesByTarget(settledEvents, seats)}
        onRetryFailed={onRetryFailed}
      />,
    )
    const retry = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Retry failed voters"]',
    )
    expect(retry).not.toBeNull()
    fireEvent.click(retry!)
    expect(onRetryFailed).toHaveBeenCalledOnce()
  })
})
