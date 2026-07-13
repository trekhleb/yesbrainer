import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateObject } from 'ai'
import { pickTitleModelId, prepareAndRunTitleGen } from '@/providers/run-title'
import { setOllamaEnabled } from '@/storage/ollama'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: vi.fn(),
}))
vi.mock('@/providers', () => ({
  getProviderModel: vi.fn(() => 'fake-language-model'),
}))

const generateObjectMock = vi.mocked(generateObject)

beforeEach(() => {
  generateObjectMock.mockReset()
})

describe('pickTitleModelId', () => {
  it('returns null when nothing in the chain is reachable', () => {
    expect(pickTitleModelId(undefined, {})).toBeNull()
  })

  it('prefers the user’s configured model when its provider has a key', () => {
    expect(
      pickTitleModelId('openai:gpt-5.4-mini', { openai: 'k' }),
    ).toBe('openai:gpt-5.4-mini')
  })

  it('skips unreachable preferences and walks the chain', () => {
    const picked = pickTitleModelId('openai:gpt-5.4-mini', { anthropic: 'k' })
    expect(picked).not.toBeNull()
    expect(picked).toContain('anthropic:')
  })

  it('counts Ollama only while the opt-in toggle is on', () => {
    expect(pickTitleModelId('ollama:llama3.1', {})).toBeNull()
    setOllamaEnabled(true)
    expect(pickTitleModelId('ollama:llama3.1', {})).toBe('ollama:llama3.1')
  })
})

describe('prepareAndRunTitleGen', () => {
  it('skips silently (empty result) when no model is reachable', async () => {
    const result = await prepareAndRunTitleGen({
      question: 'q',
      firstAnswer: 'a',
      abortSignal: new AbortController().signal,
    })
    expect(result).toEqual({})
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it('runs the titler against the first reachable model and trims', async () => {
    localStorage.setItem(
      'yesbrainer:keys',
      JSON.stringify({ anthropic: 'k' }),
    )
    generateObjectMock.mockResolvedValue({
      object: { title: '  Monolith vs microservices  ' },
      usage: {},
    } as never)
    const result = await prepareAndRunTitleGen({
      question: 'monolith?',
      firstAnswer: '',
      abortSignal: new AbortController().signal,
    })
    expect(result.title).toBe('Monolith vs microservices')
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt?: string }
    expect(call.prompt).toContain('monolith?')
    expect(call.prompt).toContain('(no answer landed yet)')
  })

  it('rejects a title that trims below the floor', async () => {
    localStorage.setItem('yesbrainer:keys', JSON.stringify({ anthropic: 'k' }))
    generateObjectMock.mockResolvedValue({
      object: { title: ' ab ' },
      usage: {},
    } as never)
    const result = await prepareAndRunTitleGen({
      question: 'q',
      firstAnswer: 'a',
      abortSignal: new AbortController().signal,
    })
    expect(result).toEqual({ error: 'title_too_short_after_trim' })
  })
})
