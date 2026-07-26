import type { SharedV3ProviderOptions } from '@ai-sdk/provider'
import type { ModelEntry } from '@/models/registry'
import type { ReasoningEffort } from '@/types/council'

/**
 * Translate the generic thinking dial (`'off' | 'low' | 'medium' | 'high' |
 * 'max'`, later widened) into the provider-specific
 * `providerOptions` shape AI SDK 6 expects. One semantic scale — "how much
 * deliberation is the user paying for" — with two invariant rules:
 *
 *  - **Nearest legal value, never exceeding what the user picked.** `max`
 *    clamps *down* to a model's top rung (OpenAI `xhigh`, Groq `high`);
 *    `off` clamps *up* only on `thinkingAlwaysOn` models (Fable 5, Pro-tier
 *    Gemini), where no cheaper state legally exists.
 *  - **`off` is a rung, not a separate toggle.** Most providers encode
 *    on/off inside the same scale (OpenAI `'none'`, Gemini budget `0`), so a
 *    standalone boolean would be a fake affordance on most seats.
 *
 * Returns `undefined` when:
 *  - the effort is not set (caller cascade to provider default), or
 *  - the model doesn't advertise reasoning support (defending against
 *    a stored seat config whose model was later swapped to a
 *    non-reasoning entry), or
 *  - the provider has no addressable reasoning surface (Ollama /
 *    OpenRouter fall through silently), or
 *  - the rung already *is* the provider's no-request state (`off` on
 *    budget-shaped Anthropic, where omitting the block is "off").
 *
 * The token numbers for the budget-shaped surfaces (pre-adaptive Anthropic,
 * Google) are tuned to land sensibly across price points — small enough that
 * "low" doesn't double an answer's cost, large enough that "high" gives the
 * model room to reason; "max" is a generous ceiling, not the provider's
 * absolute limit.
 */

type ActiveEffort = Exclude<ReasoningEffort, 'off'>

const ANTHROPIC_BUDGET_TOKENS: Record<ActiveEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
  max: 32768,
}

const GOOGLE_BUDGET_TOKENS: Record<ActiveEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
  max: 24576,
}

/** Pro-tier Gemini rejects `thinkingBudget: 0` (thinking can't be off) —
 *  `off` clamps to this floor instead of erroring. */
const GOOGLE_MIN_THINKING_BUDGET = 128

export function buildReasoningProviderOptions(
  entry: ModelEntry,
  effort: ReasoningEffort | undefined,
): SharedV3ProviderOptions | undefined {
  if (!entry.capabilities.reasoning) return undefined
  // No armed rung → don't touch thinking *behaviour*, but still opt into
  // *visibility* where that's a pure display flag (live thinking strip).
  if (!effort) return displayOnlyReasoningOptions(entry)
  switch (entry.provider) {
    case 'anthropic':
      // Pre-adaptive models (Claude 4.5 and older, flagged `thinkingApi:
      // 'budget'`, e.g. Haiku 4.5): the legacy `{type:'enabled',
      // budget_tokens}` shape; omitting the block entirely *is* "off".
      // Their thinking text streams as-is — no display flag exists or is
      // needed.
      if (entry.thinkingApi === 'budget') {
        if (effort === 'off') return undefined
        return {
          anthropic: {
            thinking: {
              type: 'enabled',
              budgetTokens: ANTHROPIC_BUDGET_TOKENS[effort],
            },
          },
        }
      }
      // Claude 4.6+ (adaptive family): the legacy shape is *rejected* with a
      // 400 on Opus 4.8 / 4.7 / Sonnet 5 / Fable 5 — send adaptive thinking
      // plus an `effort` level (→ `output_config.effort`). The generic rungs
      // map 1:1 (`max` → Anthropic's native `max`); Anthropic's extra
      // `xhigh` step is deliberately unexposed — a sixth rung users can't
      // meaningfully rank against `max` across a mixed council.
      // `display:'summarized'` opts into the readable reasoning summary the
      // thinking strip streams — the default (`omitted`) sends thinking
      // blocks with *empty* text. Display is visibility-only: thinking is
      // billed identically either way.
      if (effort === 'off') {
        // Fable 5 400s on `disabled` — clamp to its cheapest legal state.
        return entry.thinkingAlwaysOn
          ? {
              anthropic: {
                thinking: { type: 'adaptive', display: 'summarized' },
                effort: 'low',
              },
            }
          : { anthropic: { thinking: { type: 'disabled' } } }
      }
      return {
        anthropic: {
          thinking: { type: 'adaptive', display: 'summarized' },
          effort,
        },
      }
    case 'openai':
      // GPT-5.x has no separate thinking toggle — `reasoningEffort` *is* the
      // dial, with `'none'` as off and `'xhigh'` as its top ("max" clamps
      // down to it; OpenAI has no `'max'`). `reasoningSummary` streams the
      // readable summary (raw reasoning is encrypted) — skipped for 'none',
      // where there is nothing to summarize.
      if (effort === 'off') {
        return { openai: { reasoningEffort: 'none' } }
      }
      return {
        openai: {
          reasoningEffort: effort === 'max' ? 'xhigh' : effort,
          reasoningSummary: 'auto',
        },
      }
    case 'google':
      // Gemini's dial is a token budget: 0 = off (except Pro tiers, which
      // reject 0 — clamped to a minimal budget), bigger = harder thinking.
      // `includeThoughts` streams the thought summaries whenever thinking
      // can actually happen (any non-zero budget).
      if (effort === 'off' && !entry.thinkingAlwaysOn) {
        return { google: { thinkingConfig: { thinkingBudget: 0 } } }
      }
      return {
        google: {
          thinkingConfig: {
            thinkingBudget:
              effort === 'off'
                ? GOOGLE_MIN_THINKING_BUDGET
                : GOOGLE_BUDGET_TOKENS[effort],
            includeThoughts: true,
          },
        },
      }
    case 'groq':
      // Groq's OpenAI-compatible reasoning surface (gpt-oss models):
      // `'none'` = off, `'high'` is its top — "max" clamps down.
      // `reasoningFormat:'parsed'` surfaces the raw reasoning as stream
      // parts instead of leaving it inline/hidden.
      if (effort === 'off') {
        return { groq: { reasoningEffort: 'none' } }
      }
      return {
        groq: {
          reasoningEffort: effort === 'max' ? 'high' : effort,
          reasoningFormat: 'parsed',
        },
      }
    default:
      // Ollama / OpenRouter don't expose a uniform reasoning surface in
      // AI SDK 6 yet; leaving providerOptions unset means the model runs
      // at its default behaviour.
      return undefined
  }
}

