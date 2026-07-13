/**
 * System-prompt editor inside the per-seat config modal. A thin wrapper over
 * the shared `<PromptField>` so it renders the *effective* default as real
 * text (not a placeholder) with the same Custom tag + Reset-to-default
 * affordance the Settings → Prompts fields use.
 *
 * `value === undefined` means "no per-seat override" — the seat falls back to
 * the effective default (the user's Settings → Prompts default if set,
 * otherwise the registry's `defaultSystemPrompt`), which is what's shown in
 * the textarea. Editing to anything other than that default sets the override.
 */

import { PromptField } from '@/components/fields/prompt-field'

export function PersonaField({
  label,
  value,
  onChange,
  effectiveDefault,
  defaultSource,
}: {
  /** Role-aware field label (e.g. `"Mediator system prompt"`), so the field
   *  matches the global Settings → Councils naming for the same prompt. */
  label: string
  value: string | undefined
  onChange: (next: string | undefined) => void
  /** What this seat would use if not overridden — already cascaded through
   *  user-default → registry-default. Shown as the textarea's real text. */
  effectiveDefault: string
  /** Human-readable source label for the caption: typically
   *  `'your default'` or `'the default'`. */
  defaultSource: string
}) {
  return (
    <PromptField
      label={label}
      caption={
        value !== undefined
          ? `This seat only — Reset returns to ${defaultSource}.`
          : `Showing ${defaultSource} — edit to customize this seat.`
      }
      value={value}
      defaultValue={effectiveDefault}
      onChange={onChange}
      // Taller default (≈2×) — system prompts are multi-paragraph, and the
      // short box made the council-settings tabs feel cramped.
      rows={8}
      // Inside the seat-config modal's focus-lock — keep the textarea out of
      // the initial autofocus so opening it doesn't pop the mobile keyboard.
      noAutoFocus
    />
  )
}
