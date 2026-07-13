import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runJudgeSynthesis } from '@/hooks/session/run-judge-synthesis'
import { runJudgeStream } from '@/providers/run-judge'
import {
  MODEL_B,
  participantEvent,
  seat,
  TEXT_ONLY_MODEL,
  turn,
  VISION_MODEL,
} from '../../helpers/fixtures'

vi.mock('@/providers/run-judge', () => ({ runJudgeStream: vi.fn() }))
const runJudgeStreamMock = vi.mocked(runJudgeStream)

function baseArgs() {
  return {
    eventId: 'judge-ev',
    judge: { modelId: MODEL_B, config: {} },
    seats: [seat('s1'), seat('s2', MODEL_B)],
    events: [
      participantEvent('s1', { output: 'first answer' }),
      participantEvent('s2', { output: 'second answer' }),
    ],
    userMsg: 'the question',
    priorTurns: [] as ReturnType<typeof turn>[],
    deliberation: undefined,
    abortSignal: new AbortController().signal,
    onChunk: vi.fn(),
  }
}

beforeEach(() => {
  runJudgeStreamMock.mockReset()
})

describe('runJudgeSynthesis', () => {
  it('assembles the judge prompt from the turn context and builds the event', async () => {
    runJudgeStreamMock.mockResolvedValue({
      text: 'the verdict',
      aborted: false,
      tokens: { input: 4, output: 6 },
    })
    const { result, event } = await runJudgeSynthesis(baseArgs())
    expect(result.text).toBe('the verdict')
    expect(event).toMatchObject({
      id: 'judge-ev',
      roleType: 'judge',
      modelId: MODEL_B,
      output: 'the verdict',
      tokens: { input: 4, output: 6 },
    })

    const call = runJudgeStreamMock.mock.calls[0]?.[0]
    expect(call?.prompt).toContain('the question')
    expect(call?.prompt).toContain('first answer')
    expect(call?.prompt).toContain('(no voter comments)')
    expect(call?.system).toBeTruthy()
  })

  it('threads the per-judge system override and images only for vision judges', async () => {
    runJudgeStreamMock.mockResolvedValue({ text: 'v', aborted: false })
    const images = ['data:image/png;base64,AA']
    await runJudgeSynthesis({
      ...baseArgs(),
      judge: {
        modelId: VISION_MODEL, // vision-capable
        config: { systemPrompt: 'stern override' },
      },
      userImages: images,
    })
    let call = runJudgeStreamMock.mock.calls[0]?.[0]
    expect(call?.systemPromptOverride).toBe('stern override')
    expect(call?.images).toEqual(images)

    runJudgeStreamMock.mockClear()
    runJudgeStreamMock.mockResolvedValue({ text: 'v', aborted: false })
    await runJudgeSynthesis({
      ...baseArgs(),
      judge: { modelId: TEXT_ONLY_MODEL, config: {} }, // text-only
      userImages: images,
    })
    call = runJudgeStreamMock.mock.calls[0]?.[0]
    expect(call?.images).toBeUndefined()
  })

  it('the composer thinking override wins over the Judge\'s own effort', async () => {
    runJudgeStreamMock.mockResolvedValue({ text: 'v', aborted: false })
    await runJudgeSynthesis({
      ...baseArgs(),
      judge: { modelId: MODEL_B, config: { reasoningEffort: 'low' } },
      reasoningEffortOverride: 'max',
    })
    expect(runJudgeStreamMock.mock.calls[0]?.[0]?.reasoningEffort).toBe('max')

    // …but never lands on a Judge whose model can't reason.
    runJudgeStreamMock.mockClear()
    runJudgeStreamMock.mockResolvedValue({ text: 'v', aborted: false })
    await runJudgeSynthesis({
      ...baseArgs(),
      judge: { modelId: TEXT_ONLY_MODEL, config: {} },
      reasoningEffortOverride: 'max',
    })
    expect(
      runJudgeStreamMock.mock.calls[0]?.[0]?.reasoningEffort,
    ).toBeUndefined()
  })

  it('a pure abort with no text produces no event (no record rule)', async () => {
    runJudgeStreamMock.mockResolvedValue({ text: '', aborted: true })
    const { event } = await runJudgeSynthesis(baseArgs())
    expect(event).toBeNull()
  })

  it('an errored run still lands an event carrying the error', async () => {
    runJudgeStreamMock.mockResolvedValue({
      text: '',
      aborted: false,
      error: 'judge down',
    })
    const { event } = await runJudgeSynthesis(baseArgs())
    expect(event?.error).toBe('judge down')
  })
})
