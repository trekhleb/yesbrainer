import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateObject } from 'ai'
import { runVoteForVoter } from '@/providers/run-vote'
import { seat } from '../helpers/fixtures'
import { participantEvent } from '../helpers/fixtures'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: vi.fn(),
}))
vi.mock('@/providers', () => ({
  getProviderModel: vi.fn(() => 'fake-language-model'),
}))

const generateObjectMock = vi.mocked(generateObject)

function primeVotes(votes: unknown[]): void {
  generateObjectMock.mockResolvedValue({
    object: { votes },
    usage: { inputTokens: 5, outputTokens: 5 },
  } as never)
}

const VISION_VOTER = seat('voter', 'openai:gpt-5.4')

function baseArgs() {
  return {
    voter: VISION_VOTER,
    votingLabels: { A: 'voter', B: 'target-b', C: 'target-c' },
    events: [
      participantEvent('target-b', { output: 'answer B' }),
      participantEvent('target-c', { output: 'answer C' }),
    ],
    userMsg: 'the question',
    voteSystem: 'you are a rater',
    voteTemplate:
      'Q: {question}\n{answers}\n{dimensionsDescription}\n{commentRequirement}',
    dimensions: ['accuracy', 'insight'],
    dimensionsDescription: 'rate 1-5',
    minCommentLength: 0,
    stripSelfId: false,
    abortSignal: new AbortController().signal,
  }
}

beforeEach(() => {
  generateObjectMock.mockReset()
})

describe('runVoteForVoter', () => {
  it('maps labels back to seat ids and extracts the dynamic dimensions', async () => {
    primeVotes([
      { label: 'B', accuracy: 4, insight: 3, comment: 'solid' },
      // Decorated label still resolves (the shared coercer).
      { label: 'model_c', accuracy: 2, comment: 'thin' },
    ])
    const result = await runVoteForVoter(baseArgs())
    expect(result.error).toBeUndefined()
    expect(result.vote).toEqual([
      {
        targetSeatId: 'target-b',
        ratings: { accuracy: 4, insight: 3 },
        comment: 'solid',
      },
      { targetSeatId: 'target-c', ratings: { accuracy: 2 }, comment: 'thin' },
    ])
    expect(result.tokens).toEqual({ input: 5, output: 5 })
  })

  it('never lets a voter rate itself — own label is not in the pool', async () => {
    primeVotes([{ label: 'A', accuracy: 5, comment: 'me!' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runVoteForVoter(baseArgs())
    // 'A' is the voter's own seat — outside labelToSeat, so dropped.
    expect(result.vote).toEqual([])
    expect(result.error).toContain('voter returned labels [A]')
    expect(result.rawResponse).toBeDefined()
    expect(warn).toHaveBeenCalled()
  })

  it('reports an actionable error when the model returns no entries', async () => {
    primeVotes([])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runVoteForVoter(baseArgs())
    expect(result.error).toContain('no entries')
  })

  it('substitutes the prompt and surfaces the comment requirement', async () => {
    primeVotes([{ label: 'B', accuracy: 3, comment: 'long enough' }])
    await runVoteForVoter({ ...baseArgs(), minCommentLength: 40 })
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt?: string }
    expect(call.prompt).toContain('Q: the question')
    expect(call.prompt).toContain('Model B:\nanswer B')
    expect(call.prompt).toContain('at least 40 characters')
  })

  it('attaches images only for vision-capable voters', async () => {
    primeVotes([{ label: 'B', accuracy: 3, comment: 'x' }])
    const images = ['data:image/png;base64,AA']
    await runVoteForVoter({ ...baseArgs(), userImages: images })
    let call = generateObjectMock.mock.calls[0]?.[0] as {
      messages?: unknown[]
      prompt?: string
    }
    expect(call.messages).toHaveLength(1)

    generateObjectMock.mockClear()
    primeVotes([{ label: 'B', accuracy: 3, comment: 'x' }])
    await runVoteForVoter({
      ...baseArgs(),
      voter: seat('voter', 'groq:llama-3.3-70b'), // text-only
      userImages: images,
    })
    call = generateObjectMock.mock.calls[0]?.[0] as {
      messages?: unknown[]
      prompt?: string
    }
    expect(call.messages).toBeUndefined()
    expect(call.prompt).toBeDefined()
  })

  it('abort is silent; other throws get the rich classification', async () => {
    const controller = new AbortController()
    generateObjectMock.mockImplementation(() => {
      controller.abort()
      throw new Error('cut off')
    })
    expect(
      await runVoteForVoter({ ...baseArgs(), abortSignal: controller.signal }),
    ).toEqual({ vote: [], aborted: true })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    generateObjectMock.mockRejectedValue(new Error('provider down'))
    const failed = await runVoteForVoter(baseArgs())
    expect(failed.aborted).toBe(false)
    expect(failed.error).toContain('Voter')
    expect(failed.error).toContain('provider down')
  })
})
