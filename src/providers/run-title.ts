import { generateObject } from 'ai'
import { z } from 'zod'
import { getProviderModel } from '@/providers'
import {
  getBehaviorSettings,
  TITLE_GENERATOR_CHAIN,
} from '@/storage/behavior'
import { getApiKeys, type ApiKeys } from '@/storage/keys'
import { getOllamaEnabled } from '@/storage/ollama'
import {
  applyTemplate,
  DEFAULT_TITLE_SYSTEM_PROMPT,
  DEFAULT_TITLE_TEMPLATE,
  getUserPrompts,
} from '@/storage/prompts'
import { runFailure } from '@/providers/run-support'
import { getModel, registry } from '@/models/registry'

/**
 * LLM title generator — replaces the placeholder
 * truncated-user-message fallback `appendTurn` applies.
 *
 * Three-line contract:
 *  1. `pickTitleModelId(behaviorTitleModelId, keys)` returns the first
 *     reachable model id from `[behaviorTitleModelId, ...TITLE_GENERATOR_CHAIN]`,
 *     skipping any model whose provider has no key (Ollama needs no key
 *     and counts as reachable while its opt-in toggle is on). Returns
 *     `null` when nothing in the chain is reachable; the caller falls
 *     back to the server-side truncated-user-message title.
 *  2. `runTitleGeneration` calls `generateObject` with a strict
 *     `{ title: z.string().min(3).max(60) }` schema. The model id is
 *     resolved from the chain; the system + user prompts are
 *     orchestrator-supplied so per-user prompt customisation lands
 *     without touching this file.
 *  3. Fire-and-forget at the orchestrator: errors stay local (`error`
 *     field on the result), the council just keeps its existing
 *     server-side fallback title.
 *
 * Title length is enforced both by the zod schema and by
 * `patchCouncilTitle`'s own `.slice(0, 60)` clamp on write, so a
 * misbehaving model can't write past the sidebar's budget.
 */

const titleSchema = z.object({
  title: z.string().min(3).max(60),
})

/**
 * Walk the priority chain (user-preferred first, then `TITLE_GENERATOR_CHAIN`)
 * and pick the first model whose provider has a reachable key. Ollama
 * needs no key but is opt-in — it only counts while its Settings → Keys
 * toggle is on. Returns `null` when nothing in the chain is reachable.
 */
export function pickTitleModelId(
  preferredId: string | undefined,
  keys: ApiKeys,
): string | null {
  const chain = preferredId
    ? [preferredId, ...TITLE_GENERATOR_CHAIN]
    : [...TITLE_GENERATOR_CHAIN]
  for (const modelId of chain) {
    const entry = registry.find((m) => m.modelId === modelId)
    if (!entry) continue
    if (entry.provider === 'ollama') {
      if (getOllamaEnabled()) return modelId
      continue
    }
    if (keys[entry.provider]?.trim()) return modelId
  }
  return null
}

/**
 * Convenience that reads the current keys directly — orchestrator path
 * (no React) calls this. UI surfaces (e.g. the Settings → Behavior
 * dropdown previewing which model would be picked) can use the
 * underlying `pickTitleModelId` with the reactive `useApiKeys` value.
 */
function pickTitleModelIdFromStorage(
  preferredId: string | undefined,
): string | null {
  return pickTitleModelId(preferredId, getApiKeys())
}

interface RunTitleGenerationArgs {
  modelId: string
  system: string
  prompt: string
  abortSignal: AbortSignal
}

export interface TitleResult {
  title?: string
  error?: string
  aborted?: boolean
}

async function runTitleGeneration({
  modelId,
  system,
  prompt,
  abortSignal,
}: RunTitleGenerationArgs): Promise<TitleResult> {
  const entry = getModel(modelId)
  try {
    const result = await generateObject({
      model: getProviderModel(entry),
      system,
      prompt,
      schema: titleSchema,
      abortSignal,
    })
    const trimmed = result.object.title.trim()
    if (trimmed.length < 3) {
      return { error: 'title_too_short_after_trim' }
    }
    return { title: trimmed }
  } catch (err) {
    const failure = runFailure(err, abortSignal, 'runTitleGeneration', modelId)
    return failure.aborted ? { aborted: true } : { error: failure.message }
  }
}

/**
 * One-call wrapper that reads the current `BehaviorSettings.titleModelId`
 * + `UserPrompts.titleSystem` / `titleTemplate` from storage, picks a
 * reachable model from the chain, builds the prompt via `applyTemplate`,
 * and runs `runTitleGeneration`. Returns `{ title?: string }` (empty
 * when no model is reachable — caller treats as "skip, keep current
 * title"). Used by the orchestrator's `generateTitleForFirstTurn`
 * (fire-and-forget after the first turn persists) to auto-name councils.
 */
export async function prepareAndRunTitleGen(args: {
  question: string
  firstAnswer: string
  abortSignal: AbortSignal
}): Promise<TitleResult> {
  const modelId = pickTitleModelIdFromStorage(
    getBehaviorSettings().titleModelId,
  )
  if (!modelId) return {}
  const userPrompts = getUserPrompts()
  const system =
    userPrompts.titleSystem?.trim() || DEFAULT_TITLE_SYSTEM_PROMPT
  const template =
    userPrompts.titleTemplate?.trim() || DEFAULT_TITLE_TEMPLATE
  const prompt = applyTemplate(template, {
    question: args.question,
    firstAnswer: args.firstAnswer || '(no answer landed yet)',
  })
  return runTitleGeneration({
    modelId,
    system,
    prompt,
    abortSignal: args.abortSignal,
  })
}
