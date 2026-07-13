import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type MutableRefObject } from 'react'
import { useRetryVotes } from '@/hooks/session/use-retry-votes'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { appendTurn, createCouncil, getCouncil } from '@/storage/councils'
import { clearDb } from '../../helpers/db'
import {
  MODEL_B,
  participantEvent,
  seat,
  turn,
} from '../../helpers/fixtures'
import type { Council, TurnEvent } from '@/types/council'
import type { VotingTurn } from '@/types/session'

vi.mock('@/hooks/session/run-voting-phase', () => ({ runVotingPhase: vi.fn() }))
const votingMock = vi.mocked(runVotingPhase)

function voteEvent(voterId: string, over: Partial<TurnEvent> = {}): TurnEvent {
  return {
    ...participantEvent(voterId),
    roleType: 'vote',
    output: '',
    ...over,
  }
}

function harness(initial: Council) {
  const abortRef: MutableRefObject<AbortController | null> = { current: null }
  return renderHook(() => {
    const [council, setCouncil] = useState<Council | null>(initial)
    const [, setVotingTurn] = useState<VotingTurn | null>(null)
    const hook = useRetryVotes({
      council,
      setCouncil,
      abortRef,
      isBusy: false,
      setVotingTurn,
    })
    return { council, ...hook }
  })
}

async function seed(): Promise<Council> {
  await createCouncil({
    id: 'c1',
    socialStructure: 'trial',
    seats: [seat('s1'), seat('s2', MODEL_B)],
    judge: { modelId: MODEL_B, config: {} },
  })
  await appendTurn(
    'c1',
    turn({
      id: 't1',
      idx: 0,
      votingLabels: { A: 's1', B: 's2' },
      events: [
        participantEvent('s1'),
        participantEvent('s2'),
        voteEvent('s1', { id: 'ok-vote', vote: [] }),
        voteEvent('s2', { id: 'bad-vote', error: 'parse fail' }),
      ],
    }),
  )
  return (await getCouncil('c1'))!
}

beforeEach(async () => {
  votingMock.mockReset()
  await clearDb()
})

describe('useRetryVotes', () => {
  it('re-runs only the errored voters and replaces their events in place', async () => {
    votingMock.mockImplementation(({ voters }) =>
      Promise.resolve(
        voters.map((voter) => ({
          voter,
          result: {
            vote: [
              { targetSeatId: 's1', ratings: { accuracy: 4 }, comment: 'ok' },
            ],
            aborted: false,
          },
        })),
      ),
    )
    const hook = harness(await seed())
    await act(() => hook.result.current.retryFailedVotes('t1'))

    // Only the failed voter was re-fanned.
    expect(votingMock.mock.calls[0]?.[0]?.voters.map((v) => v.id)).toEqual([
      's2',
    ])
    // Persisted in place — same event id, error gone, votes attached.
    const persisted = await getCouncil('c1')
    const retried = persisted?.turns[0]?.events.find(
      (e) => e.id === 'bad-vote',
    )
    expect(retried?.error).toBeUndefined()
    expect(retried?.vote).toHaveLength(1)
    // The successful sibling was left untouched (its seeded empty list).
    expect(
      persisted?.turns[0]?.events.find((e) => e.id === 'ok-vote')?.vote,
    ).toEqual([])
  })

  it('does nothing without failed votes or without the anonymization map', async () => {
    await createCouncil({
      id: 'c2',
      socialStructure: 'trial',
      seats: [seat('s1'), seat('s2')],
      judge: { modelId: MODEL_B, config: {} },
    })
    // No votingLabels on this turn — the retry cannot re-label answers.
    await appendTurn(
      'c2',
      turn({
        id: 't1',
        idx: 0,
        events: [voteEvent('s1', { error: 'x' })],
      }),
    )
    const hook = harness((await getCouncil('c2'))!)
    await act(() => hook.result.current.retryFailedVotes('t1'))
    expect(votingMock).not.toHaveBeenCalled()
  })
})
