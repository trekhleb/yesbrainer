import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runTrialPhase } from '@/hooks/session/run-trial-phase'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import { MODEL_B, participantEvent, seat } from '../../helpers/fixtures'

vi.mock('@/hooks/session/run-voting-phase', () => ({
  runVotingPhase: vi.fn(),
}))
vi.mock('@/hooks/session/run-judge-synthesis', () => ({
  runJudgeSynthesis: vi.fn(),
}))
const votingMock = vi.mocked(runVotingPhase)
const judgeMock = vi.mocked(runJudgeSynthesis)

const judge = { modelId: MODEL_B, config: {} }

function baseArgs(answerSeats: string[]) {
  const seats = answerSeats.map((id) => seat(id))
  return {
    turnId: 't1',
    judge,
    seats,
    activeSeats: seats,
    answerEvents: answerSeats.map((id) => participantEvent(id)),
    userMsg: 'q',
    priorTurns: [],
    deliberation: undefined,
    abortSignal: new AbortController().signal,
    setVotingTurn: vi.fn(),
    setJudgingTurn: vi.fn(),
  }
}

beforeEach(() => {
  votingMock.mockReset()
  judgeMock.mockReset()
  judgeMock.mockImplementation(({ eventId }) =>
    Promise.resolve({
      result: { text: 'verdict', aborted: false },
      event: {
        id: eventId,
        roleType: 'judge' as const,
        modelId: MODEL_B,
        output: 'verdict',
        ts: 1,
      },
    }),
  )
})

describe('runTrialPhase', () => {
  it('skips voting below two responders but still runs the Judge', async () => {
    const { events, labels } = await runTrialPhase(baseArgs(['s1']))
    expect(votingMock).not.toHaveBeenCalled()
    expect(labels).toBeUndefined()
    expect(events.map((e) => e.roleType)).toEqual(['judge'])
  })

  it('threads the composer thinking override through to the Judge', async () => {
    await runTrialPhase({
      ...baseArgs(['s1']),
      reasoningEffortOverride: 'max',
    })
    expect(
      judgeMock.mock.calls[0]?.[0]?.reasoningEffortOverride,
    ).toBe('max')
  })

  it('runs voting for ≥2 responders and feeds answers + votes to the Judge', async () => {
    votingMock.mockImplementation(({ voters }) =>
      Promise.resolve(
        voters.map((voter) => ({
          voter,
          result: {
            vote: [
              {
                targetSeatId: 'other',
                ratings: { accuracy: 5 },
                comment: 'x',
              },
            ],
            aborted: false,
          },
        })),
      ),
    )
    const { events, labels } = await runTrialPhase(baseArgs(['s1', 's2']))
    expect(Object.values(labels ?? {}).sort()).toEqual(['s1', 's2'])
    expect(events.map((e) => e.roleType)).toEqual(['vote', 'vote', 'judge'])

    // The judge context received answers AND the fresh vote events.
    const judgeArgs = judgeMock.mock.calls[0]?.[0]
    expect(judgeArgs?.events.map((e) => e.roleType)).toEqual([
      'participant',
      'participant',
      'vote',
      'vote',
    ])
  })

  it('aborted voters leave no event; errored voters still land one', async () => {
    votingMock.mockImplementation(({ voters }) =>
      Promise.resolve(
        voters.map((voter) => ({
          voter,
          result:
            voter.id === 's1'
              ? { vote: [], aborted: true }
              : { vote: [], aborted: false, error: 'failed' },
        })),
      ),
    )
    const { events } = await runTrialPhase(baseArgs(['s1', 's2']))
    const votes = events.filter((e) => e.roleType === 'vote')
    expect(votes).toHaveLength(1)
    expect(votes[0]?.error).toBe('failed')
  })

  it('skips the Judge with no configured judge or no successful answer', async () => {
    const noJudge = { ...baseArgs(['s1']), judge: undefined }
    expect((await runTrialPhase(noJudge)).events).toEqual([])

    const allErrored = baseArgs(['s1'])
    allErrored.answerEvents = [participantEvent('s1', { error: 'x' })]
    expect((await runTrialPhase(allErrored)).events).toEqual([])
    expect(judgeMock).not.toHaveBeenCalled()
  })

  it('an aborted signal skips both phases', async () => {
    const controller = new AbortController()
    controller.abort()
    const args = { ...baseArgs(['s1', 's2']), abortSignal: controller.signal }
    expect((await runTrialPhase(args)).events).toEqual([])
    expect(votingMock).not.toHaveBeenCalled()
    expect(judgeMock).not.toHaveBeenCalled()
  })
})
