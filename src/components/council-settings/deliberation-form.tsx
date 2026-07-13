/**
 * Council-level "recipe" form — the per-council override of a structure's
 * prompts + quality knobs. Renders in two places (New-council modal at
 * creation, council-settings modal's recipe tab after creation) and persists
 * to `council.deliberation` via `setDeliberation`.
 *
 * The body is the shared `<StructureRecipe>` — the *same* component Settings →
 * Councils uses — so the global and per-council forms can't drift. This form
 * feeds it a **council** binding: values read from the in-progress
 * `CouncilDeliberation` draft, and each field's `defaultValue` is the
 * **global-effective** value (the user's Settings default, itself cascading to
 * the hardcoded default). That makes the override semantics read correctly per
 * council — a visible Reset button means "overridden for *this* council", and
 * Reset falls back to your global default.
 *
 * The Judge / Mediator **system** prompts are intentionally *not* in the
 * binding: per council they're seat-owned (`judge.config.systemPrompt` /
 * `mediator.config.systemPrompt`), edited via `SeatConfigForm` on the role's
 * seat surface. Everything else — including the participant voice, all the way
 * down to Parallel's single prompt — is here.
 *
 * The draft holds the *full* `CouncilDeliberation` bag, so saving never drops a
 * field the visible form doesn't happen to render for this structure.
 */

import { forwardRef, useImperativeHandle, useState } from 'react'
import { useStyletron } from 'baseui'
import { ParagraphXSmall } from 'baseui/typography'
import { SettingsLink } from '@/components/settings-link'
import {
  type RecipeBinding,
  StructureRecipe,
} from '@/components/settings/structure-recipe'
import { useBehaviorSettings } from '@/hooks/use-behavior-settings'
import { useUserPrompts } from '@/hooks/use-user-prompts'
import {
  DEFAULT_MEDIATOR_MAX_ROUNDS,
  DEFAULT_PASS_DIVERGENCE,
  DEFAULT_PASS_PEER_ANSWERS,
  DEFAULT_VOTING_DIMENSIONS,
} from '@/storage/behavior'
import {
  DEFAULT_JUDGE_TEMPLATE,
  DEFAULT_MEDIATOR_TEMPLATE,
  DEFAULT_REANSWER_SYSTEM_PROMPT,
  DEFAULT_REANSWER_TEMPLATE,
  DEFAULT_VOTING_SYSTEM_PROMPT,
  DEFAULT_VOTING_TEMPLATE,
  resolveParticipantDefault,
} from '@/storage/prompts'
import { DEFAULT_PARTICIPANT_PROMPT } from '@/models/registry'
import type { CouncilDeliberation, SocialStructure } from '@/types/council'

export interface DeliberationFormHandle {
  /** The current draft — read by the modal on Save and handed to
   *  `setDeliberation`, which sanitizes it (empties → cascade). */
  buildDeliberation: () => CouncilDeliberation
}

export const DeliberationForm = forwardRef<
  DeliberationFormHandle,
  {
    structure: SocialStructure
    deliberation: CouncilDeliberation | undefined
  }
>(function DeliberationForm({ structure, deliberation }, ref) {
  const [css] = useStyletron()
  const behavior = useBehaviorSettings()
  const userPrompts = useUserPrompts()
  const [draft, setDraft] = useState<CouncilDeliberation>(deliberation ?? {})

  useImperativeHandle(ref, () => ({ buildDeliberation: () => draft }), [draft])

  function set<K extends keyof CouncilDeliberation>(
    key: K,
    next: CouncilDeliberation[K] | undefined,
  ) {
    setDraft((d) => {
      const nd = { ...d }
      // Clearing an override deletes the key so the orchestrator's
      // `council ?? global ?? default` cascade falls through to global.
      if (next === undefined) delete nd[key]
      else nd[key] = next
      return nd
    })
  }

  // Council binding: draft values, defaults = the global-effective value (the
  // user's Settings default → hardcoded). System prompts omitted (seat-owned).
  const binding: RecipeBinding = {
    participant: {
      value: draft.participant,
      defaultValue:
        resolveParticipantDefault(structure, userPrompts) ??
        DEFAULT_PARTICIPANT_PROMPT,
      onChange: (v) => set('participant', v),
    },
    votingDimensions: {
      value: draft.votingDimensions,
      defaultValue: behavior.votingDimensions ?? DEFAULT_VOTING_DIMENSIONS,
      onChange: (v) => set('votingDimensions', v),
    },
    votingSystem: {
      value: draft.votingSystem,
      defaultValue: userPrompts.votingSystem ?? DEFAULT_VOTING_SYSTEM_PROMPT,
      onChange: (v) => set('votingSystem', v),
    },
    votingTemplate: {
      value: draft.votingTemplate,
      defaultValue: userPrompts.votingTemplate ?? DEFAULT_VOTING_TEMPLATE,
      onChange: (v) => set('votingTemplate', v),
    },
    judgeTemplate: {
      value: draft.judgeTemplate,
      defaultValue: userPrompts.judgeTemplate ?? DEFAULT_JUDGE_TEMPLATE,
      onChange: (v) => set('judgeTemplate', v),
    },
    passDivergence: {
      value: draft.passDivergence,
      defaultValue: behavior.passDivergence ?? DEFAULT_PASS_DIVERGENCE,
      onChange: (v) => set('passDivergence', v),
    },
    passPeerAnswers: {
      value: draft.passPeerAnswers,
      defaultValue: behavior.passPeerAnswers ?? DEFAULT_PASS_PEER_ANSWERS,
      onChange: (v) => set('passPeerAnswers', v),
    },
    mediatorMaxRounds: {
      value: draft.mediatorMaxRounds,
      defaultValue: behavior.mediatorMaxRounds ?? DEFAULT_MEDIATOR_MAX_ROUNDS,
      onChange: (v) => set('mediatorMaxRounds', v),
    },
    reanswerSystem: {
      value: draft.reanswerSystem,
      defaultValue: userPrompts.reanswerSystem ?? DEFAULT_REANSWER_SYSTEM_PROMPT,
      onChange: (v) => set('reanswerSystem', v),
    },
    reanswerTemplate: {
      value: draft.reanswerTemplate,
      defaultValue:
        userPrompts.reanswerTemplate ?? DEFAULT_REANSWER_TEMPLATE,
      onChange: (v) => set('reanswerTemplate', v),
    },
    mediatorTemplate: {
      value: draft.mediatorTemplate,
      defaultValue: userPrompts.mediatorTemplate ?? DEFAULT_MEDIATOR_TEMPLATE,
      onChange: (v) => set('mediatorTemplate', v),
    },
  }

  return (
    <div className={css({ paddingTop: '4px' })}>
      <ParagraphXSmall marginTop="0" marginBottom="12px" color="contentTertiary">
        For this council only. Fields follow your defaults in{' '}
        <SettingsLink tab="councils" /> until you edit them.
      </ParagraphXSmall>

      <StructureRecipe structure={structure} binding={binding} />
    </div>
  )
})
