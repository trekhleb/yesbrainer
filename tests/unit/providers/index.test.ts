import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProviderModel, isProviderReachable } from '@/providers'
import { getModel } from '@/models/registry'

/** Each factory mock returns a callable "provider" whose result records
 *  which adapter + config produced it — enough to assert routing. */
function providerFn(kind: string) {
  return vi.fn((cfg: unknown) => {
    const call = (id: string) => ({ kind, cfg, id })
    return Object.assign(call, {
      chat: (id: string) => ({ kind: `${kind}-chat`, cfg, id }),
    })
  })
}

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: providerFn('anthropic') }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: providerFn('openai') }))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: providerFn('google'),
}))
vi.mock('@ai-sdk/groq', () => ({ createGroq: providerFn('groq') }))
vi.mock('ollama-ai-provider-v2', () => ({ createOllama: providerFn('ollama') }))

function configureKeys(keys: Record<string, string>): void {
  localStorage.setItem('yesbrainer:keys', JSON.stringify(keys))
}

beforeEach(() => {
  localStorage.clear()
})

describe('getProviderModel', () => {
  it('throws an actionable MissingKeyError when the provider has no key', () => {
    expect(() =>
      getProviderModel(getModel('anthropic:claude-sonnet-5')),
    ).toThrow('Anthropic API key not configured')
  })

  it('hands the key to the adapter with the browser-access header (Anthropic)', () => {
    configureKeys({ anthropic: 'the-key' })
    const model = getProviderModel(
      getModel('anthropic:claude-sonnet-5'),
    ) as unknown as { kind: string; cfg: Record<string, unknown> }
    expect(model.kind).toBe('anthropic')
    expect(model.cfg['apiKey']).toBe('the-key')
    expect(model.cfg['headers']).toEqual({
      'anthropic-dangerous-direct-browser-access': 'true',
    })
  })

  it('Ollama needs no key and points at the local daemon', () => {
    const model = getProviderModel(
      getModel('ollama:llama3.1'),
    ) as unknown as { kind: string; cfg: Record<string, unknown> }
    expect(model.kind).toBe('ollama')
    expect(model.cfg['baseURL']).toBe('http://localhost:11434/api')
  })

  it('routes OpenAI / Google / Groq to their adapters with the BYOK key', () => {
    configureKeys({ openai: 'oa-key', google: 'g-key', groq: 'gq-key' })
    const asModel = (id: string) =>
      getProviderModel(getModel(id)) as unknown as {
        kind: string
        cfg: Record<string, unknown>
      }
    const openai = asModel('openai:gpt-5.4')
    expect(openai.kind).toBe('openai')
    expect(openai.cfg['apiKey']).toBe('oa-key')
    const google = asModel('google:gemini-3.5-flash')
    expect(google.kind).toBe('google')
    expect(google.cfg['apiKey']).toBe('g-key')
    const groq = asModel('groq:llama-3.3-70b')
    expect(groq.kind).toBe('groq')
    expect(groq.cfg['apiKey']).toBe('gq-key')
  })

  it('OpenRouter re-points the OpenAI adapter and forces Chat Completions', () => {
    configureKeys({ openrouter: 'or-key' })
    const entry = getModel('anthropic:claude-sonnet-5')
    const model = getProviderModel({
      ...entry,
      provider: 'openrouter',
      providerModelId: 'anthropic/claude-sonnet',
    }) as unknown as { kind: string; cfg: Record<string, unknown>; id: string }
    expect(model.kind).toBe('openai-chat')
    expect(model.cfg['baseURL']).toBe('https://openrouter.ai/api/v1')
    expect(model.id).toBe('anthropic/claude-sonnet')
  })
})

describe('isProviderReachable', () => {
  it('cloud providers are optimistic on a configured key', () => {
    const entry = getModel('openai:gpt-5.4')
    expect(isProviderReachable(entry, {}, false)).toBe(false)
    expect(isProviderReachable(entry, { openai: 'k' }, false)).toBe(true)
  })

  it('Ollama defers to the live reachability flag', () => {
    const entry = getModel('ollama:llama3.1')
    expect(isProviderReachable(entry, {}, false)).toBe(false)
    expect(isProviderReachable(entry, {}, true)).toBe(true)
  })
})
