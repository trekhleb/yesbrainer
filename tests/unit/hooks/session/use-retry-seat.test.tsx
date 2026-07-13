import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type MutableRefObject } from 'react'
import { useRetrySeat } from '@/hooks/session/use-retry-seat'
import { runParticipantStream } from '@/providers/run-stream'
import { appendTurn, createCouncil, getCouncil } from '@/storage/councils'
import { setRunOptions } from '@/storage/run-options'
import { clearDb } from '../../helpers/db'
import { MODEL_B, participantEvent, seat, turn } from '../../helpers/fixtures'
import type { Council } from '@/types/council'
import type { SeatRetryState } from '@/types/session'

vi.mock('@/providers/run-stream', () => ({ runParticipantStream: vi.fn() }))
const streamMock = vi.mocked(runParticipantStream)

const OLLAMA = 'ollama:llama3.1' // toolless provider keeps the test lean

function harness(initial: Council) {
  const abortRef: MutableRefObject<AbortController | null> = { current: null }
  return renderHook(
    ({ isBusy }: { isBusy: boolean }) => {
      const [council, setCouncil] = useState<Council | null>(initial)
      const [seatRetry, setSeatRetry] = useState<SeatRetryState | null>(null)
      const { retrySeatAnswer } = useRetrySeat({
        council,
        setCouncil,
        abortRef,
        isBusy,
        setSeatRetry,
      })
      return { council, seatRetry, retrySeatAnswer }
    },
    { initialProps: { isBusy: false } },
  )
}

async function seedCouncil(): Promise<Council> {
  await createCouncil({
    id: 'c1',
    socialStructure: 'roundtable',
    seats: [seat('s1', OLLAMA)],
  })
  await appendTurn(
    'c1',
    turn({
      id: 't1',
      idx: 0,
      events: [
        participantEvent('s1', {
          id: 'bad-answer',
          modelId: OLLAMA,
          error: 'provider down',
          output: '',
        }),
      ],
    }),
  )
  const c = await getCouncil('c1')
  if (!c) throw new Error('seed failed')
  return c
}

beforeEach(async () => {
  streamMock.mockReset()
  localStorage.clear()
  await clearDb()
})

describe('useRetrySeat', () => {
  it('re-runs the errored answer and replaces it in place — storage and mirror', async () => {
    streamMock.mockResolvedValue({
      text: 'recovered answer',
      aborted: false,
      tokens: { input: 2, output: 3 },
    })
    const hook = harness(await seedCouncil())

    await act(() => hook.result.current.retrySeatAnswer('t1', 's1'))

    // Local mirror updated in place under the same event id.
    const ev = hook.result.current.council?.turns[0]?.events[0]
    expect(ev).toMatchObject({ id: 'bad-answer', output: 'recovered answer' })
    expect(ev && 'error' in ev).toBe(false)
    // Persisted row too.
    const persisted = await getCouncil('c1')
    expect(persisted?.turns[0]?.events[0]?.output).toBe('recovered answer')
    expect(persisted?.tokenTotal).toEqual({ inputTokens: 2, outputTokens: 3 })
    // Overlay cleared once settled.
    await waitFor(() => expect(hook.result.current.seatRetry).toBeNull())
  })

  it('gates on busy and ignores unknown turns/seats/non-errored events', async () => {
    const c = await seedCouncil()
    const busyHook = renderHook(() => {
      const [council, setCouncil] = useState<Council | null>(c)
      const [, setSeatRetry] = useState<SeatRetryState | null>(null)
      return useRetrySeat({
        council,
        setCouncil,
        abortRef: { current: null },
        isBusy: true,
        setSeatRetry,
      })
    })
    await act(() => busyHook.result.current.retrySeatAnswer('t1', 's1'))
    expect(streamMock).not.toHaveBeenCalled()

    const hook = harness(c)
    await act(() => hook.result.current.retrySeatAnswer('missing-turn', 's1'))
    await act(() => hook.result.current.retrySeatAnswer('t1', 'missing-seat'))
    expect(streamMock).not.toHaveBeenCalled()
  })

  it('applies the sticky thinking override from the persisted run options', async () => {
    // The composer writes every Thinking-dial change to run-options storage;
    // a retry is an upcoming send, so it must run at the armed effort — the
    // override beating the seat's own `low`.
    await createCouncil({
      id: 'c1',
      socialStructure: 'roundtable',
      seats: [
        {
          ...seat('s1', MODEL_B), // reasoning-capable
          config: { tools: false, reasoningEffort: 'low' },
        },
      ],
    })
    await appendTurn(
      'c1',
      turn({
        id: 't1',
        idx: 0,
        events: [
          participantEvent('s1', {
            id: 'bad-answer',
            modelId: MODEL_B,
            error: 'provider down',
            output: '',
          }),
        ],
      }),
    )
    setRunOptions('c1', { mutedTools: [], reasoningEffort: 'max' })
    streamMock.mockResolvedValue({ text: 'recovered', aborted: false })
    const hook = harness((await getCouncil('c1'))!)

    await act(() => hook.result.current.retrySeatAnswer('t1', 's1'))

    expect(streamMock.mock.calls[0]?.[0]?.reasoningEffort).toBe('max')
  })

  it('a pure abort leaves the errored event untouched', async () => {
    streamMock.mockResolvedValue({ text: '', aborted: true })
    const hook = harness(await seedCouncil())
    await act(() => hook.result.current.retrySeatAnswer('t1', 's1'))
    const persisted = await getCouncil('c1')
    expect(persisted?.turns[0]?.events[0]?.error).toBe('provider down')
    expect(hook.result.current.seatRetry).toBeNull()
  })
})
