import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runConsensusPhase } from '@/hooks/session/run-consensus-phase'
import { runMediatorRound } from '@/providers/run-mediator'
import { runReanswerForSeat } from '@/providers/run-reanswer'
import {
  MODEL_B,
  noopCheckpoint,
  participantEvent,
  seat,
  TEXT_ONLY_MODEL,
  visibilityWatch,
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
    watch: visibilityWatch(),
    checkpoint: noopCheckpoint,
    markPhase: () => {},
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

/**
 * Resume. The property under test throughout: work already on the turn is
 * *replayed*, never re-issued — a resumed debate must cost the user only
 * what the interruption actually took away.
 */
describe('runConsensusPhase — resuming an interrupted debate', () => {
  const roundOutcome = (round: number, convergent: boolean) => ({
    round,
    status: 'done' as const,
    synthesis: `round ${round}`,
    convergent,
    error: null,
  })

  it('replays a persisted round instead of calling the mediator again', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'round 2',
      convergent: true,
      aborted: false,
    })
    const { set } = stateCapture()
    const { events } = await runConsensusPhase({
      ...baseArgs(set),
      progress: {
        rounds: new Map([[1, roundOutcome(1, false)]]),
        reanswers: new Map([
          [
            2,
            [
              {
                id: 'r1',
                roleType: 'reanswer' as const,
                seatId: 's1',
                modelId: MODEL_B,
                output: 'reconsidered',
                ts: 1,
                round: 2,
              },
              {
                id: 'r2',
                roleType: 'reanswer' as const,
                seatId: 's2',
                modelId: MODEL_B,
                output: 'reconsidered',
                ts: 1,
                round: 2,
              },
            ],
          ],
        ]),
      },
      existingLabels: { A: 's1', B: 's2' },
    })
    // Round 1 replayed, round 2's re-answers replayed — only round 2's
    // assessment was still owed.
    expect(mediatorMock).toHaveBeenCalledOnce()
    expect(reanswerMock).not.toHaveBeenCalled()
    expect(events.map((e) => e.roleType)).toEqual(['mediator'])
    expect(events[0]?.round).toBe(2)
  })

  it('re-issues only the seats whose re-answer never landed', async () => {
    // Convergent on round 2 so the loop stops there and the assertion sees
    // exactly round 2's fan-out — round 3 would legitimately re-answer both.
    mediatorMock.mockResolvedValue({
      synthesis: 'round 2',
      convergent: true,
      aborted: false,
    })
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      progress: {
        rounds: new Map([[1, roundOutcome(1, false)]]),
        reanswers: new Map([
          [
            2,
            [
              {
                id: 'r1',
                roleType: 'reanswer' as const,
                seatId: 's1',
                modelId: MODEL_B,
                output: 'reconsidered',
                ts: 1,
                round: 2,
              },
            ],
          ],
        ]),
      },
      existingLabels: { A: 's1', B: 's2' },
    })
    // s1 already re-answered round 2; only s2 is owed.
    const reanswered = reanswerMock.mock.calls.map(([a]) => a.seat.id)
    expect(reanswered).toEqual(['s2'])
  })

  it('keeps the original anonymization map, so a peer tracked as one label across rounds does not silently become another mid-argument', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'ok',
      convergent: true,
      aborted: false,
    })
    const { set } = stateCapture()
    const { labels } = await runConsensusPhase({
      ...baseArgs(set),
      existingLabels: { A: 's2', B: 's1' },
    })
    expect(labels).toEqual({ A: 's2', B: 's1' })
  })

  it('never lowers the round cap below rounds that already happened — a settings edge between attempts must not render "round 3 of 2"', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'ok',
      convergent: true,
      aborted: false,
    })
    const { box, set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      deliberation: { mediatorMaxRounds: 1 },
      progress: {
        rounds: new Map([
          [1, roundOutcome(1, false)],
          [2, roundOutcome(2, false)],
        ]),
        reanswers: new Map(),
      },
    })
    expect(box.current?.maxRounds).toBeGreaterThanOrEqual(2)
  })
})

