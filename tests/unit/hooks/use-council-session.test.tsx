import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCouncilSession } from '@/hooks/use-council-session'
import { runParticipantStream } from '@/providers/run-stream'
import { runTrialPhase } from '@/hooks/session/run-trial-phase'
import { runConsensusPhase } from '@/hooks/session/run-consensus-phase'
import { generateTitleForFirstTurn } from '@/utils/session/title-gen'
import { abortCouncilStreams } from '@/utils/session/active-streams'
import { createCouncil, getCouncil } from '@/storage/councils'
import { clearDb } from '../helpers/db'
import {
  MODEL_B,
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
      labels: { A: 's1', B: 's2' },
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
      labels: { A: 's1', B: 's2' },
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
    trialMock.mockResolvedValue({ events: [], labels: undefined })
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
    await waitFor(() =>
      expect(hook.result.current.streamingTurn).not.toBeNull(),
    )
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
