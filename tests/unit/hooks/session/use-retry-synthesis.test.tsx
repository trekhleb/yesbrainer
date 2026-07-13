import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type MutableRefObject } from 'react'
import { useRetrySynthesis } from '@/hooks/session/use-retry-synthesis'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import { runMediatorRound } from '@/providers/run-mediator'
import { appendTurn, createCouncil, getCouncil } from '@/storage/councils'
import { setRunOptions } from '@/storage/run-options'
import { clearDb } from '../../helpers/db'
import {
  MODEL_B,
  participantEvent,
  seat,
  synthesisEvent,
  turn,
} from '../../helpers/fixtures'
import type { Council } from '@/types/council'
import type { SynthRetryState } from '@/types/session'

vi.mock('@/hooks/session/run-judge-synthesis', () => ({
  runJudgeSynthesis: vi.fn(),
}))
vi.mock('@/providers/run-mediator', () => ({ runMediatorRound: vi.fn() }))
const judgeMock = vi.mocked(runJudgeSynthesis)
const mediatorMock = vi.mocked(runMediatorRound)

function harness(initial: Council) {
  const abortRef: MutableRefObject<AbortController | null> = { current: null }
  return renderHook(() => {
    const [council, setCouncil] = useState<Council | null>(initial)
    const [synthRetry, setSynthRetry] = useState<SynthRetryState | null>(null)
    const hook = useRetrySynthesis({
      council,
      setCouncil,
      abortRef,
      isBusy: false,
      setSynthRetry,
    })
    return { council, synthRetry, ...hook }
  })
}

beforeEach(async () => {
  judgeMock.mockReset()
  mediatorMock.mockReset()
  localStorage.clear()
  await clearDb()
})

describe('retryJudge', () => {
  it('replaces the errored verdict in place via the shared synthesis runner', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1')],
      judge: { modelId: MODEL_B, config: {} },
    })
    await appendTurn(
      'c1',
      turn({
        id: 't1',
        idx: 0,
        events: [
          participantEvent('s1'),
          synthesisEvent('judge', { id: 'bad-verdict', error: 'x', output: '' }),
        ],
      }),
    )
    judgeMock.mockImplementation(({ eventId, onChunk }) => {
      onChunk('re-judging…')
      return Promise.resolve({
        result: { text: 'fresh verdict', aborted: false },
        event: {
          id: eventId,
          roleType: 'judge' as const,
          modelId: MODEL_B,
          output: 'fresh verdict',
          ts: 1,
        },
      })
    })

    const hook = harness((await getCouncil('c1'))!)
    await act(() => hook.result.current.retryJudge('t1'))

    expect(judgeMock.mock.calls[0]?.[0]?.eventId).toBe('bad-verdict')
    const persisted = await getCouncil('c1')
    const judgeEvent = persisted?.turns[0]?.events.find(
      (e) => e.roleType === 'judge',
    )
    expect(judgeEvent?.output).toBe('fresh verdict')
    expect(hook.result.current.synthRetry).toBeNull()
  })

  it('passes the sticky thinking override to the synthesis runner', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1')],
      judge: { modelId: MODEL_B, config: {} },
    })
    await appendTurn(
      'c1',
      turn({
        id: 't1',
        idx: 0,
        events: [
          participantEvent('s1'),
          synthesisEvent('judge', { id: 'bad-verdict', error: 'x', output: '' }),
        ],
      }),
    )
    // The armed Thinking dial persists per council — the retry must read it.
    setRunOptions('c1', { mutedTools: [], reasoningEffort: 'max' })
    judgeMock.mockResolvedValue({
      result: { text: 'v', aborted: false },
      event: null,
    })

    const hook = harness((await getCouncil('c1'))!)
    await act(() => hook.result.current.retryJudge('t1'))

    expect(judgeMock.mock.calls[0]?.[0]?.reasoningEffortOverride).toBe('max')
  })

  it('does nothing without an errored judge event or a configured judge', async () => {
    await createCouncil({
      id: 'c1',
      socialStructure: 'trial',
      seats: [seat('s1')],
      judge: { modelId: MODEL_B, config: {} },
    })
    await appendTurn(
      'c1',
      turn({ id: 't1', idx: 0, events: [synthesisEvent('judge')] }),
    )
    const hook = harness((await getCouncil('c1'))!)
    await act(() => hook.result.current.retryJudge('t1'))
    expect(judgeMock).not.toHaveBeenCalled()
  })
})

describe('retryMediatorRound', () => {
  async function seedConsensus(finalRoundErrored: boolean): Promise<Council> {
    await createCouncil({
      id: 'c2',
      socialStructure: 'consensus',
      seats: [seat('s1'), seat('s2')],
      mediator: { modelId: MODEL_B, config: {} },
    })
    await appendTurn(
      'c2',
      turn({
        id: 't1',
        idx: 0,
        votingLabels: { A: 's1', B: 's2' },
        events: [
          participantEvent('s1', { output: 'pos 1' }),
          participantEvent('s2', { output: 'pos 2' }),
          synthesisEvent('mediator', {
            output: 'round 1 fine',
            round: 1,
            mediator: { round: 1, convergent: false, divergencePoints: 'x' },
          }),
          {
            ...participantEvent('s1', { output: 'rethought 1' }),
            roleType: 'reanswer' as const,
            round: 2,
          },
          {
            ...participantEvent('s2', { output: 'rethought 2' }),
            roleType: 'reanswer' as const,
            round: 2,
          },
          synthesisEvent('mediator', {
            id: 'final-round',
            output: '',
            round: 2,
            ...(finalRoundErrored ? { error: 'died' } : {}),
            mediator: { round: 2, convergent: false },
          }),
        ],
      }),
    )
    return (await getCouncil('c2'))!
  }

  it('re-runs only the final errored round, framed from persisted state', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'recovered consensus',
      convergent: true,
      aborted: false,
    })
    const hook = harness(await seedConsensus(true))
    await act(() => hook.result.current.retryMediatorRound('t1'))

    const call = mediatorMock.mock.calls[0]?.[0]
    // The prompt was rebuilt with the persisted labels, the prior round,
    // and the round-2 re-answers — not the round-1 positions.
    expect(call?.prompt).toContain('round 1 fine')
    expect(call?.prompt).toContain('rethought 1')
    expect(call?.prompt).not.toContain('pos 1')

    const persisted = await getCouncil('c2')
    const final = persisted?.turns[0]?.events.find(
      (e) => e.id === 'final-round',
    )
    expect(final?.output).toBe('recovered consensus')
    expect(final?.mediator?.convergent).toBe(true)
  })

  it('never rewrites a debate whose final round succeeded', async () => {
    const hook = harness(await seedConsensus(false))
    await act(() => hook.result.current.retryMediatorRound('t1'))
    expect(mediatorMock).not.toHaveBeenCalled()
  })

  it('applies the sticky thinking override to the re-run round', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'recovered',
      convergent: true,
      aborted: false,
    })
    const council = await seedConsensus(true)
    // MODEL_B (the mediator) is reasoning-capable → the override lands.
    setRunOptions(council.id, { mutedTools: [], reasoningEffort: 'max' })
    const hook = harness(council)
    await act(() => hook.result.current.retryMediatorRound('t1'))
    expect(mediatorMock.mock.calls[0]?.[0]?.reasoningEffort).toBe('max')
  })
})