/**
 * Visibility-only reasoning options for the *Default* (no armed rung)
 * state. Strict rule: a flag qualifies only when it **cannot change what
 * the model does or bills** — it merely makes thinking that would happen
 * anyway visible to the live strip. That's why Anthropic's adaptive family
 * is mostly absent: sending `thinking:{type:'adaptive'}` just to carry
 * `display` would *turn thinking on* for a default-off model (Opus 4.8).
 * The one exception is `thinkingAlwaysOn` (Fable 5), where explicit
 * adaptive is byte-for-byte the state it already runs in. Known gap,
 * accepted: Opus 5 and Sonnet 5 under Default think adaptively but
 * invisibly — we have no registry signal separating "defaults to adaptive"
 * from "defaults to off", and guessing risks billing surprises. That gap
 * now sits on the *default seat* (Opus 5 leads the Anthropic group), so
 * it's the obvious next thing to fix: a `thinksByDefault` registry flag
 * would let Default carry `display` for exactly the models that were going
 * to think anyway.
 */
function displayOnlyReasoningOptions(
  entry: ModelEntry,
): SharedV3ProviderOptions | undefined {
  switch (entry.provider) {
    case 'anthropic':
      return entry.thinkingAlwaysOn
        ? {
            anthropic: {
              thinking: { type: 'adaptive', display: 'summarized' },
            },
          }
        : undefined
    case 'openai':
      // Summary visibility only — effort stays whatever the model defaults to.
      return { openai: { reasoningSummary: 'auto' } }
    case 'google':
      // Thought visibility only — the budget stays the provider's dynamic
      // default.
      return { google: { thinkingConfig: { includeThoughts: true } } }
    case 'groq':
      return { groq: { reasoningFormat: 'parsed' } }
    default:
      return undefined
  }
}

/** 32768 → "32k" — budgets are our own power-of-two constants, so binary-k
 *  labels stay exact where `formatTokenCount`'s ÷1000 would show "33K". */
function budgetLabel(tokens: number): string {
  return `~${Math.round(tokens / 1024)}k thinking tokens`
}

/**
 * Human one-liner for the thinking disclosures (seat-config caption + the
 * composer brain popover's per-seat list): what the chosen rung *actually
 * becomes* on this seat's model. Lives beside the mapping above so the copy
 * and the payload can't drift. Mechanism-as-fact wording per the copy rules
 * — states what is sent, promises nothing about the answer.
 */
export function describeReasoningResolution(
  entry: ModelEntry,
  effort: ReasoningEffort | undefined,
): string {
  if (!entry.capabilities.reasoning) return 'no thinking control'
  if (!effort) return 'provider default'
  switch (entry.provider) {
    case 'anthropic':
      if (entry.thinkingApi === 'budget') {
        return effort === 'off'
          ? 'thinking off'
          : budgetLabel(ANTHROPIC_BUDGET_TOKENS[effort])
      }
      if (effort === 'off') {
        return entry.thinkingAlwaysOn
          ? 'always thinks — low effort'
          : 'thinking off'
      }
      return `${effort} effort`
    case 'openai':
      if (effort === 'off') return 'thinking off'
      return effort === 'max' ? 'extra-high effort' : `${effort} effort`
    case 'google':
      if (effort === 'off') {
        return entry.thinkingAlwaysOn
          ? 'always thinks — minimal budget'
          : 'thinking off'
      }
      return budgetLabel(GOOGLE_BUDGET_TOKENS[effort])
    case 'groq':
      if (effort === 'off') return 'thinking off'
      return effort === 'max' ? 'high effort (its top)' : `${effort} effort`
    default:
      return 'no thinking control'
  }
}
