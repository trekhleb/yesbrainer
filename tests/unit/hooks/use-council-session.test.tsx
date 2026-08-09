import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCouncilSession } from '@/hooks/use-council-session'
import { runParticipantStream } from '@/providers/run-stream'
import { runTrialPhase } from '@/hooks/session/run-trial-phase'
import { runConsensusPhase } from '@/hooks/session/run-consensus-phase'
import { generateTitleForFirstTurn } from '@/utils/session/title-gen'
import {
  abortCouncilStreams,
  registerCouncilStream,
  releaseCouncilStream,
} from '@/utils/session/active-streams'
import { isRunOwned } from '@/utils/session/run-lock'
import { appendTurn, createCouncil, getCouncil } from '@/storage/councils'
import type { Council } from '@/types/council'
import { clearDb } from '../helpers/db'
import {
  MODEL_B,
  participantEvent,
  seat,
  synthesisEvent,
  TEXT_ONLY_MODEL as TEXT_ONLY,
  VISION_MODEL as VISION,
} from '../helpers/fixtures'

vi.mock('@/providers/run-stream', () => ({ runParticipantStream: vi.fn() }))
vi.mock('@/hooks/session/run-trial-phase', () => ({ runTrialPhase: vi.fn() }))
vi.mock('@/hooks/session/run-consensus-phase', () => ({
  runConsensusPhase: vi.fn(),
}))
vi.mock('@/utils/session/title-gen', () => ({
  generateTitleForFirstTurn: vi.fn(),
}))

const streamMock = vi.mocked(runParticipantStream)
const trialMock = vi.mocked(runTrialPhase)
const consensusMock = vi.mocked(runConsensusPhase)
const titleMock = vi.mocked(generateTitleForFirstTurn)

beforeEach(async () => {
  streamMock.mockReset()
  trialMock.mockReset()
  consensusMock.mockReset()
  titleMock.mockReset()
  titleMock.mockResolvedValue(undefined)
  await clearDb()
})

async function seedRoundtable(id = 'c1', models = [VISION]) {
  await createCouncil({
    id,
    socialStructure: 'roundtable',
    seats: models.map((m, i) => seat(`s${i + 1}`, m)),
  })
}

function mountSession(id = 'c1', options = {}) {
  return renderHook(() => useCouncilSession(id, options))
}

describe('useCouncilSession — loading', () => {
  it('loads the council and settles isLoading', async () => {
    await seedRoundtable()
    const hook = mountSession()
    expect(hook.result.current.isLoading).toBe(true)
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.council?.id).toBe('c1')
    expect(hook.result.current.loadError).toBeNull()
  })

  it('surfaces a missing council as loadError, not a crash', async () => {
    const hook = mountSession('ghost')
    await waitFor(() =>
      expect(hook.result.current.loadError).toBe('Council not found'),
    )
  })
})

