import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { runVoteForVoter } from '@/providers/run-vote'
import { seat, participantEvent } from '../../helpers/fixtures'
import type { VotingTurn } from '@/types/session'

vi.mock('@/providers/run-vote', () => ({ runVoteForVoter: vi.fn() }))
const runVoteMock = vi.mocked(runVoteForVoter)

/** Applies functional set-state updates so tests can read the state. */
function stateCapture<T>() {
  const box: { current: T | null } = { current: null }
  const set = (update: T | null | ((cur: T | null) => T | null)) => {
    box.current =
      typeof update === 'function'
        ? (update as (cur: T | null) => T | null)(box.current)
        : update
  }
  return { box, set }
}

beforeEach(() => {
  runVoteMock.mockReset()
})

describe('runVotingPhase', () => {
  it('seeds every voter, fans out, and settles their per-voter state', async () => {
    runVoteMock.mockImplementation(({ voter }) =>
      voter.id === 'bad'
        ? Promise.resolve({
            vote: [],
            aborted: false,
            error: 'schema fail',
            rawResponse: '{}',
          })
        : Promise.resolve({
            vote: [
              { targetSeatId: 'other', ratings: { accuracy: 4 }, comment: 'ok' },
            ],
            aborted: false,
          }),
    )
    const { box, set } = stateCapture<VotingTurn>()
    const outcomes = await runVotingPhase({
      turnId: 't1',
      voters: [seat('good'), seat('bad')],
      votingLabels: { A: 'good', B: 'bad' },
      events: [participantEvent('good'), participantEvent('bad')],
      userMsg: 'q',
      abortSignal: new AbortController().signal,
      deliberation: undefined,
      setVotingTurn: set,
    })

    expect(outcomes).toHaveLength(2)
    expect(box.current?.id).toBe('t1')
    expect(box.current?.perVoter['good']).toMatchObject({
      status: 'done',
      error: null,
    })
    expect(box.current?.perVoter['bad']).toMatchObject({
      status: 'error',
      error: 'schema fail',
      rawResponse: '{}',
    })
  })

  it('resolves prompts and clamps knobs once per phase', async () => {
    localStorage.setItem(
      'yesbrainer:behavior',
      JSON.stringify({ minCommentLength: 99_999 }),
    )
    runVoteMock.mockResolvedValue({ vote: [], aborted: false })
    const { set } = stateCapture<VotingTurn>()
    await runVotingPhase({
      turnId: 't1',
      voters: [seat('v1')],
      votingLabels: { A: 'v1' },
      events: [],
      userMsg: 'q',
      abortSignal: new AbortController().signal,
      deliberation: { votingSystem: 'council rubric voice' },
      setVotingTurn: set,
    })
    const call = runVoteMock.mock.calls[0]?.[0]
    expect(call?.voteSystem).toBe('council rubric voice')
    expect(call?.minCommentLength).toBe(2000) // clamped from 99_999
    expect(call?.dimensions.length).toBeGreaterThan(0)
  })
})
