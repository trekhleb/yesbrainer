import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { runJudgeStream } from '@/providers/run-judge'
import { fakeStreamResult, type FakeStreamOptions } from '../helpers/ai-mock'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: vi.fn(),
}))
vi.mock('@/providers', () => ({
  getProviderModel: vi.fn(() => 'fake-language-model'),
}))

const streamTextMock = vi.mocked(streamText)

function primeStream(opts: FakeStreamOptions): void {
  streamTextMock.mockImplementation(
    (options: unknown) =>
      fakeStreamResult(
        opts,
        options as { onError?: (e: { error: unknown }) => void },
      ) as never,
  )
}

function baseArgs() {
  return {
    modelId: 'openai:gpt-5.4',
    system: 'default judge system',
    prompt: 'weigh the answers',
    abortSignal: new AbortController().signal,
    onChunk: vi.fn(),
  }
}

beforeEach(() => {
  streamTextMock.mockReset()
})

describe('runJudgeStream', () => {
  it('streams the verdict and applies the system-override cascade', async () => {
    primeStream({ deltas: ['ver', 'dict'], usage: { inputTokens: 1, outputTokens: 1 } })
    const result = await runJudgeStream({
      ...baseArgs(),
      systemPromptOverride: 'stern judge',
    })
    expect(result.text).toBe('verdict')
    const call = streamTextMock.mock.calls[0]?.[0] as {
      system?: string
      prompt?: string
    }
    expect(call.system).toBe('stern judge')
    expect(call.prompt).toBe('weigh the answers')
  })

  it('sends a multi-modal message when the turn carries images', async () => {
    primeStream({ deltas: ['v'] })
    await runJudgeStream({
      ...baseArgs(),
      images: ['data:image/png;base64,AA'],
    })
    const call = streamTextMock.mock.calls[0]?.[0] as {
      prompt?: string
      messages?: unknown[]
    }
    expect(call.prompt).toBeUndefined()
    expect(call.messages).toHaveLength(1)
  })

  it('abort keeps partial text; real failures return a message', async () => {
    const controller = new AbortController()
    streamTextMock.mockImplementation(() => {
      controller.abort()
      throw new Error('gone')
    })
    expect(
      await runJudgeStream({ ...baseArgs(), abortSignal: controller.signal }),
    ).toEqual({ text: '', aborted: true })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamTextMock.mockImplementation(() => {
      throw new Error('judge unavailable')
    })
    const failed = await runJudgeStream(baseArgs())
    expect(failed.error).toBe('judge unavailable')
  })
})
