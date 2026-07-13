/**
 * Settings → Councils.
 *
 * Organised by **social structure**: each panel is the *complete recipe* for a
 * council type — its prompts and its quality knobs together — so you configure
 * "how Trial works" in one place.
 *
 *   Parallel        → the Participant answer prompt (the base voice)
 *   Trial           → Roundtable · Voting · Judge
 *   Consensus       → Roundtable · Reconsider · Mediator
 *   Council titles  → the Titler (model + prompts) — the one knob with no
 *                     structure (formerly "Misc"; named for its contents)
 *
 * The per-structure body is rendered by the shared `<StructureRecipe>` — the
 * *same* component the New-council modal and the council-settings recipe tab
 * use for per-council overrides, so the global and per-council forms can't
 * drift. This tab feeds it a **global** binding: values read from
 * `UserPrompts` / `BehaviorSettings`, each field's `defaultValue` is the
 * hardcoded `DEFAULT_*` (so Reset restores the built-in), and the Judge /
 * Mediator **system** prompts are included (globally they have no seat to own
 * them). Everything here is a *global default* — per-council (a council's
 * recipe tab) and per-seat (seat-config modal) overrides win.
 */

import { useStyletron } from 'baseui'
import { Accordion, Panel } from 'baseui/accordion'
import { LuType } from 'react-icons/lu'
import { TitleModelField } from '@/components/settings/behavior-fields'
import { PromptField } from '@/components/fields/prompt-field'
import { useSettingsPanel } from '@/components/settings/settings-accordion'
import {
  type RecipeBinding,
  StructureRecipe,
} from '@/components/settings/structure-recipe'
import {
  DEFAULT_MEDIATOR_MAX_ROUNDS,
  DEFAULT_PASS_DIVERGENCE,
  DEFAULT_PASS_PEER_ANSWERS,
  DEFAULT_VOTING_DIMENSIONS,
  type BehaviorSettings,
} from '@/storage/behavior'
import {
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  DEFAULT_JUDGE_TEMPLATE,
  DEFAULT_MEDIATOR_SYSTEM_PROMPT,
  DEFAULT_MEDIATOR_TEMPLATE,
  DEFAULT_REANSWER_SYSTEM_PROMPT,
  DEFAULT_REANSWER_TEMPLATE,
  DEFAULT_TITLE_SYSTEM_PROMPT,
  DEFAULT_TITLE_TEMPLATE,
  DEFAULT_VOTING_SYSTEM_PROMPT,
  DEFAULT_VOTING_TEMPLATE,
  type UserPrompts,
} from '@/storage/prompts'
import { DEFAULT_PARTICIPANT_PROMPT } from '@/models/registry'
import type { SocialStructure } from '@/types/council'

