// Regenerates `src/models/registry.generated.ts` — the OpenRouter slice of
// the model catalog — from OpenRouter's public `/api/v1/models` endpoint.
//
//   npm run update-models-catalog
//
// Why a build-time script (not a runtime fetch): the app is a static,
// offline-capable bundle with no backend. We snapshot the catalog into a
// committed `.ts` file so the browser never has to fetch it (and we avoid the
// native providers' CORS / key-required `/models` endpoints — OpenRouter's is
// public and CORS-free). Re-run whenever you want to refresh.
//
// What it CAN'T do automatically: `country` / `developer` / `tier` aren't in
// any provider API — they're editorial. We supply `country`/`developer` from
// VENDOR_META below, and derive a coarse `tier` from pricing. Capabilities
// (vision/tools/reasoning) and context come from OpenRouter's metadata.
//
// Curation: only ids in ALLOWED_OPENROUTER_MODEL_IDS are emitted (a 343-model dropdown is unusable).
// The script also prints "discovered" models from tracked vendors that aren't
// in ALLOWED_OPENROUTER_MODEL_IDS yet — that's your nudge when, e.g., a new Opus ships. Add the id to
// ALLOWED_OPENROUTER_MODEL_IDS and re-run.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENDPOINT = 'https://openrouter.ai/api/v1/models'
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'models',
  'registry.generated.ts',
)

// Vendor id-prefix → the editorial metadata OpenRouter doesn't provide. Also
// the set of vendors we watch for "discovered" (new) models.
const VENDOR_META = {
  anthropic: { developer: 'Anthropic', country: 'USA' },
  openai: { developer: 'OpenAI', country: 'USA' },
  google: { developer: 'Google', country: 'USA' },
  'meta-llama': { developer: 'Meta', country: 'USA' },
  'x-ai': { developer: 'xAI', country: 'USA' },
  deepseek: { developer: 'DeepSeek', country: 'China' },
  qwen: { developer: 'Alibaba', country: 'China' },
  moonshotai: { developer: 'Moonshot AI', country: 'China' },
  mistralai: { developer: 'Mistral AI', country: 'France' },
  cohere: { developer: 'Cohere', country: 'Canada' },
}

// Curated allow-list — which OpenRouter models surface in the picker. Keep it
// vendor-diverse; native-routed providers (Anthropic/OpenAI/Google/Groq) stay
// in registry.ts, so prefer vendors we DON'T cover natively here.
// One current flagship per vendor: grok-4.3→4.5,
// deepseek chat+r1→v4-pro, qwen 2.5→3.7-max, mistral-large→-2512, +kimi.
const ALLOWED_OPENROUTER_MODEL_IDS = [
  'deepseek/deepseek-v4-pro',
  'qwen/qwen3.7-max',
  'moonshotai/kimi-k2.6',
  'mistralai/mistral-large-2512',
  'x-ai/grok-4.5',
  'cohere/command-a',
]

const vendorOf = (id) => id.split('/')[0]

// Single-quoted TS string literal (matches the codebase + keeps the generated
// file lint-clean). This script writes *source code* from API data, so every
// interpolated value must be inert: strings go through here (quote/backslash/
// newline-escaped so a crafted model name can neither break out of the
// literal nor break the build), numbers through `int()` below.
const q = (s) =>
  `'${String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n|[\u2028\u2029]/g, '\\n')}'`

// Coerce an API-sourced value to a safe non-negative integer literal — a
// string here would otherwise be interpolated raw into the generated TS
// (i.e. code injection from a compromised catalog response).
const int = (v) => {
  const n = Math.trunc(Number(v))
  // Clamp to a sane ceiling too — a context window is at most a few
  // million tokens; anything wilder is a bogus catalog value.
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 100_000_000) : 0
}

// Keep OpenRouter's full "Vendor: Model" name — the picker shows the
// *OpenRouter* logo (not the vendor's), so the label has to carry the vendor.
const cleanLabel = (name) => name.replace(': ', ' ')

function toEntry(m) {
  const meta = VENDOR_META[vendorOf(m.id)] ?? {
    developer: vendorOf(m.id),
    country: 'Unknown',
  }
  const inputs = m.architecture?.input_modalities ?? []
  const params = m.supported_parameters ?? []
  return {
    modelId: `openrouter:${m.id}`,
    label: cleanLabel(m.name ?? m.id),
    provider: 'openrouter',
    providerModelId: m.id,
    tier: Number(m.pricing?.prompt ?? '0') === 0 ? 'free' : 'paid',
    country: meta.country,
    developer: meta.developer,
    contextWindow: int(m.context_length ?? m.top_provider?.context_length),
    capabilities: {
      tools: params.includes('tools'),
      vision: inputs.includes('image'),
      reasoning:
        params.includes('reasoning') || params.includes('include_reasoning'),
    },
  }
}

const res = await fetch(ENDPOINT)
if (!res.ok) {
  console.error(`✖ OpenRouter ${ENDPOINT} → ${res.status}`)
  process.exit(1)
}
const { data } = await res.json()
const byId = new Map(data.map((m) => [m.id, m]))

const entries = []
const missing = []
for (const id of ALLOWED_OPENROUTER_MODEL_IDS) {
  const m = byId.get(id)
  if (m) entries.push(toEntry(m))
  else missing.push(id)
}
entries.sort((a, b) => a.label.localeCompare(b.label))

const discovered = data
  .map((m) => m.id)
  .filter((id) => VENDOR_META[vendorOf(id)] && !ALLOWED_OPENROUTER_MODEL_IDS.includes(id))
  .sort()

const body = entries
  .map(
    (e) => `  {
    modelId: ${q(e.modelId)},
    label: ${q(e.label)},
    provider: 'openrouter',
    providerModelId: ${q(e.providerModelId)},
    tier: ${q(e.tier)},
    country: ${q(e.country)},
    developer: ${q(e.developer)},
    contextWindow: ${e.contextWindow},
    capabilities: { tools: ${e.capabilities.tools}, vision: ${e.capabilities.vision}, reasoning: ${e.capabilities.reasoning} },
  },`,
  )
  .join('\n')

const file = `// AUTO-GENERATED by \`npm run update-models-catalog\` — do not edit by hand.
// Source: OpenRouter ${ENDPOINT}. The native (direct-routed) providers live in
// registry.ts; this file is only the curated OpenRouter slice. \`registry.ts\`
// spreads these in and adds \`defaultSystemPrompt\`.

import type { ModelEntry } from './registry'

export const OPENROUTER_MODELS: Omit<ModelEntry, 'defaultSystemPrompt'>[] = [
${body}
]
`

writeFileSync(OUT, file)
console.log(`✓ wrote ${entries.length} OpenRouter models → ${OUT}`)
if (missing.length)
  console.warn(`⚠ listed but not in OpenRouter's catalog (drop or fix):\n   ${missing.join('\n   ')}`)
if (discovered.length)
  console.log(
    `ℹ ${discovered.length} more models from tracked vendors — add any to ALLOWED_OPENROUTER_MODEL_IDS to include:\n   ${discovered.slice(0, 30).join('\n   ')}${discovered.length > 30 ? '\n   …' : ''}`,
  )
