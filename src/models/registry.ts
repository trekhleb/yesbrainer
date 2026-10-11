import { OPENROUTER_MODELS } from '@/models/registry.generated'

type ModelTier = 'local' | 'free' | 'paid'

/** Single runtime source for the provider union — `ProviderId` derives
 *  from it, and every per-provider map (`displayName`, avatars, key
 *  fields, API origins) is `satisfies Record<ProviderId, …>`-checked, so
 *  adding an entry here forces each of them at compile time. */
export const PROVIDER_IDS = [
  'ollama',
  'anthropic',
  'openai',
  'google',
  'groq',
  'openrouter',
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

interface ModelCapabilities {
  tools: boolean
  vision: boolean
  reasoning: boolean
}

export interface ModelEntry {
  modelId: string
  label: string
  provider: ProviderId
  providerModelId: string
  /** Anthropic thinking-API shape. Omit (→ adaptive) for Claude 4.6+
   *  (`thinking:{type:'adaptive'}` + effort); `'budget'` for pre-adaptive
   *  models (Claude 4.5 and older, e.g. Haiku 4.5) that still take the legacy
   *  `{type:'enabled', budget_tokens}` shape. Ignored for non-Anthropic. */
  thinkingApi?: 'adaptive' | 'budget'
  /** The model cannot turn thinking off (Fable 5 / 5.1 and Opus 5.5 400 on
   *  `disabled`, GPT-6 Astra and 6.1 Sol 400 on effort `none`, Pro-tier and
   *  3.7+ Flash Gemini reject thinking off). The user's `off` clamps *up* to
   *  the model's
   *  cheapest legal state instead of erroring — `providers/reasoning.ts`
   *  owns the clamp, the thinking UI disclosures read this flag to say
   *  "always thinks". Note it tracks "can't be turned off", not "is on by
   *  default": Sonnet 5.5 / Haiku 5.5 think adaptively by default but still
   *  accept `disabled`, so they carry no flag. */
  thinkingAlwaysOn?: boolean
  /** This provider's most powerful model — the one the "Smartest available"
   *  roster preset seats (`pickSmartestModelIds`). Exactly one per native
   *  provider (guarded by a registry unit test); explicitly independent of
   *  registry order, which stays the *default-seat* / picker order (e.g.
   *  Anthropic: Opus 5.5 is the sane zero-config default, but the flag sits
   *  on Fable 5.1 — clicking the preset is the explicit max-power request). */
  smartest?: boolean
  /** Superseded model kept for history instead of being deleted. The update
   *  workflow is *add the new entry + flag the old one* — never remove:
   *  persisted councils that seat it keep their real label, logo, and
   *  capabilities (deleting would degrade them to the all-capabilities-off
   *  `getModel` stub). Deprecated entries are hidden from the New-council
   *  picker and skipped by the default-seat / "Smartest available" selectors,
   *  but `getModel` still resolves them and calls still go through (deprecated
   *  ≠ retired upstream). */
  deprecated?: boolean
  tier: ModelTier
  country: string
  developer: string
  contextWindow: number
  capabilities: ModelCapabilities
  defaultSystemPrompt: string
}

/**
 * Built-in fallback for every model's `defaultSystemPrompt`. Bottom of the
 * three-tier cascade: per-seat override → user default (Settings → Prompts,
 * "Participant default system prompt") → this constant. Edit through the UI
 * — touching this constant only matters when both higher tiers are empty.
 */
export const DEFAULT_PARTICIPANT_PROMPT =
  'You are a council Participant. Answer the user thoughtfully and concisely.'

/**
 * Updating this hand-maintained native catalog: when a provider ships a new
 * flagship or retires a model, get the current lineup, the exact
 * `providerModelId` strings, context windows, and capabilities from the
 * provider's official model list — the docs page (human-readable: flagships,
 * context, pricing), or the live `/models` API (machine-readable exact ids):
 *
 *   Anthropic  https://platform.claude.com/docs/en/about-claude/models/overview
 *              live: GET https://api.anthropic.com/v1/models
 *   OpenAI     https://developers.openai.com/api/docs/models
 *              live: GET https://api.openai.com/v1/models
 *   Google     https://ai.google.dev/gemini-api/docs/models
 *              live: GET https://generativelanguage.googleapis.com/v1beta/models
 *   Groq       https://console.groq.com/docs/models
 *              live: GET https://api.groq.com/openai/v1/models
 *   Ollama     https://ollama.com/library   (installed local tags: `ollama list`)
 *
 * `providerModelId` is derived from `modelId` (its `provider:` prefix stripped)
 * by default — set it in an entry only when the wire id differs (dated
 * snapshots like Haiku's `-20251001`, vendor suffixes like Llama's
 * `-versatile`); a wrong override 404s at call time. `country` / `developer` /
 * `tier` are editorial (no API returns them).
 * Superseded models are NOT deleted — add the successor entry and set
 * `deprecated: true` on the old one (keeps persisted councils' metadata
 * intact; see the `deprecated` field doc). If the new model is the
 * provider's most powerful, move the provider's single `smartest` flag to
 * it. After editing, keep the other model-id references in sync — the
 * `NativeModelId`-typed ones (`DEFAULT_MODEL_ID` below,
 * `TITLE_GENERATOR_CHAIN` in `storage/behavior.ts`, the test fixtures'
 * `MODEL_A/B/C`) surface as typecheck errors; the demo-council JSONs are
 * covered by a guard test. The OpenRouter slice is generated separately by
 * `npm run update-models-catalog`.
 */

/**
 * Source shape for the hand-written native entries below. `providerModelId`
 * is optional here: it defaults to `modelId` with its `provider:` prefix
 * stripped when the registry is assembled (`stripModelIdPrefix`), so a version
 * bump edits `modelId` alone and the wire id follows — spell `providerModelId`
 * out only when it genuinely differs (Haiku's dated snapshot, Llama's
 * `-versatile` suffix).
 */
type NativeModelSource = Omit<ModelEntry, 'providerModelId'> & {
  providerModelId?: string
}

/** `modelId` ("provider:rest") → the bare `rest` string sent to the provider. */
function stripModelIdPrefix(modelId: string): string {
  const sep = modelId.indexOf(':')
  return sep > 0 ? modelId.slice(sep + 1) : modelId
}

const NATIVE_MODELS = [
  /* ---------- Ollama (local) -------------- */
  {
    // Gemma 4 leads the local group: Google's open-weight model with tools,
    // vision, and thinking — the strongest of the popular tool-capable
    // Ollama tags (`gemma4` = the e4b tag, ~9.6 GB). Ollama is the user's
    // own install, so these entries are default suggestions, not a list of
    // what's pulled. `contextWindow` is deliberately NOT the tag's
    // advertised 128K: Ollama serves every model at its *server-side*
    // context length (4096 by default, `OLLAMA_CONTEXT_LENGTH` raises it),
    // so the context meter keeps the same conservative figure as Llama
    // below rather than under-reporting until history silently truncates.
    modelId: 'ollama:gemma4',
    smartest: true,
    label: 'Gemma 4',
    provider: 'ollama',
    tier: 'local',
    country: 'USA',
    developer: 'Google',
    contextWindow: 8192,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Kept live (not deprecated) as the small budget seat and the Ollama
    // rung of `TITLE_GENERATOR_CHAIN` (`storage/behavior.ts`).
    modelId: 'ollama:llama3.1',
    label: 'Llama 3.1 8B',
    provider: 'ollama',
    tier: 'local',
    country: 'USA',
    developer: 'Meta',
    contextWindow: 8192,
    capabilities: { tools: true, vision: false, reasoning: false },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },

  /* ---------- Anthropic -------------- */
  {
    // Opus leads the Anthropic group deliberately: it's the first reachable
    // model `firstUsableModelId` returns for an Anthropic-key user, so it
    // becomes the default seat / solo-chat / Judge / Mediator model. We keep
    // Opus (not the pricier, refusal-prone Fable 5.1 below) as the zero-config
    // flagship this high-stakes-decisions app wants out of the box — a sane
    // cost/capability default. (The 2-seat floor still seeds the second seat
    // from a *different* provider.) Fable 5.1 is an opt-in max-power option;
    // Sonnet 5.5 is the cheaper workhorse.
    //
    // Opus 5.5 supersedes Opus 5 at a *lower* price ($4/$20 vs $5/$25), so
    // there's no cost/capability tradeoff to weigh — it simply replaces it as
    // the default. One breaking change the thinking dial depends on: thinking
    // can no longer be turned off at all (`thinking:{type:'disabled'}` 400s),
    // hence `thinkingAlwaysOn` — Opus 5 still accepted `disabled`. Two other
    // 5.5 breaking changes are harmless here: forced `tool_choice` errors
    // (every call leaves tool choice at `auto`), and text between tool calls
    // now arrives in `thinking` blocks whose text is empty at the default
    // `display` — we always send `display:'summarized'`.
    modelId: 'anthropic:claude-opus-5-5',
    label: 'Claude Opus 5.5',
    provider: 'anthropic',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by Opus 5.5 above — strictly pricier ($5/$25) for less
    // capability. Still served (Anthropic lists it as legacy, retirement not
    // before 2027-07-24); kept listed rather than deleted so councils
    // persisted while it was the default keep their real label, logo, and
    // capabilities instead of degrading to the `getModel` stub.
    modelId: 'anthropic:claude-opus-5',
    deprecated: true,
    label: 'Claude Opus 5',
    provider: 'anthropic',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by Opus 5 (itself superseded by Opus 5.5 above). Kept
    // listed because the recorded demo councils seat it.
    modelId: 'anthropic:claude-opus-4-8',
    deprecated: true,
    label: 'Claude Opus 4.8',
    provider: 'anthropic',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Anthropic's most capable widely-released model — offered opt-in and
    // kept *below* Opus so it's not the zero-config default: it's
    // premium-priced (2.5x Opus 5.5), runs always-on thinking, and its
    // safety classifiers can refuse benign-adjacent prompts (this app wires
    // no fallback). It also requires 30-day data retention, so a
    // zero-retention org gets a 400. Anthropic's own guidance is to reach
    // for it on demanding reasoning and long-horizon agentic work, or when
    // Opus 5.5 at higher effort still falls short — i.e. pick it when you
    // explicitly want maximum capability. Shares Opus 5.5's forced
    // `tool_choice` 400 (harmless here, tool choice stays `auto`).
    modelId: 'anthropic:claude-fable-5-1',
    smartest: true,
    label: 'Claude Fable 5.1',
    provider: 'anthropic',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by Fable 5.1 above. Still served (Anthropic lists it as
    // legacy, retirement not before mid-2027); kept listed because the
    // recorded demo councils seat it.
    modelId: 'anthropic:claude-fable-5',
    deprecated: true,
    label: 'Claude Fable 5',
    provider: 'anthropic',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // The cheaper workhorse, and `DEFAULT_MODEL_ID` below. Sonnet 5.5
    // replaces Sonnet 5 at the same $2/$10. Adaptive thinking but *not*
    // always-on (unlike Opus 5.5 / Fable 5.1), so `off` genuinely disables
    // thinking here — no `thinkingAlwaysOn`.
    modelId: 'anthropic:claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by Sonnet 5.5 above (same price). Still served — legacy,
    // retirement not before 2027-06-30.
    modelId: 'anthropic:claude-sonnet-5',
    deprecated: true,
    label: 'Claude Sonnet 5',
    provider: 'anthropic',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // The cheap Anthropic tier and the Anthropic rung of
    // `TITLE_GENERATOR_CHAIN` (`storage/behavior.ts`) — keep that chain
    // pointed here, not at the retiring Haiku 4.5 below. Haiku 5.5 is a
    // generational jump, not a version bump: 1M context (4.5 had 200K) at a
    // tenth of the price (from $0.10/$0.50 vs $1/$5), and it moved to the
    // *adaptive* thinking API — so deliberately NO `thinkingApi: 'budget'`
    // here. It also uses the 4.7-era tokenizer, so the same text counts
    // ~30% more tokens than on 4.5 (immaterial to the chars/4 context
    // meter, and the window grew 5x).
    modelId: 'anthropic:claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    provider: 'anthropic',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by Haiku 5.5 above, and the nearest retirement on
    // Anthropic's board: its window opens 2026-10-15 (every other listed
    // model is 2027). Hidden from pickers but still resolvable — Anthropic
    // gives 60 days' notice before an actual shutdown, and a persisted
    // council seating it must keep its real label and capabilities. The last
    // entry anywhere in the catalog on the legacy `{type:'enabled',
    // budget_tokens}` thinking shape (`thinkingApi: 'budget'`).
    modelId: 'anthropic:claude-haiku-4-5',
    deprecated: true,
    label: 'Claude Haiku 4.5',
    provider: 'anthropic',
    providerModelId: 'claude-haiku-4-5-20251001',
    thinkingApi: 'budget',
    tier: 'paid',
    country: 'USA',
    developer: 'Anthropic',
    contextWindow: 200_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },

  /* ---------- OpenAI -------------- */
  {
    // Sol leads the OpenAI group as the zero-config default seat: the middle
    // rung of the current GPT-6 generation (~1.05M context) at a fifth of
    // Astra's price — the same cost/capability call as Opus leading
    // Anthropic while Fable carries `smartest`. OpenAI ships the generation
    // as three named tiers rather than one model: Astra, Sol, and Luna (no
    // Terra this time); 6.1 Sol is the current Sol, at the same $2/$10 as
    // the 6.0 Sol it replaced.
    //
    // `thinkingAlwaysOn`: 6.1 Sol accepts `low`…`max` but rejects BOTH
    // `none` and `minimal`, so the user's `off` clamps up to `low` instead
    // of 400ing — the same shape as Astra below. Its top rung is `max`,
    // which the installed `@ai-sdk/openai` doesn't type yet, so `max` clamps
    // down to `xhigh` until the provider package is bumped (see
    // `providers/reasoning.ts`).
    //
    // No `-pro` entries: OpenAI's models page documents no Pro tier at all
    // (the `gpt-6-astra-pro` id OpenRouter serves is Astra run with
    // `reasoning.mode: pro`, and reads as a ChatGPT seat entitlement rather
    // than a model card), and the 5.5/5.6 pro tiers did not support
    // streaming — every participant seat here streams. Re-check if OpenAI
    // ever documents a streaming pro model.
    modelId: 'openai:gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    provider: 'openai',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_050_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // GPT-6 Astra — OpenAI's most capable model, hence the `smartest` flag,
    // but kept *below* Sol so it's not the default seat: 5x Sol's price
    // ($10/$50 vs $2/$10 per MTok, plus a pricier long-context tier beyond
    // the standard window). Same two thinking-dial quirks as Sol above:
    // effort `none` returns a 400 (and `minimal` isn't offered), so
    // `thinkingAlwaysOn` clamps the user's `off` up to `low`; and `max`
    // clamps down to `xhigh` until `@ai-sdk/openai` types it.
    modelId: 'openai:gpt-6-astra',
    smartest: true,
    label: 'GPT-6 Astra',
    provider: 'openai',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_050_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // The budget seat, and the OpenAI rung of `TITLE_GENERATOR_CHAIN`
    // (`storage/behavior.ts`) — keep that chain pointed here, not at the
    // superseded 5.4 nano below: Luna is cheaper ($0.10/$0.50 vs
    // $0.20/$1.25) at 2.6x the context. It's also the only model in the
    // generation that still accepts effort `none`, so it deliberately
    // carries no `thinkingAlwaysOn` — "off" really is off on this seat.
    modelId: 'openai:gpt-6-luna',
    label: 'GPT-6 Luna',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_050_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by GPT-6.1 Sol above (same $2/$10 price point). The whole
    // GPT-5.6 tier came off OpenAI's models page with the GPT-6 generation;
    // still served, so a persisted council seating it keeps working.
    modelId: 'openai:gpt-5.6-sol',
    deprecated: true,
    label: 'GPT-5.6 Sol',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by the GPT-6 tier — which has no Terra rung, so the
    // nearest live equivalent is 6.1 Sol above.
    modelId: 'openai:gpt-5.6-terra',
    deprecated: true,
    label: 'GPT-5.6 Terra',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by GPT-6 Luna above (same rung, a generation on).
    modelId: 'openai:gpt-5.6-luna',
    deprecated: true,
    label: 'GPT-5.6 Luna',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by the GPT-5.6 tier, itself superseded by GPT-6 above;
    // kept listed (see the `deprecated` field doc) because the recorded
    // demo councils seat it.
    modelId: 'openai:gpt-5.5',
    deprecated: true,
    label: 'GPT-5.5',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by GPT-5.6 Terra, itself superseded by GPT-6. GPT-5.4
    // context windows are best-effort (GPT-5-class ~400K; OpenAI's docs
    // don't publish an exact figure for the 5.4 tier) — refine if needed.
    modelId: 'openai:gpt-5.4',
    deprecated: true,
    label: 'GPT-5.4',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 400_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by GPT-6 Luna above, which is both cheaper and much
    // longer-context — the 5.4 mini/nano pair no longer covers a price
    // point the current generation leaves open.
    modelId: 'openai:gpt-5.4-mini',
    deprecated: true,
    label: 'GPT-5.4 mini',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 400_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // See GPT-5.4 mini above — superseded by GPT-6 Luna, which also took
    // over its `TITLE_GENERATOR_CHAIN` rung.
    modelId: 'openai:gpt-5.4-nano',
    deprecated: true,
    label: 'GPT-5.4 nano',
    provider: 'openai',
    tier: 'paid',
    country: 'USA',
    developer: 'OpenAI',
    contextWindow: 400_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },

  /* ---------- Google -------------- */
  {
    // Leads the Google group as the *default* seat: newer than 3.1 Pro
    // (Google's versioning is non-linear), GA/stable (Sept 2026), and the
    // current top of the Flash line — one current Flash listed, as before
    // (3.7 Flash from August is the same price and still supported, but
    // adds nothing a picker needs). NOT the `smartest` pick though — 3.1 Pro
    // (below) wins the deep-reasoning benchmarks this app's deliberation
    // workload leans on, so the explicit flag sits there.
    //
    // Unlike 3.6, the 3.7+ Flash models reject the `minimal` thinking level
    // and can't turn thinking off — hence `thinkingAlwaysOn`, so the user's
    // `off` clamps to the minimal budget instead of erroring. Google also
    // notes 3.8 "can use more tokens on longer running and complex tasks,
    // by design" — a lower rung is the lever for everyday questions.
    modelId: 'google:gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'google',
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by 3.8 Flash above. Still stable upstream with no shutdown
    // date, so councils seating it keep working.
    modelId: 'google:gemini-3.6-flash',
    deprecated: true,
    label: 'Gemini 3.6 Flash',
    provider: 'google',
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by 3.6 Flash (itself superseded by 3.8 above).
    modelId: 'google:gemini-3.5-flash',
    deprecated: true,
    label: 'Gemini 3.5 Flash',
    provider: 'google',
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // `smartest`: the current benchmark split is real — the Flash line wins
    // most agentic/coding benchmarks, but 3.1 Pro wins *deep reasoning*
    // (Humanity's Last Exam, ARC-AGI-2, long-context retrieval), which is
    // what council deliberation actually leans on. Caveat: still PREVIEW —
    // the callable id carries the `-preview` suffix (no stable
    // `gemini-3.1-pro` yet, and no newer Pro at all), and preview ids rotate
    // / get discontinued with little notice: Google has since shut down both
    // gemini-3.1-flash-lite-preview AND gemini-3-pro-preview, so a Pro
    // preview going away is precedent, not a hypothetical. If this seat
    // starts erroring, swap to the GA id — or move `smartest` to the GA
    // Flash.
    modelId: 'google:gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    provider: 'google',
    smartest: true,
    thinkingAlwaysOn: true,
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // The cheap tier, and the Google rung of `TITLE_GENERATOR_CHAIN`
    // (`storage/behavior.ts`) — keep that chain pointed here, not at the
    // superseded 3.1 below.
    modelId: 'google:gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    provider: 'google',
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Superseded by 3.5 Flash-Lite above.
    modelId: 'google:gemini-3.1-flash-lite',
    deprecated: true,
    label: 'Gemini 3.1 Flash-Lite',
    provider: 'google',
    tier: 'paid',
    country: 'USA',
    developer: 'Google',
    contextWindow: 1_000_000,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },

  /* ---------- Groq ---------- */
  {
    // GPT-OSS 120B leads the Groq (free-tier) group: OpenAI's open-weight
    // model served on Groq — the strongest open reasoning model here (tools +
    // reasoning). Replaced DeepSeek R1 Distill 70B, which Groq dropped from
    // production.
    modelId: 'groq:openai/gpt-oss-120b',
    smartest: true,
    label: 'GPT-OSS 120B (Groq)',
    provider: 'groq',
    tier: 'free',
    country: 'USA',
    developer: 'OpenAI · Groq',
    contextWindow: 131_072,
    capabilities: { tools: true, vision: false, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Groq's own named replacement for the retired Llama 3.1 8B Instant
    // (production tier; the 120B's smaller sibling — tools + reasoning,
    // text only, same `low`/`medium`/`high` effort dial).
    modelId: 'groq:openai/gpt-oss-20b',
    label: 'GPT-OSS 20B (Groq)',
    provider: 'groq',
    tier: 'free',
    country: 'USA',
    developer: 'OpenAI · Groq',
    contextWindow: 131_072,
    capabilities: { tools: true, vision: false, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // The group's non-OpenAI seat, replacing the retired Llama 3.3 70B.
    // Groq's named replacement is qwen3.6-27b, but 3.8 is the newer sibling
    // with the same preview status and capabilities (tools + vision +
    // reasoning, 16K max output) — and, decisively, its effort dial accepts
    // `none`/`low`/`medium`/`high` (3.6 only takes `none`/`default`, which
    // the Groq branch in `providers/reasoning.ts` doesn't speak). Preview
    // on Groq means "evaluation only, may be discontinued at short notice":
    // if this seat starts erroring, check the Groq models page for the
    // current Qwen id.
    modelId: 'groq:qwen/qwen3.8-27b',
    label: 'Qwen3.8 27B (Groq)',
    provider: 'groq',
    tier: 'free',
    country: 'China',
    developer: 'Alibaba · Groq',
    contextWindow: 131_072,
    capabilities: { tools: true, vision: true, reasoning: true },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // Groq shut both Llama models off for free and developer-tier keys on
    // 2026-08-16 (enterprise-only since) — a seated Llama now errors, so it
    // is hidden from pickers. Kept listed so persisted councils keep their
    // label, logo, and capabilities (the test fixtures' text-only model too).
    modelId: 'groq:llama-3.3-70b',
    deprecated: true,
    label: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    providerModelId: 'llama-3.3-70b-versatile',
    tier: 'free',
    country: 'USA',
    developer: 'Meta · Groq',
    contextWindow: 131_072,
    capabilities: { tools: true, vision: false, reasoning: false },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
  {
    // See Llama 3.3 70B above — same 2026-08-16 free-tier shutdown.
    modelId: 'groq:llama-3.1-8b-instant',
    deprecated: true,
    label: 'Llama 3.1 8B Instant (Groq)',
    provider: 'groq',
    tier: 'free',
    country: 'USA',
    developer: 'Meta · Groq',
    contextWindow: 131_072,
    capabilities: { tools: true, vision: false, reasoning: false },
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  },
] as const satisfies readonly NativeModelSource[]

/**
 * The set of native model ids, derived from `NATIVE_MODELS` above — the single
 * source of truth. Type curated model-id references against this "enum"
 * (`DEFAULT_MODEL_ID`, `TITLE_GENERATOR_CHAIN`, the test fixtures' model
 * constants), and a version bump in the array above turns every stale
 * reference into a compile error — no manual hunting. Deliberately NOT the
 * type of `ModelEntry.modelId` / `getModel()` / persisted `Seat.modelId`:
 * those accept arbitrary (unlisted, imported, historical) strings — see the
 * stub fallback below.
 */
export type NativeModelId = (typeof NATIVE_MODELS)[number]['modelId']

/**
 * Full catalog: the native (direct-routed) providers above, plus the curated
 * OpenRouter slice from `registry.generated.ts` (refresh it with
 * `npm run update-models-catalog`). The generated entries omit
 * `defaultSystemPrompt`; we add the shared default here.
 */
export const registry: ModelEntry[] = [
  ...NATIVE_MODELS.map((m: NativeModelSource) => ({
    ...m,
    // Derive the wire id from `modelId` unless the entry pins one explicitly.
    providerModelId: m.providerModelId ?? stripModelIdPrefix(m.modelId),
  })),
  ...OPENROUTER_MODELS.map((m) => ({
    ...m,
    defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
  })),
]

/**
 * Cache of fallback entries for model ids that are no longer in the
 * registry. History is roster-independent because every persisted event
 * snapshots its `modelId` — but rendering that history still needs an
 * entry, so a council persisted (or imported) while an id was listed must
 * survive the catalog dropping it. The stub is enough to render (label +
 * provider logo from the id's prefix) and to fail politely if still
 * seated: capabilities all off, and the provider adapter resolves from
 * the prefix — an unlisted-but-still-served model even keeps working.
 * Cached so repeated lookups return one stable object.
 */
const unlistedModelCache = new Map<string, ModelEntry>()

export function getModel(modelId: string): ModelEntry {
  const entry = registry.find((m) => m.modelId === modelId)
  if (entry) return entry
  let stub = unlistedModelCache.get(modelId)
  if (!stub) {
    console.warn(
      `[getModel] model id not in the registry — using a fallback entry: ${modelId}`,
    )
    const sep = modelId.indexOf(':')
    const prefix = sep > 0 ? modelId.slice(0, sep) : ''
    const rest = sep > 0 ? modelId.slice(sep + 1) : modelId
    const provider = (PROVIDER_IDS as readonly string[]).includes(prefix)
      ? (prefix as ProviderId)
      : // A prefix outside the union means the provider itself is gone —
        // there's no right brand to show; OpenRouter's hub mark is the
        // least-wrong stand-in for "some routed model".
        'openrouter'
    stub = {
      modelId,
      label: `${rest} (unlisted)`,
      provider,
      providerModelId: rest,
      tier: provider === 'ollama' ? 'local' : 'paid',
      country: '',
      developer: '',
      contextWindow: 32_000,
      capabilities: { tools: false, vision: false, reasoning: false },
      defaultSystemPrompt: DEFAULT_PARTICIPANT_PROMPT,
    }
    unlistedModelCache.set(modelId, stub)
  }
  return stub
}

/**
 * Last-resort fallback model id, used only when nothing reachable can be
 * resolved (see `firstUsableModelId`). The New-council modal prefers the
 * first *reachable* model and falls back to this purely as a greyed-out
 * seat preview. A cloud flagship, not Ollama: the local model is opt-in
 * and omitted from pickers by default, so an Ollama id here could seed a
 * seat the picker can't even display.
 */
export const DEFAULT_MODEL_ID: NativeModelId = 'anthropic:claude-sonnet-5-5'
