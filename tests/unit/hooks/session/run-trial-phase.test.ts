import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runTrialPhase } from '@/hooks/session/run-trial-phase'
import { runVotingPhase } from '@/hooks/session/run-voting-phase'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import {
  MODEL_B,
  noopCheckpoint,
  participantEvent,
  seat,
  visibilityWatch,
} from '../../helpers/fixtures'

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
    watch: visibilityWatch(),
    checkpoint: noopCheckpoint,
    markPhase: () => {},
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

describe('runTrialPhase — resuming an interrupted turn', () => {
  it('runs only the voters whose slot is still empty', async () => {
    votingMock.mockResolvedValue([])
    const args = baseArgs(['s1', 's2', 's3'])
    await runTrialPhase({
      ...args,
      progress: { pendingVoterSeats: [args.seats[1]!], judgeDone: false },
      existingLabels: { A: 's1', B: 's2', C: 's3' },
    })
    expect(votingMock.mock.calls[0]?.[0].voters.map((v) => v.id)).toEqual([
      's2',
    ])
  })

  it('reuses the persisted anonymization map rather than re-labelling half the field', async () => {
    votingMock.mockResolvedValue([])
    const args = baseArgs(['s1', 's2'])
    const { labels } = await runTrialPhase({
      ...args,
      progress: { pendingVoterSeats: [args.seats[1]!], judgeDone: false },
      existingLabels: { A: 's2', B: 's1' },
    })
    expect(labels).toEqual({ A: 's2', B: 's1' })
    expect(votingMock.mock.calls[0]?.[0].votingLabels).toEqual({
      A: 's2',
      B: 's1',
    })
  })

  it('skips voting entirely when every responder already voted', async () => {
    await runTrialPhase({
      ...baseArgs(['s1', 's2']),
      progress: { pendingVoterSeats: [], judgeDone: false },
    })
    expect(votingMock).not.toHaveBeenCalled()
    expect(judgeMock).toHaveBeenCalledOnce()
  })

  it('never re-runs a verdict the turn already holds', async () => {
    await runTrialPhase({
      ...baseArgs(['s1', 's2']),
      progress: { pendingVoterSeats: [], judgeDone: true },
    })
    expect(judgeMock).not.toHaveBeenCalled()
  })
})

describe('runTrialPhase — interruption', () => {
  it('drops an interrupted vote instead of persisting it as a failure', async () => {
    const args = baseArgs(['s1', 's2'])
    votingMock.mockResolvedValue([
      {
        voter: args.seats[0]!,
        result: { vote: [], aborted: false, error: 'Load failed' },
      },
      {
        voter: args.seats[1]!,
        result: { vote: [], aborted: false, error: 'provider returned 500' },
      },
    ])
    const { events, interrupted } = await runTrialPhase(args)
    expect(interrupted).toBe('connection')
    // The 500 lands as an errored vote the user can see and retry; the
    // dropped-transport one leaves no trace, so the resume re-issues it.
    const voteEvents = events.filter((e) => e.roleType === 'vote')
    expect(voteEvents.map((e) => e.seatId)).toEqual(['s2'])
  })

  it('does not synthesize a verdict over a half-rated field', async () => {
    const args = baseArgs(['s1', 's2'])
    votingMock.mockResolvedValue([
      {
        voter: args.seats[0]!,
        result: { vote: [], aborted: false, error: 'Load failed' },
      },
    ])
    const { interrupted } = await runTrialPhase(args)
    expect(interrupted).toBe('connection')
    expect(judgeMock).not.toHaveBeenCalled()
  })

  it('withdraws the judging card rather than reddening it when the verdict call is cut off', async () => {
    votingMock.mockResolvedValue([])
    judgeMock.mockResolvedValue({
      result: { text: '', aborted: false, error: 'The network connection was lost.' },
      event: null,
    })
    const args = baseArgs(['s1'])
    const { events, interrupted } = await runTrialPhase(args)
    expect(interrupted).toBe('connection')
    expect(events.filter((e) => e.roleType === 'judge')).toEqual([])
    expect(args.setJudgingTurn).toHaveBeenCalled()
  })
})

describe('runTrialPhase — phase marking', () => {
  it('marks the stage that is starting, so a turn killed mid-verdict does not report "during peer review"', async () => {
    const args = baseArgs(['s1', 's2'])
    votingMock.mockResolvedValue([
      { voter: args.seats[0]!, result: { vote: [], aborted: false } },
    ])
    const phases: string[] = []
    await runTrialPhase({
      ...args,
      markPhase: (at) => phases.push(at.phase),
    })
    // A checkpoint can only ever name the step that just finished; the
    // marker is what names the one in flight.
    expect(phases).toEqual(['voting', 'judging'])
  })

  it('never marks judging when no Judge will run', async () => {
    const args = baseArgs(['s1', 's2'])
    votingMock.mockResolvedValue([
      { voter: args.seats[0]!, result: { vote: [], aborted: false } },
    ])
    const phases: string[] = []
    await runTrialPhase({
      ...args,
      judge: undefined,
      markPhase: (at) => phases.push(at.phase),
    })
    expect(phases).toEqual(['voting'])
  })
})