describe('useCouncilSession — runTurn', () => {
  it('streams, persists the turn, and fires the titler on the first turn', async () => {
    await seedRoundtable()
    streamMock.mockImplementation(({ onChunk }) => {
      onChunk('partial')
      return Promise.resolve({
        text: 'the answer',
        aborted: false,
        tokens: { input: 1, output: 2 },
      })
    })
    const onTurnAppended = vi.fn()
    const hook = mountSession('c1', { onTurnAppended })
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))

    await act(() => hook.result.current.sendMessage('the question'))

    const persisted = await getCouncil('c1')
    expect(persisted?.turns).toHaveLength(1)
    expect(persisted?.turns[0]?.events[0]).toMatchObject({
      roleType: 'participant',
      output: 'the answer',
    })
    expect(persisted?.tokenTotal).toEqual({ inputTokens: 1, outputTokens: 2 })
    expect(onTurnAppended).toHaveBeenCalled()
    expect(titleMock).toHaveBeenCalledOnce()
    // Local mirror follows; all phase state cleared.
    expect(hook.result.current.council?.turns).toHaveLength(1)
    expect(hook.result.current.isStreaming).toBe(false)
    expect(hook.result.current.streamingTurn).toBeNull()
  })

  it('filters non-vision seats off an image-bearing turn', async () => {
    await seedRoundtable('c1', [VISION, TEXT_ONLY])
    streamMock.mockResolvedValue({ text: 'saw it', aborted: false })
    const hook = mountSession()
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))

    await act(() =>
      hook.result.current.sendMessage('look', ['data:image/png;base64,AA']),
    )
    expect(streamMock).toHaveBeenCalledTimes(1)
    expect(streamMock.mock.calls[0]?.[0]?.modelId).toBe(VISION)
    const persisted = await getCouncil('c1')
    expect(persisted?.turns[0]?.userImages).toEqual(['data:image/png;base64,AA'])
  })

  it('a pure abort with no text persists nothing', async () => {
    await seedRoundtable()
    streamMock.mockResolvedValue({ text: '', aborted: true })
    const hook = mountSession()
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    expect((await getCouncil('c1'))?.turns).toHaveLength(0)
    expect(titleMock).not.toHaveBeenCalled()
  })

  it('dispatches the Trial phase and persists its events + labels', async () => {
    await createCouncil({
      id: 'trial-1',
      socialStructure: 'trial',
      seats: [seat('s1', VISION), seat('s2', MODEL_B)],
      judge: { modelId: MODEL_B, config: {} },
    })
    streamMock.mockResolvedValue({ text: 'answer', aborted: false })
    trialMock.mockResolvedValue({
      events: [synthesisEvent('judge', { output: 'the verdict' })],
      labels: { A: 's1', B: 's2' }, interrupted: null,
    })
    const hook = mountSession('trial-1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    expect(trialMock).toHaveBeenCalledOnce()
    expect(consensusMock).not.toHaveBeenCalled()
    const persisted = await getCouncil('trial-1')
    expect(persisted?.turns[0]?.votingLabels).toEqual({ A: 's1', B: 's2' })
    expect(
      persisted?.turns[0]?.events.map((e) => e.roleType),
    ).toEqual(['participant', 'participant', 'judge'])
  })

  it('dispatches the Consensus phase and persists its events + labels', async () => {
    await createCouncil({
      id: 'con-1',
      socialStructure: 'consensus',
      seats: [seat('s1', VISION), seat('s2', MODEL_B)],
      mediator: { modelId: MODEL_B, config: {} },
    })
    streamMock.mockResolvedValue({ text: 'position', aborted: false })
    consensusMock.mockResolvedValue({
      events: [
        synthesisEvent('mediator', {
          output: 'consensus reached',
          round: 1,
          mediator: { round: 1, convergent: true },
        }),
      ],
      labels: { A: 's1', B: 's2' }, interrupted: null,
    })
    const hook = mountSession('con-1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    expect(consensusMock).toHaveBeenCalledOnce()
    expect(trialMock).not.toHaveBeenCalled()
    const persisted = await getCouncil('con-1')
    expect(persisted?.turns[0]?.votingLabels).toEqual({ A: 's1', B: 's2' })
    expect(
      persisted?.turns[0]?.events.some((e) => e.roleType === 'mediator'),
    ).toBe(true)
  })

  it('hands the composer thinking override to the deliberation phase', async () => {
    await createCouncil({
      id: 'trial-2',
      socialStructure: 'trial',
      seats: [seat('s1', VISION)],
      judge: { modelId: MODEL_B, config: {} },
    })
    streamMock.mockResolvedValue({ text: 'answer', aborted: false })
    trialMock.mockResolvedValue({ events: [], labels: undefined, interrupted: null })
    const hook = mountSession('trial-2')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() =>
      hook.result.current.sendMessage('q', undefined, {
        reasoningEffort: 'max',
      }),
    )
    // The participant fan-out resolves it per seat, and the phase module
    // gets it whole — its Judge (and the consensus path's Mediator) apply
    // the same override.
    expect(streamMock.mock.calls[0]?.[0]?.reasoningEffort).toBe('max')
    expect(trialMock.mock.calls[0]?.[0]?.reasoningEffortOverride).toBe('max')
  })

  it('skips a new turn while busy and when all seats are non-vision on an image turn', async () => {
    await seedRoundtable('c1', [TEXT_ONLY])
    streamMock.mockResolvedValue({ text: 'x', aborted: false })
    const hook = mountSession()
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    // Image turn, only a text-only seat → filtered to zero, nothing sent.
    await act(() =>
      hook.result.current.sendMessage('look', ['data:image/png;base64,AA']),
    )
    expect(streamMock).not.toHaveBeenCalled()
    expect((await getCouncil('c1'))?.turns).toHaveLength(0)
  })

  it('deleting the council mid-stream aborts the run (registry contract)', async () => {
    await seedRoundtable()
    streamMock.mockImplementation(({ abortSignal }) => {
      abortCouncilStreams('c1')
      expect(abortSignal.aborted).toBe(true)
      return Promise.resolve({ text: '', aborted: true })
    })
    const hook = mountSession()
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    expect((await getCouncil('c1'))?.turns).toHaveLength(0)
  })

  it('stop() aborts through the shared abortRef', async () => {
    await seedRoundtable()
    let observedSignal: AbortSignal | undefined
    streamMock.mockImplementation(({ abortSignal }) => {
      observedSignal = abortSignal
      return new Promise((resolve) => {
        abortSignal.addEventListener('abort', () =>
          resolve({ text: '', aborted: true }),
        )
      })
    })
    const hook = mountSession()
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    let sendPromise: Promise<void> = Promise.resolve()
    act(() => {
      sendPromise = hook.result.current.sendMessage('q')
    })
    // Wait for the seat to actually be *in flight*, not merely for the
    // streaming card to appear: the turn is checkpointed to storage before
    // the fan-out, so those two moments are no longer the same tick, and
    // stopping in between would test the pre-aborted path instead of this
    // one (which the orchestrator now short-circuits without calling out).
    await waitFor(() => expect(streamMock).toHaveBeenCalled())
    expect(hook.result.current.isStreaming).toBe(true)
    act(() => hook.result.current.stop())
    await act(() => sendPromise)
    expect(observedSignal?.aborted).toBe(true)
    expect(hook.result.current.isStreaming).toBe(false)
  })

  it('re-reads config on configRefreshKey bumps without clobbering turns', async () => {
    await seedRoundtable()
    streamMock.mockResolvedValue({ text: 'a', aborted: false })
    const hook = renderHook(
      ({ nonce }: { nonce: number }) =>
        useCouncilSession('c1', { configRefreshKey: nonce }),
      { initialProps: { nonce: 0 } },
    )
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    // The modal writes straight to storage, then the app bumps the key.
    const { updateSeat } = await import('@/storage/councils')
    await updateSeat('c1', 's1', { modelId: TEXT_ONLY })
    hook.rerender({ nonce: 1 })

    await waitFor(() =>
      expect(hook.result.current.council?.seats[0]?.modelId).toBe(TEXT_ONLY),
    )
    expect(hook.result.current.council?.turns).toHaveLength(1)
  })
})

