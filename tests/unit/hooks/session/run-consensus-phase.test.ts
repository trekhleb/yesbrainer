import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runConsensusPhase } from '@/hooks/session/run-consensus-phase'
import { runMediatorRound } from '@/providers/run-mediator'
import { runReanswerForSeat } from '@/providers/run-reanswer'
import {
  MODEL_B,
  participantEvent,
  seat,
  TEXT_ONLY_MODEL,
} from '../../helpers/fixtures'
import type { MediatingTurn } from '@/types/session'

vi.mock('@/providers/run-mediator', () => ({ runMediatorRound: vi.fn() }))
vi.mock('@/providers/run-reanswer', () => ({ runReanswerForSeat: vi.fn() }))
const mediatorMock = vi.mocked(runMediatorRound)
const reanswerMock = vi.mocked(runReanswerForSeat)

function stateCapture() {
  const box: { current: MediatingTurn | null } = { current: null }
  const set = (
    update:
      | MediatingTurn
      | null
      | ((cur: MediatingTurn | null) => MediatingTurn | null),
  ) => {
    box.current =
      typeof update === 'function' ? update(box.current) : update
  }
  return { box, set }
}

function baseArgs(set: ReturnType<typeof stateCapture>['set']) {
  const seats = [seat('s1'), seat('s2', MODEL_B)]
  return {
    turnId: 't1',
    mediator: { modelId: MODEL_B, config: {} },
    respondingSeats: seats,
    roundOneEvents: [
      participantEvent('s1', { output: 'position 1' }),
      participantEvent('s2', { output: 'position 2' }),
    ],
    userMsg: 'q',
    priorTurns: [],
    deliberation: { mediatorMaxRounds: 3 },
    participantDefault: undefined,
    abortSignal: new AbortController().signal,
    setMediatingTurn: set,
  }
}

beforeEach(() => {
  mediatorMock.mockReset()
  reanswerMock.mockReset()
  reanswerMock.mockResolvedValue({ text: 'reconsidered', aborted: false })
})

describe('runConsensusPhase', () => {
  it('a convergent round 1 ends the debate with one mediator event', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'we agree',
      convergent: true,
      aborted: false,
    })
    const { box, set } = stateCapture()
    const { events, labels } = await runConsensusPhase(baseArgs(set))
    expect(events.map((e) => e.roleType)).toEqual(['mediator'])
    expect(events[0]?.round).toBe(1)
    expect(Object.values(labels).sort()).toEqual(['s1', 's2'])
    expect(reanswerMock).not.toHaveBeenCalled()
    expect(box.current?.status).toBe('done')
    expect(box.current?.rounds).toHaveLength(1)
  })

  it('a divergent round triggers re-answers, then the next round can converge', async () => {
    mediatorMock
      .mockResolvedValueOnce({
        synthesis: 'split',
        convergent: false,
        divergencePoints: 'the disagreement',
        aborted: false,
      })
      .mockResolvedValueOnce({
        synthesis: 'now agreed',
        convergent: true,
        aborted: false,
      })
    const { set } = stateCapture()
    const { events } = await runConsensusPhase(baseArgs(set))
    expect(events.map((e) => e.roleType)).toEqual([
      'mediator',
      'reanswer',
      'reanswer',
      'mediator',
    ])
    expect(events.filter((e) => e.roleType === 'reanswer').every((e) => e.round === 2)).toBe(true)

    // The default pass-back feeds the divergence into the re-answer prompt.
    const reanswerArgs = reanswerMock.mock.calls[0]?.[0]
    expect(reanswerArgs?.prompt).toContain('the disagreement')
  })

  it('bails the loop on an unrecoverable mediator failure', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: '',
      convergent: false,
      aborted: false,
      error: 'schema never parses',
      unrecoverable: true,
    })
    const { box, set } = stateCapture()
    const { events } = await runConsensusPhase(baseArgs(set))
    expect(events).toHaveLength(1)
    expect(mediatorMock).toHaveBeenCalledTimes(1)
    expect(box.current?.status).toBe('error')
  })

  it('two consecutive errored rounds stop the debate', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: '',
      convergent: false,
      aborted: false,
      error: 'transient 529',
    })
    const { set } = stateCapture()
    await runConsensusPhase(baseArgs(set))
    expect(mediatorMock).toHaveBeenCalledTimes(2)
  })

  it('respects the round cap and never re-answers after the last round', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'still split',
      convergent: false,
      divergencePoints: 'x',
      aborted: false,
    })
    const { set } = stateCapture()
    const args = { ...baseArgs(set), deliberation: { mediatorMaxRounds: 2 } }
    const { events } = await runConsensusPhase(args)
    expect(mediatorMock).toHaveBeenCalledTimes(2)
    // rounds: mediator(1), reanswer×2(2), mediator(2) — no round-3 reanswers.
    expect(events.filter((e) => e.roleType === 'reanswer')).toHaveLength(2)
  })

  it('the composer thinking override reaches the Mediator and the re-answers', async () => {
    mediatorMock
      .mockResolvedValueOnce({
        synthesis: 'split',
        convergent: false,
        divergencePoints: 'x',
        aborted: false,
      })
      .mockResolvedValueOnce({
        synthesis: 'agreed',
        convergent: true,
        aborted: false,
      })
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      reasoningEffortOverride: 'max',
    })
    // The Mediator (MODEL_B, reasoning-capable) gets the override on every
    // round, not just the seats — retrying "think harder" must not leave
    // the referee on its default effort.
    expect(mediatorMock).toHaveBeenCalledTimes(2)
    expect(
      mediatorMock.mock.calls.every(
        ([call]) => call.reasoningEffort === 'max',
      ),
    ).toBe(true)
    // Both re-answering seats resolve it too.
    expect(reanswerMock).toHaveBeenCalledTimes(2)
    expect(
      reanswerMock.mock.calls.every(
        ([call]) => call.reasoningEffort === 'max',
      ),
    ).toBe(true)
  })

  it('a non-reasoning Mediator model never receives the override', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'we agree',
      convergent: true,
      aborted: false,
    })
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      mediator: { modelId: TEXT_ONLY_MODEL, config: {} },
      reasoningEffortOverride: 'max',
    })
    expect(
      mediatorMock.mock.calls[0]?.[0]?.reasoningEffort,
    ).toBeUndefined()
  })

  it('stops when a re-answer round produces nothing usable', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'split',
      convergent: false,
      divergencePoints: 'x',
      aborted: false,
    })
    reanswerMock.mockResolvedValue({ text: '', aborted: false, error: 'dead' })
    const { set } = stateCapture()
    const { events } = await runConsensusPhase(baseArgs(set))
    // One mediator round, two errored re-answers, then the loop breaks.
    expect(mediatorMock).toHaveBeenCalledTimes(1)
    expect(events.filter((e) => e.roleType === 'reanswer')).toHaveLength(2)
    expect(
      events
        .filter((e) => e.roleType === 'reanswer')
        .every((e) => e.error === 'dead'),
    ).toBe(true)
  })
})
