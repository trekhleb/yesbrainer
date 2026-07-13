import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import type { Tool, ToolSet } from 'ai'
import type { ModelEntry, ProviderId } from '@/models/registry'

/**
 * Provider-native tool packs. Each provider exposes its
 * own grounding / search / code-execution surface; AI SDK 6 wraps them
 * as `providerName.tools.<toolName>` factories that drop into
 * `streamText({ tools })`.
 *
 * Two questions every consumer asks:
 *   1. **What tools are available for this model?**
 *      → `getAvailableToolNamesForEntry(entry)`.
 *   2. **Build the AI SDK ToolSet, optionally filtered to an allow-list.**
 *      → `buildToolsForEntry(entry, allowedToolNames?)`.
 *
 * The orchestrator is responsible for the user-facing on/off gating
 * (per-seat `seat.config.tools` + per-message `skipTools` override);
 * this helper trusts that the caller has already decided "these tools
 * are enabled for this seat this turn" and returns either the matching
 * subset or `undefined` (the "no tools this turn" signal that the
 * runner uses to skip the `tools` param entirely).
 *
 * **Single source of truth for tool names.** Every reference to a tool
 * name (storage allow-list, seat-config modal checkbox label, persisted
 * `event.toolCalls[].name`) flows from this file's per-provider tables.
 * Adding a new tool = one entry in the provider's table + one display
 * label.
 */

/** Stable identifiers for every tool we wire. Used as ToolSet keys,
 *  persisted in `seat.config.tools` allow-lists, and shown in the
 *  capability checkbox list. Keep these in sync with the provider
 *  factories below. */
type ToolName =
  | 'web_search'
  | 'code_execution'
  | 'url_context'

/** Per-tool display label for the seat-config modal's checkbox list. */
export const TOOL_DISPLAY_LABEL: Record<ToolName, string> = {
  web_search: 'Web search',
  code_execution: 'Code execution',
  url_context: 'URL context',
}

/** Friendly label for a tool identifier as it appears on a persisted event
 *  (`toolCalls[].name`), falling back to the raw id for any tool we haven't
 *  named (e.g. a provider tool added to the stream but not yet to the table). */
export function getToolDisplayLabel(name: string): string {
  return name in TOOL_DISPLAY_LABEL
    ? TOOL_DISPLAY_LABEL[name as ToolName]
    : name
}

/** Per-tool short description shown under the checkbox label. */
export const TOOL_DESCRIPTION: Record<ToolName, string> = {
  web_search:
    'Lets the model search the web for fresh facts when answering.',
  code_execution:
    'Lets the model run sandboxed code (typically Python) to verify calculations or process data.',
  url_context:
    'Lets the model fetch and read a URL the user pasted into the question.',
}

/** Per-provider available tool list — single source of truth for "what
 *  tools does this provider's models support". Models without
 *  `capabilities.tools` skip the whole pack regardless. */
const PROVIDER_TOOLS: Partial<Record<ProviderId, ToolName[]>> = {
  anthropic: ['web_search', 'code_execution'],
  openai: ['web_search', 'code_execution'],
  google: ['web_search', 'url_context'],
  // Ollama / Groq / OpenRouter — no uniform tools surface in AI SDK 6
  // today. Listed implicitly via the absence of an entry; treated as
  // "no tools available" by both consumers.
}

/**
 * What tools are available for this model? Returns `[]` for models
 * without `capabilities.tools` or providers we haven't wired —
 * downstream consumers use the length to decide between binary
 * checkbox / N-row list / hidden section.
 */
export function getAvailableToolNamesForEntry(entry: ModelEntry): string[] {
  if (!entry.capabilities.tools) return []
  return PROVIDER_TOOLS[entry.provider] ?? []
}

/**
 * Build the AI SDK ToolSet, optionally filtered to `allowedToolNames`.
 * When the allow-list is `undefined` every available tool is included
 * (the "all on" case for both `seat.config.tools === true` and
 * `seat.config.tools === undefined`). When the allow-list is empty
 * `undefined` is returned so the runner skips the `tools` param.
 *
 * Unknown allow-list entries (e.g. a tool name we used to support but
 * removed) are silently dropped — defends against hand-edited
 * `seat.config` against an older registry.
 */
export function buildToolsForEntry(
  entry: ModelEntry,
  allowedToolNames?: string[],
): ToolSet | undefined {
  const available = getAvailableToolNamesForEntry(entry)
  if (available.length === 0) return undefined
  const filtered = allowedToolNames
    ? available.filter((n): n is ToolName =>
        allowedToolNames.includes(n) && isToolName(n),
      )
    : (available as ToolName[])
  if (filtered.length === 0) return undefined
  const out: ToolSet = {}
  for (const name of filtered) {
    const tool = buildTool(entry.provider, name)
    if (tool) out[name] = tool
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function isToolName(s: string): s is ToolName {
  return s === 'web_search' || s === 'code_execution' || s === 'url_context'
}

/**
 * Per-provider tool-factory dispatch. Centralised here so the surface
 * `(provider, toolName)` → AI SDK tool factory call is one switch, not
 * scattered. Returns `undefined` for any (provider, tool) pair we
 * haven't wired — the caller drops it from the ToolSet silently.
 */
function buildTool(provider: ProviderId, name: ToolName): Tool | undefined {
  switch (provider) {
    case 'anthropic':
      if (name === 'web_search') return anthropic.tools.webSearch_20250305()
      if (name === 'code_execution')
        return anthropic.tools.codeExecution_20260120()
      return undefined
    case 'openai':
      if (name === 'web_search')
        return openai.tools.webSearchPreview({})
      if (name === 'code_execution')
        return openai.tools.codeInterpreter({})
      return undefined
    case 'google':
      if (name === 'web_search') return google.tools.googleSearch({})
      if (name === 'url_context') return google.tools.urlContext({})
      return undefined
    default:
      return undefined
  }
}