/**
 * Interruption and resume.
 *
 * The two failures these guard against are both silent: a resumed turn that
 * re-issues work the turn already holds (the user pays twice), and one that
 * skips work that never landed (the council quietly answers with fewer
 * voices than it charged for).
 */
describe('useCouncilSession — interruption', () => {
  it('keeps the turn unfinished and records no errored event when the browser cuts a seat off', async () => {
    await seedRoundtable('c1', [VISION, MODEL_B])
    streamMock
      .mockResolvedValueOnce({ text: 'landed', aborted: false })
      .mockResolvedValue({
        text: '',
        aborted: false,
        error: 'TypeError: Load failed',
      })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    const persisted = await getCouncil('c1')
    const turn = persisted?.turns[0]
    expect(turn?.runState?.status).toBe('interrupted')
    expect(turn?.runState?.cause).toBe('connection')
    // Only the seat that answered has an event; the cut-off seat's slot is
    // empty, which is what the resume reads as "still owed".
    expect(turn?.events.map((e) => e.seatId)).toEqual(['s1'])
  })

  it('persists the question before the first provider call, so a kill during the opening fan-out still leaves something to come back to', async () => {
    await seedRoundtable('c1')
    // A box, not a bare `let`: TypeScript's control-flow analysis doesn't
    // track assignments made inside an async callback, so a plain variable
    // would narrow to `null` at the read below.
    const observed: { council: Council | null } = { council: null }
    streamMock.mockImplementation(async () => {
      observed.council = await getCouncil('c1')
      return { text: 'answer', aborted: false }
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('my question'))

    expect(observed.council?.turns[0]?.userMsg).toBe('my question')
    expect(observed.council?.turns[0]?.runState?.status).toBe('running')
  })

  it('a completed run leaves no run state behind', async () => {
    await seedRoundtable('c1')
    streamMock.mockResolvedValue({ text: 'answer', aborted: false })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    expect((await getCouncil('c1'))?.turns[0]?.runState).toBeUndefined()
  })

  it('drops the placeholder row when a run is stopped before it produces anything, rather than stranding an empty turn in the thread', async () => {
    await seedRoundtable('c1')
    streamMock.mockImplementation(() => {
      abortCouncilStreams('c1')
      return Promise.resolve({ text: '', aborted: true })
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    expect((await getCouncil('c1'))?.turns).toEqual([])
  })
})

describe('useCouncilSession — resumeTurn', () => {
  it('re-issues only the seat whose answer never landed', async () => {
    await seedRoundtable('c1', [VISION, MODEL_B])
    streamMock
      .mockResolvedValueOnce({ text: 'landed', aborted: false })
      .mockResolvedValueOnce({
        text: '',
        aborted: false,
        error: 'TypeError: Load failed',
      })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    const turnId = (await getCouncil('c1'))?.turns[0]?.id
    expect(turnId).toBeTruthy()
    streamMock.mockReset()
    streamMock.mockResolvedValue({ text: 'second time', aborted: false })

    await act(() => hook.result.current.resumeTurn(turnId!, { manual: true }))

    // s1's answer was already on the turn — only s2 is re-run.
    expect(streamMock).toHaveBeenCalledOnce()
    const persisted = await getCouncil('c1')
    expect(persisted?.turns[0]?.runState).toBeUndefined()
    expect(persisted?.turns[0]?.events.map((e) => e.seatId)?.sort()).toEqual([
      's1',
      's2',
    ])
    // The already-landed answer is untouched by the resume.
    expect(
      persisted?.turns[0]?.events.find((e) => e.seatId === 's1')?.output,
    ).toBe('landed')
  })

  it('hands the deliberation phase the work already done, so a resumed debate replays rather than re-runs it', async () => {
    await createCouncil({
      id: 'con-1',
      socialStructure: 'consensus',
      seats: [seat('s1', VISION), seat('s2', MODEL_B)],
      mediator: { modelId: MODEL_B, config: {} },
    })
    streamMock.mockResolvedValue({ text: 'position', aborted: false })
    consensusMock.mockResolvedValue({
      events: [],
      labels: { A: 's1', B: 's2' },
      interrupted: 'backgrounded',
    })
    const hook = mountSession('con-1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    const turnId = (await getCouncil('con-1'))?.turns[0]?.id
    consensusMock.mockClear()
    consensusMock.mockResolvedValue({
      events: [
        synthesisEvent('mediator', {
          output: 'agreed',
          round: 1,
          mediator: { round: 1, convergent: true },
        }),
      ],
      labels: { A: 's1', B: 's2' },
      interrupted: null,
    })
    await act(() => hook.result.current.resumeTurn(turnId!, { manual: true }))

    const args = consensusMock.mock.calls[0]?.[0]
    // The persisted labels are threaded back in — a fresh map mid-debate
    // would re-shuffle which peer is "Model B".
    expect(args?.existingLabels).toEqual({ A: 's1', B: 's2' })
    // Both round-1 answers are already on the turn, so the resume doesn't
    // re-stream them.
    expect(args?.roundOneEvents).toHaveLength(2)
    expect((await getCouncil('con-1'))?.turns[0]?.runState).toBeUndefined()
  })

  it('refuses to resume a turn that is no longer the latest — a later turn has already consumed it', async () => {
    await seedRoundtable('c1', [VISION])
    streamMock.mockResolvedValueOnce({
      text: '',
      aborted: false,
      error: 'Load failed',
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('first'))
    const staleId = (await getCouncil('c1'))?.turns[0]?.id

    streamMock.mockReset()
    streamMock.mockResolvedValue({ text: 'answer', aborted: false })
    await act(() => hook.result.current.sendMessage('second'))

    streamMock.mockClear()
    await act(() => hook.result.current.resumeTurn(staleId!, { manual: true }))
    expect(streamMock).not.toHaveBeenCalled()
    // ...and the superseded turn stops advertising a resume at all.
    const persisted = await getCouncil('c1')
    expect(persisted?.turns.find((t) => t.id === staleId)?.runState).toBeUndefined()
  })
})

describe('useCouncilSession — resume guards', () => {
  it('retires a turn whose seats have all been unseated rather than leaving a Resume button that cannot do anything', async () => {
    // The realistic shape of this: the roster was edited, then the app was
    // reopened onto a turn whose run remembers seats that no longer exist.
    await seedRoundtable('c1', [VISION])
    await appendTurn('c1', {
      id: 'orphan-turn',
      idx: 0,
      userMsg: 'q',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      runState: {
        status: 'interrupted',
        phase: 'answers',
        startedAt: 1,
        heartbeatAt: 1,
        activeSeatIds: ['long-gone-seat'],
      },
    })

    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.resumeTurn('orphan-turn', { manual: true }))

    expect(streamMock).not.toHaveBeenCalled()
    expect((await getCouncil('c1'))?.turns[0]?.runState).toBeUndefined()
  })

  it('ignores a resume for a turn that carries no run state', async () => {
    await seedRoundtable('c1')
    streamMock.mockResolvedValue({ text: 'answer', aborted: false })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    const turnId = (await getCouncil('c1'))?.turns[0]?.id

    streamMock.mockClear()
    await act(() => hook.result.current.resumeTurn(turnId!, { manual: true }))
    await act(() => hook.result.current.resumeTurn('no-such-turn'))
    expect(streamMock).not.toHaveBeenCalled()
  })
})

describe('useCouncilSession — a run owned by a previous mount', () => {
  /**
   * Runs deliberately outlive their view, and the app remounts CouncilView
   * per council — so navigating away and back leaves a *fresh* hook with
   * empty phase state while the earlier run carries on (still holding the
   * turn's lock). Without noticing that, the new instance renders a paused
   * card and a Resume button that can only bail out silently. This was a
   * real report: "Resume does nothing until I refresh the page."
   */
  async function pausedCouncil() {
    await seedRoundtable('c1', [VISION])
    await appendTurn('c1', {
      id: 'paused-turn',
      idx: 0,
      userMsg: 'q',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      runState: {
        status: 'interrupted',
        phase: 'answers',
        startedAt: 1,
        heartbeatAt: 1,
        activeSeatIds: ['s1'],
        // Past the auto-resume cap, so the card sits still.
        resumeAttempts: 9,
      },
    })
  }

  it('reports a background run and refuses to start a second one', async () => {
    await pausedCouncil()
    const controller = new AbortController()
    registerCouncilStream('c1', controller, 'paused-turn')
    try {
      const hook = mountSession('c1')
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
      await waitFor(() =>
        expect(hook.result.current.hasBackgroundRun).toBe(true),
      )

      streamMock.mockClear()
      await act(() =>
        hook.result.current.resumeTurn('paused-turn', { manual: true }),
      )
      expect(streamMock).not.toHaveBeenCalled()
    } finally {
      releaseCouncilStream('c1', controller, 'paused-turn')
    }
  })

  it('stops reporting one once the earlier run settles, so Resume works again', async () => {
    await pausedCouncil()
    const controller = new AbortController()
    registerCouncilStream('c1', controller, 'paused-turn')
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await waitFor(() => expect(hook.result.current.hasBackgroundRun).toBe(true))

    releaseCouncilStream('c1', controller, 'paused-turn')
    await waitFor(() =>
      expect(hook.result.current.hasBackgroundRun).toBe(false),
    )

    streamMock.mockResolvedValue({ text: 'answered at last', aborted: false })
    await act(() =>
      hook.result.current.resumeTurn('paused-turn', { manual: true }),
    )
    expect(streamMock).toHaveBeenCalledOnce()
    expect((await getCouncil('c1'))?.turns[0]?.runState).toBeUndefined()
  })

  it('Stop reaches a run this view never started — it has no local controller to cancel', async () => {
    await pausedCouncil()
    const controller = new AbortController()
    registerCouncilStream('c1', controller, 'paused-turn')
    try {
      const hook = mountSession('c1')
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
      act(() => hook.result.current.stop())
      expect(controller.signal.aborted).toBe(true)
    } finally {
      releaseCouncilStream('c1', controller, 'paused-turn')
    }
  })
})

describe('useCouncilSession — stopping a resume', () => {
  it('keeps the question when a resume of an empty interrupted turn is stopped — that row exists precisely to preserve it', async () => {
    await seedRoundtable('c1', [VISION])
    await appendTurn('c1', {
      id: 'question-only',
      idx: 0,
      userMsg: 'the question worth keeping',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      runState: {
        status: 'interrupted',
        phase: 'answers',
        startedAt: 1,
        heartbeatAt: 1,
        activeSeatIds: ['s1'],
        resumeAttempts: 9,
      },
    })
    // The resume starts, then the user stops it before anything lands.
    streamMock.mockImplementation(() => {
      abortCouncilStreams('c1')
      return Promise.resolve({ text: '', aborted: true })
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() =>
      hook.result.current.resumeTurn('question-only', { manual: true }),
    )

    const persisted = await getCouncil('c1')
    expect(persisted?.turns).toHaveLength(1)
    expect(persisted?.turns[0]?.userMsg).toBe('the question worth keeping')
    // Stop means stop: the run is retired, so no Resume is offered — but
    // the turn itself survives.
    expect(persisted?.turns[0]?.runState).toBeUndefined()
    expect(hook.result.current.council?.turns[0]?.runState).toBeUndefined()
  })

  it('still drops a *fresh* send stopped before it produced anything', async () => {
    await seedRoundtable('c1')
    streamMock.mockImplementation(() => {
      abortCouncilStreams('c1')
      return Promise.resolve({ text: '', aborted: true })
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))
    expect((await getCouncil('c1'))?.turns).toEqual([])
  })
})

describe('useCouncilSession — background-run precision', () => {
  it('a run on another turn (or the titler, which belongs to no turn) does not make this one look resumed', async () => {
    // The registry is council-keyed for the sidebar's busy dot and counts
    // the titler too. The paused card asks a narrower question — "is *this
    // turn* being worked on?" — and answering it with the council-level
    // signal would announce a resume that isn't happening and hide a
    // Resume button that would have worked.
    await seedRoundtable('c1', [VISION])
    await appendTurn('c1', {
      id: 'paused-turn',
      idx: 0,
      userMsg: 'q',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      runState: {
        status: 'interrupted',
        phase: 'answers',
        startedAt: 1,
        heartbeatAt: 1,
        activeSeatIds: ['s1'],
        resumeAttempts: 9,
      },
    })
    // Registered against the council with no turn — exactly how the titler
    // registers.
    const controller = new AbortController()
    registerCouncilStream('c1', controller)
    try {
      const hook = mountSession('c1')
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
      expect(hook.result.current.hasBackgroundRun).toBe(false)
    } finally {
      releaseCouncilStream('c1', controller)
    }
  })
})

describe('useCouncilSession — paused-card phase copy', () => {
  it('persists the stage and the round cap the phase reported, so the card can say "round 2 of 5" rather than falling back to "during the debate"', async () => {
    // The cap is resolved inside the consensus phase (clamped, and floored
    // by rounds a resumed turn already holds), so the orchestrator can only
    // learn it by being told. It was read by two components and written by
    // nobody until this wiring existed — a gap the visual fixture masked by
    // hand-seeding the value straight into IndexedDB.
    await createCouncil({
      id: 'con-phase',
      socialStructure: 'consensus',
      seats: [seat('s1', VISION), seat('s2', MODEL_B)],
      mediator: { modelId: MODEL_B, config: {} },
    })
    streamMock.mockResolvedValue({ text: 'position', aborted: false })
    consensusMock.mockImplementation(async (args) => {
      args.markPhase({ phase: 'mediating', round: 2, maxRounds: 5 })
      return {
        events: [],
        labels: { A: 's1', B: 's2' },
        interrupted: 'backgrounded' as const,
      }
    })
    const hook = mountSession('con-phase')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    const runState = (await getCouncil('con-phase'))?.turns[0]?.runState
    expect(runState?.status).toBe('interrupted')
    // Not 'answers' — the answers were done and the mediator was running.
    expect(runState?.phase).toBe('mediating')
    expect(runState?.round).toBe(2)
    expect(runState?.maxRounds).toBe(5)
  })
})

describe('useCouncilSession — ownership covers fresh runs too', () => {
  /**
   * Recovery decides liveness by *ownership*. A fresh send used to hold no
   * lock, which made live runs invisible to it: a second page opening the
   * council would see `status: 'running'` with the lock free, conclude the
   * run had been killed, and auto-resume — re-buying seats the first page
   * was still paying for, with both pages' checkpoints overwriting the same
   * row. jsdom has no Web Locks, so the API is stubbed to the real
   * semantics (a held lock hands the callback `null`).
   */
  const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
  const heldTurnIds = new Set<string>()

  beforeEach(() => {
    heldTurnIds.clear()
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (
          name: string,
          _opts: unknown,
          cb: (lock: unknown) => unknown,
        ) => {
          if (heldTurnIds.has(name)) return cb(null)
          heldTurnIds.add(name)
          try {
            return await cb({ name })
          } finally {
            heldTurnIds.delete(name)
          }
        },
      },
    })
  })

  afterEach(() => {
    if (originalLocks) {
      Object.defineProperty(navigator, 'locks', originalLocks)
    } else {
      Reflect.deleteProperty(navigator, 'locks')
    }
  })

  it('holds the turn lock while a fresh send runs, so another page cannot declare it dead', async () => {
    await seedRoundtable('c1', [VISION])
    const owned: boolean[] = []
    streamMock.mockImplementation(async () => {
      // Observed from inside the run — i.e. what a second page's reconcile
      // would see at that moment.
      const turnId = (await getCouncil('c1'))?.turns[0]?.id
      owned.push(turnId ? await isRunOwned(turnId) : false)
      return { text: 'answer', aborted: false }
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    await act(() => hook.result.current.sendMessage('q'))

    expect(owned).toEqual([true])
    // …and released once it finishes, so a real interruption still recovers.
    const turnId = (await getCouncil('c1'))?.turns[0]?.id
    expect(await isRunOwned(turnId!)).toBe(false)
  })
})

describe('useCouncilSession — the mirror is advisory', () => {
  it('re-reads the turn before resuming, so a run that finished under a dead mount is not re-bought and overwritten', async () => {
    // The falling-edge case: a run started before the user navigated away
    // completes, but its `setCouncil` belongs to a mount that no longer
    // exists — so this instance still holds the turn as unfinished.
    await seedRoundtable('c1', [VISION])
    await appendTurn('c1', {
      id: 'stale-turn',
      idx: 0,
      userMsg: 'q',
      events: [],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
      runState: {
        status: 'interrupted',
        phase: 'answers',
        startedAt: 1,
        heartbeatAt: 1,
        activeSeatIds: ['s1'],
        resumeAttempts: 9,
      },
    })
    const hook = mountSession('c1')
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.council?.turns[0]?.runState).toBeDefined()

    // The background run lands its real result straight to storage — the
    // mirror this instance holds knows nothing about it.
    await appendTurn('c1', {
      id: 'stale-turn',
      idx: 0,
      userMsg: 'q',
      events: [participantEvent('s1', { output: 'the real answer' })],
      tokenTotal: { inputTokens: 0, outputTokens: 0 },
    })

    streamMock.mockClear()
    await act(() =>
      hook.result.current.resumeTurn('stale-turn', { manual: true }),
    )

    // Nothing re-issued, and the finished work survives intact.
    expect(streamMock).not.toHaveBeenCalled()
    const persisted = await getCouncil('c1')
    expect(persisted?.turns[0]?.events.map((e) => e.output)).toEqual([
      'the real answer',
    ])
    expect(persisted?.turns[0]?.runState).toBeUndefined()
    // The mirror is corrected too, so the paused card stops lying.
    expect(hook.result.current.council?.turns[0]?.runState).toBeUndefined()
    expect(hook.result.current.council?.turns[0]?.events).toHaveLength(1)
  })
})
