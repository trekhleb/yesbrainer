/**
 * The **one** per-structure "recipe" form — the single source of truth for how
 * a council type's prompts + quality knobs are laid out and captioned. Rendered
 * in three places so they can never drift:
 *
 *   - Settings → Councils           (global defaults; global binding)
 *   - New-council modal             (per-council override at creation)
 *   - Council-settings recipe tab   (per-council override after creation)
 *
 * The component is **purely presentational**: it reads and writes through a
 * `RecipeBinding` the caller supplies, so the *only* things that vary between
 * surfaces live in the binding — where each field reads/writes (global
 * `UserPrompts`/`BehaviorSettings` vs a `CouncilDeliberation` draft) and what
 * its `defaultValue` (the Reset target) is (hardcoded default vs the
 * global-effective value). Field set, captions, ordering, section headers, and
 * the Reset affordance are defined here once.
 *
 * The Judge / Mediator **system** prompts render only when the binding provides
 * them (`judgeSystem` / `mediatorSystem`) — the global binding does; the
 * per-council binding omits them, because per council they're seat-owned
 * (`judge.config.systemPrompt` / `mediator.config.systemPrompt`, edited via
 * `SeatConfigForm`). Everything else is shared.
 */

import type { ReactNode } from 'react'
import { LuListChecks, LuUsersRound } from 'react-icons/lu'
import { PiChatsBold } from 'react-icons/pi'
import { BehaviorNumberField } from '@/components/settings/behavior-fields'
import { DimensionsField } from '@/components/settings/dimensions-field'
import { PromptField } from '@/components/fields/prompt-field'
import { SegmentedField } from '@/components/fields/segmented-field'
import { SectionHeader } from '@/components/settings/section-header'
import { STRUCTURE_ICON } from '@/models/social-structures'
import type { DimensionConfig } from '@/storage/behavior'
import type { SocialStructure } from '@/types/council'

/** One field's read/write triple: current value (undefined = not overridden),
 *  the value shown / restored on Reset, and the setter (`undefined` clears the
 *  override so the field cascades). */
interface FieldBinding<T> {
  value: T | undefined
  defaultValue: T
  onChange: (next: T | undefined) => void
}

/** Every field a structure recipe can render. `judgeSystem` / `mediatorSystem`
 *  are optional: present in the global binding, omitted per-council (seat-owned
 *  there). Callers only need to populate the fields their structure uses, but
 *  it's simplest to build the whole bag. */
export interface RecipeBinding {
  participant: FieldBinding<string>
  // Trial.
  votingDimensions: FieldBinding<DimensionConfig[]>
  votingSystem: FieldBinding<string>
  votingTemplate: FieldBinding<string>
  judgeSystem?: FieldBinding<string>
  judgeTemplate: FieldBinding<string>
  // Consensus.
  passDivergence: FieldBinding<boolean>
  passPeerAnswers: FieldBinding<boolean>
  mediatorMaxRounds: FieldBinding<number>
  reanswerSystem: FieldBinding<string>
  reanswerTemplate: FieldBinding<string>
  mediatorSystem?: FieldBinding<string>
  mediatorTemplate: FieldBinding<string>
}

/** Per-structure caption for the Participant answer prompt — the one field
 *  every structure has. */
const PARTICIPANT_CAPTION: Record<SocialStructure, string> = {
  roundtable: 'How each model answers your question in Parallel mode.',
  consensus: "How each model answers in Consensus's first round.",
  trial: "How each model answers in Trial's answer round, before voting.",
  custom: 'How each model answers your question.',
}

function ParticipantField({
  structure,
  binding,
}: {
  structure: SocialStructure
  binding: RecipeBinding
}) {
  return (
    <PromptField
      label="Participant answers prompt"
      caption={PARTICIPANT_CAPTION[structure]}
      value={binding.participant.value}
      defaultValue={binding.participant.defaultValue}
      onChange={binding.participant.onChange}
      rows={4}
    />
  )
}

