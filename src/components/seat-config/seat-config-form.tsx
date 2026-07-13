/**
 * One participant's configuration form — system prompt (the hero field),
 * provider tools, and extended thinking. Rendered per seat inside the
 * council-settings modal.
 *
 * Deliberately *not* rendered (a simplification pass): temperature and max
 * output tokens. Their provider defaults are right for ~everyone, so the
 * knobs came out of the UI per the "user-tuneable ≠ always-visible" rule.
 * The storage fields still exist and still cascade — `buildConfig()` passes
 * any stored values through untouched, so a seat configured before the
 * simplification behaves identically and re-exposing a knob later is a
 * one-line UI add.
 *
 * `forwardRef` + `buildConfig()` (via `useImperativeHandle`) so the parent
 * modal can collect every seat's config in one Save without lifting all the
 * field state up — each form keeps its own state, the parent just reads the
 * built `SeatConfig` off each ref when the user hits Save.
 *
 * `role` tailors the form to the slot: Judge / Mediator runs don't pass
 * provider tools, so the Tools field is hidden for them (showing it would be
 * a fake affordance); only Participants get it.
 */

import { forwardRef, useImperativeHandle, useState } from 'react'
import { PersonaField } from '@/components/seat-config/persona-field'
import {
  ReasoningField,
  type ReasoningEffortValue,
} from '@/components/seat-config/reasoning-field'
import { ToolsField } from '@/components/seat-config/tools-field'
import { sameSet } from '@/utils/same-set'
import { getAvailableToolNamesForEntry } from '@/providers/tools'
import { getEnabledToolNamesForSeat } from '@/providers/tools/enabled'
import { getModel } from '@/models/registry'
import type { SeatConfig } from '@/types/council'

type ConfigRole = 'participant' | 'judge' | 'mediator'

/** Role-aware system-prompt field label, so the seat-config form names the
 *  prompt the same way the global Settings → Councils recipe does
 *  ("Judge system prompt" / "Mediator system prompt") instead of a bare
 *  "System prompt" that didn't read as the same setting. */
const SYSTEM_PROMPT_LABEL: Record<ConfigRole, string> = {
  participant: 'Participant system prompt',
  judge: 'Judge system prompt',
  mediator: 'Mediator system prompt',
}

export interface SeatConfigFormHandle {
  /** Collapse the live field state into the persisted `SeatConfig` shape. */
  buildConfig: () => SeatConfig
}

export interface SeatConfigFormProps {
  modelId: string
  config: SeatConfig
  role: ConfigRole
  /** Effective system prompt shown as the field's real text when there's
   *  no per-slot override — resolved per role by the parent. */
  effectiveDefault: string
  /** "your default" / "the default" — labels where that default came from. */
  defaultSource: string
}

export const SeatConfigForm = forwardRef<
  SeatConfigFormHandle,
  SeatConfigFormProps
>(function SeatConfigForm(
  { modelId, config, role, effectiveDefault, defaultSource },
  ref,
) {
  const model = getModel(modelId)
  // Tools only apply to Participant seats — Judge / Mediator runs never pass
  // provider tools, so the field is hidden (and their `config.tools` is left
  // untouched on save).
  const showTools = role === 'participant'

  const [systemPrompt, setSystemPrompt] = useState<string | undefined>(
    config.systemPrompt,
  )
  const availableTools = getAvailableToolNamesForEntry(model)
  const [enabledTools, setEnabledTools] = useState<string[]>(() =>
    getEnabledToolNamesForSeat({ id: 'cfg', modelId, config }),
  )
  const [reasoningEffort, setReasoningEffort] = useState<
    ReasoningEffortValue | undefined
  >(config.reasoningEffort)

  const toolsSupported = model.capabilities.tools
  const reasoningSupported = model.capabilities.reasoning

  // No deps array: re-create the handle each render so `buildConfig` always
  // closes over the latest field state when the parent reads it on Save.
  useImperativeHandle(ref, () => ({
    buildConfig(): SeatConfig {
      // Storage cascade: collapse per-tool checkbox state to the most
      // compact valid shape so future default flips propagate. Judge /
      // Mediator keep their existing tools value untouched since the field
      // isn't shown.
      const toolsToPersist: boolean | string[] | undefined = !showTools
        ? config.tools
        : availableTools.length === 0
          ? undefined
          : enabledTools.length === 0
            ? false
            : sameSet(enabledTools, availableTools)
              ? undefined
              : [...enabledTools]
      return {
        systemPrompt: systemPrompt?.trim() ? systemPrompt : undefined,
        // No UI for these two — pass any stored override through untouched.
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        tools: toolsToPersist,
        reasoningEffort: reasoningSupported ? reasoningEffort : undefined,
      }
    },
  }))

  return (
    <>
      <PersonaField
        label={SYSTEM_PROMPT_LABEL[role]}
        value={systemPrompt}
        onChange={setSystemPrompt}
        effectiveDefault={effectiveDefault}
        defaultSource={defaultSource}
      />
      {showTools && (
        <ToolsField
          toolsSupported={toolsSupported}
          availableTools={availableTools}
          enabledTools={enabledTools}
          setEnabledTools={setEnabledTools}
          modelLabel={model.label}
        />
      )}
      <ReasoningField
        entry={model}
        value={reasoningEffort}
        onChange={setReasoningEffort}
      />
    </>
  )
})
