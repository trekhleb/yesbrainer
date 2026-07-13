import type { ProviderId } from '@/models/registry'

/**
 * The API origin each provider adapter talks to — documentation with
 * teeth. The values the adapters use implicitly (AI SDK package defaults)
 * or explicitly (`baseURL` in `providers/index.ts`) are recorded here per
 * provider, and the production build asserts every one appears in the CSP
 * `connect-src` allowlist (`vite.config.ts`) — so wiring a new provider
 * without extending the CSP fails the build instead of failing silently
 * at first runtime call. The `satisfies` clause makes a new `ProviderId`
 * fail typecheck until it gets an origin here.
 *
 * The CSP list itself stays hand-written: extending it is deliberate,
 * reviewable friction (see the comment there). This map only turns drift
 * into a loud failure.
 *
 * Runtime-dependency-free on purpose — `vite.config.ts` imports it at
 * build time (the type import above is erased).
 */
export const PROVIDER_API_ORIGINS = {
  // Local daemon; the CSP carries both localhost spellings, the code uses
  // this one (`OLLAMA_BASE_URL` in providers/index.ts).
  ollama: 'http://localhost:11434',
  // @ai-sdk/anthropic default baseURL.
  anthropic: 'https://api.anthropic.com',
  // @ai-sdk/openai default baseURL.
  openai: 'https://api.openai.com',
  // @ai-sdk/google default baseURL.
  google: 'https://generativelanguage.googleapis.com',
  // @ai-sdk/groq default baseURL.
  groq: 'https://api.groq.com',
  // Explicit baseURL in providers/index.ts (OpenAI adapter re-pointed).
  openrouter: 'https://openrouter.ai',
} as const satisfies Record<ProviderId, string>
