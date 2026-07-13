/**
 * The provider brand-mark components (`@lobehub/icons` Avatars), keyed by
 * provider id — ONE logo source for every surface: `<ProviderLogo>` in the
 * UI and the share-card canvas renderer (which rasterizes these same
 * components to SVG). Lives outside the component files so react-refresh
 * stays happy and neither consumer owns the other.
 */

import Anthropic from '@lobehub/icons/es/Anthropic'
import Gemini from '@lobehub/icons/es/Gemini'
import Groq from '@lobehub/icons/es/Groq'
import Ollama from '@lobehub/icons/es/Ollama'
import OpenAI from '@lobehub/icons/es/OpenAI'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import type { ProviderId } from '@/models/registry'

export const PROVIDER_AVATARS = {
  anthropic: Anthropic.Avatar,
  openai: OpenAI.Avatar,
  google: Gemini.Avatar,
  groq: Groq.Avatar,
  openrouter: OpenRouter.Avatar,
  ollama: Ollama.Avatar,
} satisfies Record<ProviderId, unknown>

/**
 * The plain monochrome glyphs (the compound root components render the bare
 * mark, `currentColor`-tinted). The share-card canvas uses these instead of
 * the Avatars: the Avatar variants carry their branded backgrounds in CSS
 * classes that `renderToStaticMarkup` can't inline — OpenAI's white-on-black
 * mark rasterizes to white-on-nothing and vanishes on a white card. A mono
 * glyph on a drawn disc is deterministic everywhere (and matches the app's
 * monochrome brand).
 */
export const PROVIDER_GLYPHS = {
  anthropic: Anthropic,
  openai: OpenAI,
  google: Gemini,
  groq: Groq,
  openrouter: OpenRouter,
  ollama: Ollama,
} satisfies Record<ProviderId, unknown>
