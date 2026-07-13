import { getModel } from '@/models/registry'
import type { SeatConfig } from '@/types/council'

/**
 * A role's optional sampling knobs (`temperature` / `maxOutputTokens` /
 * `reasoningEffort`) shaped for spreading into a `run*` provider call.
 * Every role — Participant fan-out, Consensus re-answer, Judge, Mediator,
 * and each of their retries — passes the same three conditionals; building
 * them here means adding a knob is one edit, not seven, and a retry can't
 * silently drift from the phase it re-runs.
 *
 * Built with conditional spreads so an unset knob is *absent* rather than
 * an explicit `undefined`, matching the persistence-layer convention.
 *
 * `reasoningEffort` may be overridden per call (the composer's sticky
 * Thinking dial) — pass the *resolved* value, e.g. from
 * `resolveReasoningEffort` below.
 */
export function samplingArgs(
  config: SeatConfig,
  reasoningEffort: SeatConfig['reasoningEffort'] = config.reasoningEffort,
): {
  temperature?: number
  maxOutputTokens?: number
  reasoningEffort?: NonNullable<SeatConfig['reasoningEffort']>
} {
  return {
    ...(config.temperature !== undefined
      ? { temperature: config.temperature }
      : {}),
    ...(config.maxOutputTokens !== undefined
      ? { maxOutputTokens: config.maxOutputTokens }
      : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
  }
}

/**
 * A role's effective reasoning effort for one call: the composer's sticky
 * Thinking override wins, but only where the model can actually reason — a
 * "think harder" override must not inject `reasoningEffort` into a
 * non-reasoning model's call. Takes any role slot — `Seat`, `Judge`, and
 * `Mediator` all carry `modelId` + `config`, and the override governs every
 * role's calls (including retries), not just the Participant fan-out.
 */
export function resolveReasoningEffort(
  role: { modelId: string; config: SeatConfig },
  override: SeatConfig['reasoningEffort'],
): SeatConfig['reasoningEffort'] {
  return getModel(role.modelId).capabilities.reasoning
    ? (override ?? role.config.reasoningEffort)
    : role.config.reasoningEffort
}