/**
 * What Participants see when reconsidering between Consensus rounds — one
 * choice among three valid states, stored as the two booleans
 * `passDivergence` / `passPeerAnswers`. They used to render as two coupled
 * checkboxes with a hidden constraint (both-off silently fell back to the
 * divergence framing — a checkbox that lies); the segmented control has no
 * invalid state to hide.
 */
function ReconsiderInputField({ binding }: { binding: RecipeBinding }) {
  const divergence =
    binding.passDivergence.value ?? binding.passDivergence.defaultValue
  const peers =
    binding.passPeerAnswers.value ?? binding.passPeerAnswers.defaultValue
  // Both-off is the orchestrator's fallback-to-divergence state — render it
  // as "Disagreements" (what actually gets sent).
  const activeKey =
    divergence && peers ? 'both' : peers ? 'peers' : 'divergence'
  const isOverridden =
    binding.passDivergence.value !== undefined ||
    binding.passPeerAnswers.value !== undefined
  const apply = (nextDivergence: boolean, nextPeers: boolean) => {
    binding.passDivergence.onChange(
      nextDivergence === binding.passDivergence.defaultValue
        ? undefined
        : nextDivergence,
    )
    binding.passPeerAnswers.onChange(
      nextPeers === binding.passPeerAnswers.defaultValue
        ? undefined
        : nextPeers,
    )
  }
  return (
    <SegmentedField
      label="Participants reconsider against"
      caption="Disagreements = the Mediator's distilled points of conflict. Peer answers = the full anonymized answers — more context, more tokens."
      options={[
        { key: 'divergence', label: 'Disagreements' },
        { key: 'peers', label: 'Peer answers' },
        { key: 'both', label: 'Both' },
      ]}
      activeKey={activeKey}
      isOverridden={isOverridden}
      onReset={() => {
        binding.passDivergence.onChange(undefined)
        binding.passPeerAnswers.onChange(undefined)
      }}
      onChange={(k) =>
        apply(k === 'divergence' || k === 'both', k === 'peers' || k === 'both')
      }
    />
  )
}