describe('runConsensusPhase — interruption', () => {
  it('records no event for a round the browser cut off, so the slot stays pending for the resume', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: '',
      convergent: false,
      aborted: false,
      error: 'TypeError: Load failed',
    })
    const { set } = stateCapture()
    const { events, interrupted } = await runConsensusPhase(baseArgs(set))
    expect(interrupted).toBe('connection')
    expect(events).toEqual([])
  })

  it('leaves a genuine provider failure as an errored event — and, unlike an interruption, lets the debate carry on (one bad round is survivable; it takes two consecutive ones to stop)', async () => {
    mediatorMock.mockResolvedValueOnce({
      synthesis: '',
      convergent: false,
      aborted: false,
      error: 'provider returned 500 overloaded',
    })
    mediatorMock.mockResolvedValue({
      synthesis: 'recovered',
      convergent: true,
      aborted: false,
    })
    const { set } = stateCapture()
    const { events, interrupted } = await runConsensusPhase(baseArgs(set))
    expect(interrupted).toBeNull()
    const mediatorEvents = events.filter((e) => e.roleType === 'mediator')
    expect(mediatorEvents[0]?.error).toContain('500')
    expect(mediatorEvents.length).toBe(2)
  })

  it('stops the debate rather than refereeing a round that lost voices mid-fan-out', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'keep going',
      convergent: false,
      aborted: false,
    })
    reanswerMock.mockResolvedValue({
      text: '',
      aborted: false,
      error: 'The network connection was lost.',
    })
    const { set } = stateCapture()
    const { events, interrupted } = await runConsensusPhase(baseArgs(set))
    expect(interrupted).toBe('connection')
    // Round 1's assessment survives; no re-answer events, and no round 2.
    expect(events.map((e) => e.roleType)).toEqual(['mediator'])
    expect(mediatorMock).toHaveBeenCalledOnce()
  })
})

describe('runConsensusPhase — checkpointing', () => {
  it('persists after each completed round, so a kill during the next one keeps what was already paid for', async () => {
    mediatorMock
      .mockResolvedValueOnce({
        synthesis: 'round 1',
        convergent: false,
        aborted: false,
      })
      .mockResolvedValue({
        synthesis: 'round 2',
        convergent: true,
        aborted: false,
      })
    const saved: { count: number; labels: Record<string, string>[] } = {
      count: 0,
      labels: [],
    }
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      checkpoint: async (_events, at) => {
        saved.count += 1
        saved.labels.push(at.labels)
      },
    })
    // round 1 · re-answers into round 2 · round 2
    expect(saved.count).toBe(3)
    // Every checkpoint carries the map, so a resume can read it back from
    // the very first one rather than re-shuffling the labels.
    expect(saved.labels.every((l) => Object.values(l).includes('s1'))).toBe(true)
  })
})

describe('runConsensusPhase — phase marking', () => {
  it('carries the round cap, which only this phase can resolve — the paused card needs it to say "round 2 of 3" instead of falling back to "during the debate"', async () => {
    mediatorMock
      .mockResolvedValueOnce({
        synthesis: 'r1',
        convergent: false,
        aborted: false,
      })
      .mockResolvedValue({ synthesis: 'r2', convergent: true, aborted: false })
    const marks: { phase: string; round: number; maxRounds: number }[] = []
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      markPhase: (at) => marks.push(at),
    })
    // Round 1 mediation → round 2's re-answers → round 2 mediation, each
    // carrying the clamped cap from `deliberation.mediatorMaxRounds`.
    expect(marks).toEqual([
      { phase: 'mediating', round: 1, maxRounds: 3 },
      { phase: 'reanswering', round: 2, maxRounds: 3 },
      { phase: 'mediating', round: 2, maxRounds: 3 },
    ])
  })

  it('floors the cap at the rounds a resumed turn already holds, so it can never render "round 3 of 2"', async () => {
    mediatorMock.mockResolvedValue({
      synthesis: 'done',
      convergent: true,
      aborted: false,
    })
    const marks: { maxRounds: number }[] = []
    const { set } = stateCapture()
    await runConsensusPhase({
      ...baseArgs(set),
      deliberation: { mediatorMaxRounds: 1 },
      progress: {
        rounds: new Map([
          [
            1,
            { round: 1, status: 'done' as const, synthesis: 'r1', convergent: false, error: null },
          ],
          [
            2,
            { round: 2, status: 'done' as const, synthesis: 'r2', convergent: false, error: null },
          ],
        ]),
        reanswers: new Map(),
      },
      markPhase: (at) => marks.push(at),
    })
    expect(marks.every((m) => m.maxRounds >= 2)).toBe(true)
  })
})
