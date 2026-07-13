import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateObject, NoObjectGeneratedError } from 'ai'
import { runMediatorRound } from '@/providers/run-mediator'
import { fullUsage } from '../helpers/ai-mock'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: vi.fn(),
}))
vi.mock('@/providers', () => ({
  getProviderModel: vi.fn(() => 'fake-language-model'),
}))

const generateObjectMock = vi.mocked(generateObject)

function baseArgs() {
  return {
    modelId: 'google:gemini-3.5-flash',
    system: 'referee',
    prompt: 'assess round 1',
    abortSignal: new AbortController().signal,
  }
}

beforeEach(() => {
  generateObjectMock.mockReset()
})

describe('runMediatorRound', () => {
  it('maps the structured verdict, keeping optional fields conditional', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        synthesis: 'we agree',
        convergent: true,
        roundDigest: {
          summary: 'B moved',
          movements: [{ label: 'B', stance: 'converged', note: 'ceded' }],
        },
      },
      usage: { inputTokens: 9, outputTokens: 9 },
    } as never)
    const result = await runMediatorRound(baseArgs())
    expect(result).toEqual({
      synthesis: 'we agree',
      convergent: true,
      roundDigest: {
        summary: 'B moved',
        movements: [{ label: 'B', stance: 'converged', note: 'ceded' }],
      },
      aborted: false,
      tokens: { input: 9, output: 9 },
    })
    expect('divergencePoints' in result).toBe(false)
  })

  it('a schema failure comes back unrecoverable with the raw text attached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    generateObjectMock.mockRejectedValue(
      new NoObjectGeneratedError({
        message: 'nope',
        text: 'free-form rambling instead of JSON',
        response: { id: 'resp', timestamp: new Date(0), modelId: 'm' },
        usage: fullUsage(),
        finishReason: 'error',
      }),
    )
    const result = await runMediatorRound(baseArgs())
    expect(result.unrecoverable).toBe(true)
    expect(result.error).toContain('Mediator (google:gemini-3.5-flash)')
    expect(result.rawResponse).toContain('free-form rambling')
    expect(result.synthesis).toBe('')
    expect(result.convergent).toBe(false)
  })

  it('abort returns the quiet aborted shape', async () => {
    const controller = new AbortController()
    generateObjectMock.mockImplementation(() => {
      controller.abort()
      throw new Error('stopped')
    })
    expect(
      await runMediatorRound({ ...baseArgs(), abortSignal: controller.signal }),
    ).toEqual({ synthesis: '', convergent: false, aborted: true })
  })
})
