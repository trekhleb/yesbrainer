import { beforeEach, describe, expect, it, vi } from 'vitest'
import { streamText } from 'ai'
import { runParticipantStream } from '@/providers/run-stream'
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
    modelId: 'anthropic:claude-sonnet-5',
    history: [{ role: 'user' as const, content: 'q' }],
    abortSignal: new AbortController().signal,
    onChunk: vi.fn(),
  }
}

beforeEach(() => {
  streamTextMock.mockReset()
})

describe('runParticipantStream', () => {
  it('accumulates deltas, reports chunks, and maps usage', async () => {
    primeStream({ deltas: ['Hel', 'lo'], usage: { inputTokens: 2, outputTokens: 3 } })
    const args = baseArgs()
    const result = await runParticipantStream(args)
    expect(result).toEqual({
      text: 'Hello',
      aborted: false,
      tokens: { input: 2, output: 3 },
    })
    expect(args.onChunk).toHaveBeenNthCalledWith(1, 'Hel')
    expect(args.onChunk).toHaveBeenNthCalledWith(2, 'Hello')
  })

  it('cascades a blank system override to the registry default', async () => {
    primeStream({ deltas: [] })
    await runParticipantStream({ ...baseArgs(), systemPrompt: '   ' })
    const call = streamTextMock.mock.calls[0]?.[0] as { system?: string }
    expect(call.system).toBe(
      'You are a council Participant. Answer the user thoughtfully and concisely.',
    )
  })

  it('surfaces onError failures even when the stream completes empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    primeStream({ deltas: [], emitError: new Error('CORS wall') })
    const result = await runParticipantStream(baseArgs())
    expect(result.error).toBe('CORS wall')
    expect(result.aborted).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('captures tool calls from the fullStream when tools are attached', async () => {
    primeStream({
      deltas: ['answer'],
      extraParts: [
        { type: 'tool-call', toolName: 'web_search', input: { query: 'llms' } },
        { type: 'tool-call', dynamicToolName: 'calc', args: { input: '2+2' } },
        { type: 'tool-call' }, // nameless — dropped
      ],
    })
    const result = await runParticipantStream({
      ...baseArgs(),
      tools: { web_search: {} } as never,
    })
    expect(result.toolCalls).toEqual([
      { name: 'web_search', query: 'llms' },
      { name: 'calc', query: '2+2' },
    ])
  })

  it('feeds reasoning deltas to onReasoning, live-only (not in the result)', async () => {
    primeStream({
      deltas: [],
      extraParts: [
        { type: 'reasoning-start', id: 'r1' },
        { type: 'reasoning-delta', id: 'r1', text: 'Weighing options' },
        { type: 'reasoning-start', id: 'r2' },
        { type: 'reasoning-delta', id: 'r2', text: 'Choosing one' },
        { type: 'text-delta', text: 'Answer' },
      ],
    })
    const onReasoning = vi.fn()
    const result = await runParticipantStream({ ...baseArgs(), onReasoning })
    // Leading edge fires the first block immediately; the flush guarantees
    // the final accumulation, with blocks separated as paragraphs.
    expect(onReasoning).toHaveBeenNthCalledWith(1, 'Weighing options')
    expect(onReasoning).toHaveBeenLastCalledWith(
      'Weighing options\n\nChoosing one',
    )
    expect(result.text).toBe('Answer')
    // Live-only contract: reasoning never rides the persisted result.
    expect(result).not.toHaveProperty('reasoning')
  })

  it('drops reasoning parts silently when no onReasoning is wired', async () => {
    primeStream({
      deltas: ['Answer'],
      extraParts: [{ type: 'reasoning-delta', id: 'r', text: 'hmm' }],
    })
    const result = await runParticipantStream(baseArgs())
    expect(result.text).toBe('Answer')
  })

  it('treats a rejected usage promise as "no usage reported"', async () => {
    primeStream({ deltas: ['x'], usageRejects: true })
    const result = await runParticipantStream(baseArgs())
    expect(result.text).toBe('x')
    expect(result.tokens).toBeUndefined()
  })

  it('an aborted throw keeps partial text and stays silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = new AbortController()
    streamTextMock.mockImplementation(() => {
      controller.abort()
      throw new Error('aborted mid-flight')
    })
    const result = await runParticipantStream({
      ...baseArgs(),
      abortSignal: controller.signal,
    })
    expect(result).toEqual({ text: '', aborted: true })
    expect(warn).not.toHaveBeenCalled()
  })

  it('a real throw logs redacted and returns the message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    streamTextMock.mockImplementation(() => {
      throw new Error('provider fell over')
    })
    const result = await runParticipantStream(baseArgs())
    expect(result.error).toBe('provider fell over')
    expect(warn).toHaveBeenCalled()
  })
})