export function CouncilsTab({
  prompts,
  setPrompts,
  behavior,
  setBehavior,
}: {
  prompts: UserPrompts
  setPrompts: (updater: (p: UserPrompts) => UserPrompts) => void
  behavior: BehaviorSettings
  setBehavior: (updater: (b: BehaviorSettings) => BehaviorSettings) => void
}) {
  const [css, theme] = useStyletron()

  function updatePrompt<K extends keyof UserPrompts>(
    key: K,
    next: UserPrompts[K] | undefined,
  ) {
    setPrompts((p) => ({ ...p, [key]: next }))
  }
  function updateBehavior<K extends keyof BehaviorSettings>(
    key: K,
    next: BehaviorSettings[K] | undefined,
  ) {
    setBehavior((b) => ({ ...b, [key]: next }))
  }

  // The Participant voice is per-structure and independent — each structure
  // has its own `UserPrompts` field, all defaulting to the same registry base.
  const participantKey = (
    structure: SocialStructure,
  ): 'participant' | 'participantTrial' | 'participantConsensus' =>
    structure === 'trial'
      ? 'participantTrial'
      : structure === 'consensus'
        ? 'participantConsensus'
        : 'participant'

  // Global binding: values from storage, defaults = the hardcoded built-ins
  // (so Reset restores those), system prompts included.
  const globalBinding = (structure: SocialStructure): RecipeBinding => {
    const pk = participantKey(structure)
    return {
      participant: {
        value: prompts[pk],
        defaultValue: DEFAULT_PARTICIPANT_PROMPT,
        onChange: (v) => updatePrompt(pk, v),
      },
      votingDimensions: {
        value: behavior.votingDimensions,
        defaultValue: DEFAULT_VOTING_DIMENSIONS,
        onChange: (v) => updateBehavior('votingDimensions', v),
      },
      votingSystem: {
        value: prompts.votingSystem,
        defaultValue: DEFAULT_VOTING_SYSTEM_PROMPT,
        onChange: (v) => updatePrompt('votingSystem', v),
      },
      votingTemplate: {
        value: prompts.votingTemplate,
        defaultValue: DEFAULT_VOTING_TEMPLATE,
        onChange: (v) => updatePrompt('votingTemplate', v),
      },
      judgeSystem: {
        value: prompts.judgeSystem,
        defaultValue: DEFAULT_JUDGE_SYSTEM_PROMPT,
        onChange: (v) => updatePrompt('judgeSystem', v),
      },
      judgeTemplate: {
        value: prompts.judgeTemplate,
        defaultValue: DEFAULT_JUDGE_TEMPLATE,
        onChange: (v) => updatePrompt('judgeTemplate', v),
      },
      passDivergence: {
        value: behavior.passDivergence,
        defaultValue: DEFAULT_PASS_DIVERGENCE,
        onChange: (v) => updateBehavior('passDivergence', v),
      },
      passPeerAnswers: {
        value: behavior.passPeerAnswers,
        defaultValue: DEFAULT_PASS_PEER_ANSWERS,
        onChange: (v) => updateBehavior('passPeerAnswers', v),
      },
      mediatorMaxRounds: {
        value: behavior.mediatorMaxRounds,
        defaultValue: DEFAULT_MEDIATOR_MAX_ROUNDS,
        onChange: (v) => updateBehavior('mediatorMaxRounds', v),
      },
      reanswerSystem: {
        value: prompts.reanswerSystem,
        defaultValue: DEFAULT_REANSWER_SYSTEM_PROMPT,
        onChange: (v) => updatePrompt('reanswerSystem', v),
      },
      reanswerTemplate: {
        value: prompts.reanswerTemplate,
        defaultValue: DEFAULT_REANSWER_TEMPLATE,
        onChange: (v) => updatePrompt('reanswerTemplate', v),
      },
      mediatorSystem: {
        value: prompts.mediatorSystem,
        defaultValue: DEFAULT_MEDIATOR_SYSTEM_PROMPT,
        onChange: (v) => updatePrompt('mediatorSystem', v),
      },
      mediatorTemplate: {
        value: prompts.mediatorTemplate,
        defaultValue: DEFAULT_MEDIATOR_TEMPLATE,
        onChange: (v) => updatePrompt('mediatorTemplate', v),
      },
    }
  }

  // Per-panel "any field customized?" — surfaces the Custom tag on collapsed
  // headers so a tweaked structure is findable without expanding everything.
  // Key lists mirror the fields each structure's recipe renders below.
  const anySet = (...values: unknown[]) =>
    values.some((v) => v !== undefined)
  const parallelCustomized = anySet(prompts.participant)
  const consensusCustomized = anySet(
    prompts.participantConsensus,
    prompts.reanswerSystem,
    prompts.reanswerTemplate,
    prompts.mediatorSystem,
    prompts.mediatorTemplate,
    behavior.passDivergence,
    behavior.passPeerAnswers,
    behavior.mediatorMaxRounds,
  )
  const trialCustomized = anySet(
    prompts.participantTrial,
    prompts.votingSystem,
    prompts.votingTemplate,
    prompts.judgeSystem,
    prompts.judgeTemplate,
    behavior.votingDimensions,
  )
  const titlesCustomized = anySet(
    behavior.titleModelId,
    prompts.titleSystem,
    prompts.titleTemplate,
  )

  // Ordered simplest → most complex (Parallel → Consensus → Trial), matching
  // SOCIAL_STRUCTURES and every other surface that lists the council types.
  const parallel = useSettingsPanel(
    { structure: 'roundtable' },
    { customized: parallelCustomized },
  )
  const consensus = useSettingsPanel(
    { structure: 'consensus' },
    { customized: consensusCustomized },
  )
  const trial = useSettingsPanel(
    { structure: 'trial' },
    { customized: trialCustomized },
  )
  const titles = useSettingsPanel(
    { neutral: LuType, label: 'Council titles' },
    { customized: titlesCustomized },
  )

  return (
    <div>
      <p
        className={css({
          margin: 0,
          fontSize: '13px',
          lineHeight: 1.55,
          color: theme.colors.contentSecondary,
        })}
      >
        Defaults for every council of a type. A council's own settings, and
        per-seat prompts, win over these.
      </p>

      <div className={css({ marginTop: '16px' })}>
        <Accordion accordion={false}>
          <Panel title={parallel.title} overrides={parallel.overrides}>
            <StructureRecipe
              structure="roundtable"
              binding={globalBinding('roundtable')}
            />
          </Panel>

          <Panel title={consensus.title} overrides={consensus.overrides}>
            <StructureRecipe
              structure="consensus"
              binding={globalBinding('consensus')}
            />
          </Panel>

          <Panel title={trial.title} overrides={trial.overrides}>
            <StructureRecipe
              structure="trial"
              binding={globalBinding('trial')}
            />
          </Panel>

          {/* Council titles — the Titler, which belongs to no structure. */}
          <Panel title={titles.title} overrides={titles.overrides}>
            <TitleModelField
              value={behavior.titleModelId}
              onChange={(v) => updateBehavior('titleModelId', v)}
            />

            <PromptField
              label="Title-generator system prompt"
              caption="Short, distinguishable titles work best — the sidebar shows ~60 characters."
              value={prompts.titleSystem}
              defaultValue={DEFAULT_TITLE_SYSTEM_PROMPT}
              onChange={(v) => updatePrompt('titleSystem', v)}
              rows={5}
            />

            <PromptField
              label="Title-generator user-message template"
              caption={
                <span>
                  Placeholders: <code>{'{question}'}</code> (the user's first
                  message), <code>{'{firstAnswer}'}</code> (the earliest
                  Participant answer).
                </span>
              }
              value={prompts.titleTemplate}
              defaultValue={DEFAULT_TITLE_TEMPLATE}
              onChange={(v) => updatePrompt('titleTemplate', v)}
              rows={5}
            />
          </Panel>
        </Accordion>
      </div>
    </div>
  )
}
