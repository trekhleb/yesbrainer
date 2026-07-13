/**
 * The Judge / Mediator slot shared by the **New-council** and
 * **Council-settings** modals — the synthesiser picker row plus its inline
 * `SeatConfigForm`, mounted on first expand and kept mounted so a single
 * Save reads it (the same pattern the roster rows use).
 *
 * One component so the two modals can't drift — the anti-drift move
 * `RosterEditor` already made for the Participants section. The modals
 * differ only in their bindings, passed as props: the create modal seeds
 * an empty config with no "customized" dot; the settings modal seeds the
 * persisted config and dots the toggle when it differs from default.
 *
 * The per-role system-prompt default (user default ?? built-in) resolves
 * here from `userPrompts`, so both call sites feed the SeatConfigForm the
 * same effective baseline.
 */

import type { ReactNode } from 'react'
import { ConfigToggleButton } from '@/components/config-toggle-button'
import { InlineConfigPanel } from '@/components/inline-config-panel'
import { SynthesiserPicker } from '@/components/new-council/synthesiser-picker'
import {
  SeatConfigForm,
  type SeatConfigFormHandle,
} from '@/components/seat-config/seat-config-form'
import type { ModelOption } from '@/components/model-options'
import {
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  DEFAULT_MEDIATOR_SYSTEM_PROMPT,
} from '@/storage/prompts'
import type { UserPrompts } from '@/storage/prompts'
import type { SeatConfig } from '@/types/council'

export type SynthesiserRole = 'judge' | 'mediator'

export function SynthesiserSection({
  role,
  modelId,
  onChangeModel,
  options,
  expanded,
  mounted,
  onToggleConfig,
  customized,
  config,
  userPrompts,
  registerForm,
}: {
  role: SynthesiserRole
  modelId: string
  onChangeModel: (modelId: string) => void
  options: ModelOption[]
  /** The inline config panel is open. */
  expanded: boolean
  /** The form has been expanded at least once — mount it (then keep it
   *  mounted through collapses so hidden edits survive to Save). */
  mounted: boolean
  onToggleConfig: () => void
  /** Dot the configure toggle — the slot carries persisted customizations.
   *  Always false at creation. */
  customized: boolean
  /** Seed config for the form: empty at creation, the persisted slot config
   *  when editing. */
  config: SeatConfig
  userPrompts: UserPrompts
  /** Collect the form handle so the owning modal's Save can read it. */
  registerForm: (handle: SeatConfigFormHandle | null) => void
}): ReactNode {
  const userDefault =
    role === 'judge'
      ? userPrompts.judgeSystem?.trim()
      : userPrompts.mediatorSystem?.trim()
  const builtinDefault =
    role === 'judge' ? DEFAULT_JUDGE_SYSTEM_PROMPT : DEFAULT_MEDIATOR_SYSTEM_PROMPT
  return (
    <div>
      <SynthesiserPicker
        role={role}
        modelId={modelId}
        onChange={onChangeModel}
        options={options}
        trailing={
          <ConfigToggleButton
            expanded={expanded}
            customized={customized}
            onClick={onToggleConfig}
          />
        }
      />
      {mounted && (
        <InlineConfigPanel expanded={expanded}>
          <SeatConfigForm
            // Remount on model swap: tools / thinking support differ per
            // model, so a form seeded for the old model would lie.
            key={`${role}:${modelId}`}
            ref={registerForm}
            modelId={modelId}
            config={config}
            role={role}
            effectiveDefault={userDefault || builtinDefault}
            defaultSource={userDefault ? 'your default' : 'the default'}
          />
        </InlineConfigPanel>
      )}
    </div>
  )
}