export function StructureRecipe({
  structure,
  binding,
}: {
  structure: SocialStructure
  binding: RecipeBinding
}): ReactNode {
  if (structure === 'trial') {
    return (
      <>
        {/* "Roundtable" matches the in-chat phase header
            (roundtable-group.tsx) that labels this same first-answers
            fan-out in every structure — so the recipe and the thread name
            the phase identically. ("Roundtable" is also Parallel's internal
            structure id, but the user-facing structure name is "Parallel
            answers", so there's no clash.) */}
        <SectionHeader
          divider={false}
          icon={<LuUsersRound size={14} aria-hidden />}
        >
          Roundtable
        </SectionHeader>
        <ParticipantField structure={structure} binding={binding} />

        <SectionHeader icon={<LuListChecks size={14} aria-hidden />}>
          Voting
        </SectionHeader>
        <DimensionsField
          label="Voting rating dimensions"
          caption={
            <span>
              One <code>name: description</code> per line — each becomes a 1–5
              rating. Tailor the rubric to the council's domain.
            </span>
          }
          value={binding.votingDimensions.value}
          defaultValue={binding.votingDimensions.defaultValue}
          onChange={binding.votingDimensions.onChange}
        />
        <PromptField
          label="Voting system prompt"
          caption="Sent to each Participant when rating peers' answers. Voters see anonymous labels (Model A, B, …), so they rate on merit, not brand."
          value={binding.votingSystem.value}
          defaultValue={binding.votingSystem.defaultValue}
          onChange={binding.votingSystem.onChange}
          rows={4}
        />
        <PromptField
          label="Voting user-message template"
          caption={
            <span>
              Placeholders: <code>{'{question}'}</code>,{' '}
              <code>{'{answers}'}</code> (the anonymized answers),{' '}
              <code>{'{dimensionsDescription}'}</code>,{' '}
              <code>{'{commentRequirement}'}</code>.
            </span>
          }
          value={binding.votingTemplate.value}
          defaultValue={binding.votingTemplate.defaultValue}
          onChange={binding.votingTemplate.onChange}
          rows={4}
        />

        <SectionHeader icon={<STRUCTURE_ICON.trial size={14} aria-hidden />}>
          Judge
        </SectionHeader>
        {binding.judgeSystem && (
          <PromptField
            label="Judge system prompt"
            caption="Sent to the Judge, which sees real model names — only voters get anonymized answers."
            value={binding.judgeSystem.value}
            defaultValue={binding.judgeSystem.defaultValue}
            onChange={binding.judgeSystem.onChange}
            rows={4}
          />
        )}
        <PromptField
          label="Judge user-message template"
          caption={
            <span>
              Placeholders: <code>{'{question}'}</code>,{' '}
              <code>{'{answers}'}</code> (named answers),{' '}
              <code>{'{leaderboard}'}</code> (average ratings),{' '}
              <code>{'{comments}'}</code> (voter free-text).
            </span>
          }
          value={binding.judgeTemplate.value}
          defaultValue={binding.judgeTemplate.defaultValue}
          onChange={binding.judgeTemplate.onChange}
          rows={6}
        />
      </>
    )
  }

  if (structure === 'consensus') {
    return (
      <>
        <SectionHeader
          divider={false}
          icon={<LuUsersRound size={14} aria-hidden />}
        >
          Roundtable
        </SectionHeader>
        <ParticipantField structure={structure} binding={binding} />

        <SectionHeader icon={<PiChatsBold size={14} aria-hidden />}>
          Reconsider
        </SectionHeader>
        <ReconsiderInputField binding={binding} />
        <PromptField
          label="Reconsider system prompt"
          caption="Sent when a Participant reconsiders its answer between rounds. Layers on top of any per-seat prompt."
          value={binding.reanswerSystem.value}
          defaultValue={binding.reanswerSystem.defaultValue}
          onChange={binding.reanswerSystem.onChange}
          rows={5}
        />
        <PromptField
          label="Reconsider user-message template"
          caption={
            <span>
              Placeholders: <code>{'{question}'}</code>,{' '}
              <code>{'{ownAnswer}'}</code> (its prior answer),{' '}
              <code>{'{divergence}'}</code> (Mediator's disagreements — empty
              when off), <code>{'{peerAnswers}'}</code> (peers' anonymized
              answers — empty when off), <code>{'{round}'}</code>,{' '}
              <code>{'{maxRounds}'}</code>.
            </span>
          }
          value={binding.reanswerTemplate.value}
          defaultValue={binding.reanswerTemplate.defaultValue}
          onChange={binding.reanswerTemplate.onChange}
          rows={6}
        />

        <SectionHeader icon={<STRUCTURE_ICON.consensus size={14} aria-hidden />}>
          Mediator
        </SectionHeader>
        <BehaviorNumberField
          label="Max debate rounds"
          caption="The Mediator stops early on convergence. Each round costs one Mediator call plus a re-answer per Participant — the main cost lever."
          value={binding.mediatorMaxRounds.value}
          defaultValue={binding.mediatorMaxRounds.defaultValue}
          min={1}
          max={5}
          step={1}
          onChange={binding.mediatorMaxRounds.onChange}
        />
        {binding.mediatorSystem && (
          <PromptField
            label="Mediator system prompt"
            caption="Sent to the Mediator each round: judge convergence, distill the open disagreements, and report who moved."
            value={binding.mediatorSystem.value}
            defaultValue={binding.mediatorSystem.defaultValue}
            onChange={binding.mediatorSystem.onChange}
            rows={6}
          />
        )}
        <PromptField
          label="Mediator user-message template"
          caption={
            <span>
              Placeholders: <code>{'{question}'}</code>,{' '}
              <code>{'{answers}'}</code>, <code>{'{round}'}</code> (1-indexed),{' '}
              <code>{'{maxRounds}'}</code>, <code>{'{priorTranscript}'}</code>{' '}
              (compressed earlier rounds this turn — empty on round 1).
            </span>
          }
          value={binding.mediatorTemplate.value}
          defaultValue={binding.mediatorTemplate.defaultValue}
          onChange={binding.mediatorTemplate.onChange}
          rows={8}
        />
      </>
    )
  }

  // roundtable (Parallel) + custom — just the base Participant voice.
  return <ParticipantField structure={structure} binding={binding} />
}
