/**
 * Provider factory — turns a `ModelEntry` into a concrete AI SDK
 * `LanguageModel` by dispatching on `entry.provider`, reading the matching
 * BYOK key from localStorage (or hitting Ollama directly for local).
 *
 * Lives in the browser only — these provider packages call provider APIs
 * directly. The server bundle never imports them.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOllama } from 'ollama-ai-provider-v2'
import type { LanguageModel } from 'ai'
import { getApiKeys, type ApiKeys } from '@/storage/keys'
import type { ModelEntry, ProviderId } from '@/models/registry'

const OLLAMA_BASE_URL = 'http://localhost:11434/api'

class MissingKeyError extends Error {
  provider: ProviderId
  constructor(provider: ProviderId) {
    super(
      `${displayName(provider)} API key not configured. Open Settings and paste a key.`,
    )
    this.provider = provider
    this.name = 'MissingKeyError'
  }
}

function displayName(p: ProviderId): string {
  return ({
    ollama: 'Ollama',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    groq: 'Groq',
    openrouter: 'OpenRouter',
  } satisfies Record<ProviderId, string>)[p]
}

export function getProviderModel(entry: ModelEntry): LanguageModel {
  const keys = getApiKeys()
  switch (entry.provider) {
    case 'ollama':
      return createOllama({ baseURL: OLLAMA_BASE_URL })(entry.providerModelId)
    case 'anthropic': {
      const apiKey = requireKey(keys, 'anthropic')
      // Anthropic gates browser-direct calls behind this header.
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(entry.providerModelId)
    }
    case 'openai':
      return createOpenAI({ apiKey: requireKey(keys, 'openai') })(
        entry.providerModelId,
      )
    case 'google':
      return createGoogleGenerativeAI({ apiKey: requireKey(keys, 'google') })(
        entry.providerModelId,
      )
    case 'groq':
      return createGroq({ apiKey: requireKey(keys, 'groq') })(
        entry.providerModelId,
      )
    case 'openrouter': {
      // OpenRouter is OpenAI Chat-Completions compatible, so we reuse the
      // OpenAI adapter pointed at its gateway — no extra dependency. `.chat()`
      // forces the Chat Completions API (OpenRouter doesn't implement
      // OpenAI's newer Responses API). Unlike the native providers, prompts
      // route through OpenRouter's servers (a middleman) before reaching the
      // underlying vendor — still BYOK, but not "direct to the vendor".
      const apiKey = requireKey(keys, 'openrouter')
      return createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey,
      }).chat(entry.providerModelId)
    }
  }
}

function requireKey(keys: ApiKeys, provider: ProviderId): string {
  const k = keys[provider]
  if (!k) throw new MissingKeyError(provider)
  return k
}

/**
 * Reachability check used by the model picker (grey-out) and the
 * usable-model gate. Cloud providers are optimistic — presumed reachable
 * when a key is configured (a real auth failure surfaces only on a real
 * call; we don't burn tokens to validate). Ollama has no key — pass
 * `useOllamaReachable().reachable`, which is false whenever the opt-in
 * toggle (Settings → Keys) is off.
 */
export function isProviderReachable(
  entry: ModelEntry,
  keys: ApiKeys,
  ollamaReachable: boolean,
): boolean {
  if (entry.provider === 'ollama') return ollamaReachable
  return !!keys[entry.provider]
}
