/**
 * New-council creation modal — coordinator.
 *
 * Composes: SocialStructurePicker, the shared RosterEditor (with per-seat
 * config), SynthesiserPicker (conditional on Trial / Consensus, also with
 * inline config), plus the FormModal scaffold. Owns the form state + the
 * validity check gating the Create button + the submit payload assembly.
 *
 * First run lands on the `<Onboarding>` empty state, not an
 * auto-created council; this modal opens on a manual "+ New council"
 * or the onboarding's "Create your first council" CTA. Seats (and the
 * Judge / Mediator) default to the first *reachable* model — never a
 * hardcoded Ollama seat the user can't actually call.
 *
 * **Per-seat config at creation**: every seat row and the
 * Judge / Mediator picker carry the same configure toggle the
 * council-settings modal has, expanding an inline `SeatConfigForm`
 * (persona / tools / thinking) — so an expert-panel council ("seat 1: tax
 * lawyer, seat 2: accountant") is composable in one pass instead of
 * create-then-reopen-settings. Collapsed by default so the fast path
 * (type → models → Create) stays exactly as fast; forms mount on first
 * expand and stay mounted (see `InlineConfigPanel`), and a never-opened
 * form contributes an empty config.
 *
 * The structural deliberation knobs live in a collapsed
 * "⟨Structure⟩ settings" Accordion — empty fields cascade to the global
 * Settings → Councils defaults.
 */

import { useMemo, useRef, useState } from 'react'
import { FormModal } from '@/components/form-modal'
import { CouncilRecipePanel } from '@/components/council-form/council-recipe-panel'
import { useConfigForms } from '@/components/council-form/use-config-forms'
import type { DeliberationFormHandle } from '@/components/council-settings/deliberation-form'
import {
  RosterEditor,
  type RosterRowView,
} from '@/components/roster-editor'
import type { SeatDraft } from '@/components/new-council/seat-draft-row'
import { SocialStructurePicker } from '@/components/new-council/social-structure-picker'
import { SeatConfigForm } from '@/components/seat-config/seat-config-form'
import {
  SynthesiserSection,
  type SynthesiserRole,
} from '@/components/synthesiser-section'
import type { CreateCouncilInput } from '@/storage/councils'
import { useApiKeys } from '@/hooks/use-api-keys'
import type { OllamaStatus } from '@/hooks/use-ollama-reachable'
import { useUserPrompts } from '@/hooks/use-user-prompts'
import {
  buildModelOptions,
  type ModelOption,
} from '@/components/model-options'
import { firstUsableModelId, pickSmartestModelIds } from '@/utils/usable-models'
import { uuid } from '@/utils/uuid'
import { DEFAULT_MODEL_ID, getModel } from '@/models/registry'
import {
  resolveParticipantDefault,
} from '@/storage/prompts'
import type { SeatConfig, SocialStructure } from '@/types/council'

/** Stable empty config for draft forms — nothing is persisted yet. */
const EMPTY_SEAT_CONFIG: SeatConfig = {}

export interface NewCouncilModalProps {
  onCancel: () => void
  onSubmit: (input: CreateCouncilInput) => Promise<void>
  /** Opt-in Ollama status (from the parent's `useOllamaReachable()`): the
   *  local model stays hidden until the toggle is on, greys out when the
   *  daemon is down, and the default seat is a model the user can call. */
  ollama: OllamaStatus
}

export function NewCouncilModal({
  onCancel,
  onSubmit,
  ollama,
}: NewCouncilModalProps) {
  const keys = useApiKeys()
  const userPrompts = useUserPrompts()
  // Seed new seats / synthesisers with the first model the user can
  // actually call, falling back to the registry default only when nothing
  // is reachable (the picker will then show it greyed).
  const usableModelId = firstUsableModelId(keys, ollama.reachable)
  const defaultModelId = usableModelId ?? DEFAULT_MODEL_ID
  // No reachable model at all — the Participants section leads with the
  // "add your keys to begin" callout (a guide for the user who skipped the
  // first-run onboarding gate and opened this modal anyway).
  const noUsableModel = usableModelId === null
  const [socialStructure, setSocialStructure] = useState<SocialStructure>(
    'roundtable',
  )
  const [seats, setSeats] = useState<SeatDraft[]>(() => [
    { id: uuid(), modelId: defaultModelId },
  ])
  // Whether the user has touched the roster (added / removed a seat, swapped
  // a model, or opened a seat's config). Until then the roster is ours to
  // re-seed when the structure changes — Trial / Consensus auto-fill their
  // two-seat floor, switching back to Parallel collapses to one. The moment
  // the user edits anything, structure switches only ever *top up* to the
  // floor, never remove or reshuffle their picks.
  const [rosterTouched, setRosterTouched] = useState(false)
  const [judgeModelId, setJudgeModelId] = useState<string>(defaultModelId)
  const [mediatorModelId, setMediatorModelId] =
    useState<string>(defaultModelId)
  const [submitting, setSubmitting] = useState(false)
  // Per-seat / per-role config: the shared mount-on-first-expand +
  // ref-collection machinery (`useConfigForms`). An opened seat config pins
  // that seat — its form is keyed by the seat id, so a structure-switch
  // re-seed would orphan the edits. (The 'judge' / 'mediator' keys aren't
  // seats and don't pin the roster.)
  const { expandedKeys, everExpanded, toggleConfig, registerForm, builtConfig } =
    useConfigForms({
      onToggle: (key) => {
        if (seats.some((s) => s.id === key)) setRosterTouched(true)
      },
    })
  // Handle for the optional structural deliberation overrides
  // (`CouncilRecipePanel`); never opened → ref null → no deliberation in
  // the payload.
  const deliberationRef = useRef<DeliberationFormHandle | null>(null)

  const modelOptions = useMemo<ModelOption[]>(
    () => buildModelOptions(keys, ollama),
    [keys, ollama],
  )

  // The seat baseline shown in un-overridden persona fields — the global
  // per-structure default, same cascade the orchestrator resolves (there's
  // no council-level participant override until this council exists).
  const participantDefault = resolveParticipantDefault(
    socialStructure,
    userPrompts,
  )?.trim()
  const participantSource = participantDefault ? 'your default' : 'the default'

  // Block Create when the selected structure requires a synthesiser
  // but the picker hasn't been resolved to a reachable model. The
  // storage layer enforces both too; the local check keeps the
  // button honest. With no usable model at all, Create is disabled
  // outright — the NoModelsCallout above the roster carries the "add
  // your keys" path, and creating would only seat a council whose
  // every send errors (the dead-seat state the first-run gate exists to prevent).
  const trialMissingJudge =
    socialStructure === 'trial' && !judgeModelId
  const consensusMissingMediator =
    socialStructure === 'consensus' && !mediatorModelId
  const canSubmit =
    !noUsableModel &&
    seats.length > 0 &&
    !trialMissingJudge &&
    !consensusMissingMediator &&
    !submitting

  /**
   * Model for an auto-added second seat: prefer a *usable* model from a
   * different provider than the first seat (a cross-vendor pair is the
   * product's whole point), then any other usable model, then — single
   * usable model — the same model twice. With nothing usable (keyless
   * preview; Create is disabled) the pick falls back to the full picker
   * pool so the preview still shows a plausible two-vendor roster.
   */
  function autoSecondSeatModelId(firstModelId: string): string {
    const firstProvider = modelOptions.find(
      (o) => o.id === firstModelId,
    )?.provider
    const usable = modelOptions.filter((o) => !o.disabled)
    const pool = usable.length > 0 ? usable : modelOptions
    const pick =
      pool.find(
        (o) => o.id !== firstModelId && o.provider !== firstProvider,
      ) ?? pool.find((o) => o.id !== firstModelId)
    return pick?.id ?? firstModelId
  }

  /**
   * Structure switch owns the roster floor: Trial / Consensus need two
   * Participants for their deliberation to exist at all, so we do the work
   * for the user — seed the second seat instead of warning about its
   * absence. While the roster is untouched it tracks the structure both
   * ways (back to Parallel collapses to one seat); once touched we only
   * ever top up to the floor.
   */
  function changeStructure(next: SocialStructure) {
    setSocialStructure(next)
    const needsTwo = next === 'trial' || next === 'consensus'
    setSeats((cur) => {
      const first = cur[0] ?? { id: uuid(), modelId: defaultModelId }
      if (!rosterTouched) {
        return needsTwo
          ? [
              first,
              { id: uuid(), modelId: autoSecondSeatModelId(first.modelId) },
            ]
          : [first]
      }
      if (needsTwo && cur.length < 2) {
        return [
          ...cur,
          { id: uuid(), modelId: autoSecondSeatModelId(first.modelId) },
        ]
      }
      return cur
    })
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const input: CreateCouncilInput = {
        id: uuid(),
        socialStructure,
        seats: seats.map((s) => ({
          id: s.id,
          modelId: s.modelId,
          // Never-opened forms contribute an empty config (all-cascade).
          config: builtConfig(s.id),
        })),
        ...(socialStructure === 'trial'
          ? {
              judge: {
                modelId: judgeModelId,
                config: builtConfig('judge'),
              },
            }
          : {}),
        ...(socialStructure === 'consensus'
          ? {
              mediator: {
                modelId: mediatorModelId,
                config: builtConfig('mediator'),
              },
            }
          : {}),
        // createCouncil sanitizes — an untouched (all-empty) bag is dropped.
        ...(deliberationRef.current
          ? { deliberation: deliberationRef.current.buildDeliberation() }
          : {}),
      }
      await onSubmit(input)
    } finally {
      setSubmitting(false)
    }
  }

  function addSeat() {
    setRosterTouched(true)
    setSeats((cur) => [
      ...cur,
      { id: uuid(), modelId: defaultModelId },
    ])
  }

  function changeSeatModel(seatId: string, modelId: string) {
    setRosterTouched(true)
    setSeats((cur) =>
      cur.map((s) => (s.id === seatId ? { ...s, modelId } : s)),
    )
  }

  function removeSeat(seatId: string) {
    setRosterTouched(true)
    setSeats((cur) => cur.filter((s) => s.id !== seatId))
  }

  /**
   * "Smartest available" preset — replace the roster with the strongest model
   * from each reachable provider (topped up to the structure's seat floor).
   * A deliberate roster choice, so it marks the roster touched (a later
   * structure switch tops up, never reshuffles these picks).
   */
  function applySmartest() {
    const minSeats =
      socialStructure === 'trial' || socialStructure === 'consensus' ? 2 : 1
    const modelIds = pickSmartestModelIds(keys, ollama.reachable, minSeats)
    if (modelIds.length === 0) return
    setRosterTouched(true)
    setSeats(modelIds.map((modelId) => ({ id: uuid(), modelId })))
  }

  const rowViews: RosterRowView[] = seats.map((s) => ({
    key: s.id,
    modelId: s.modelId,
    // Nothing is persisted at creation, so no "has customizations" dot.
    customized: false,
  }))

  /** The Judge / Mediator slot — the shared `SynthesiserSection` bound to
   *  creation state (empty config, no "customized" dot). */
  function synthesiserSection(role: SynthesiserRole) {
    const modelId = role === 'judge' ? judgeModelId : mediatorModelId
    const setModelId = role === 'judge' ? setJudgeModelId : setMediatorModelId
    return (
      <SynthesiserSection
        role={role}
        modelId={modelId}
        onChangeModel={setModelId}
        options={modelOptions}
        expanded={expandedKeys.has(role)}
        mounted={everExpanded.has(role)}
        onToggleConfig={() => toggleConfig(role)}
        customized={false}
        config={EMPTY_SEAT_CONFIG}
        userPrompts={userPrompts}
        registerForm={registerForm(role)}
      />
    )
  }

  return (
    <FormModal
      title="New council"
      onCancel={onCancel}
      onSubmit={() => void submit()}
      submitLabel="Create"
      submitDisabled={!canSubmit}
      submitting={submitting}
    >
      <SocialStructurePicker
        value={socialStructure}
        onChange={changeStructure}
      />
      <RosterEditor
        rows={rowViews}
        structure={socialStructure}
        modelOptions={modelOptions}
        noUsableModel={noUsableModel}
        expandedKeys={expandedKeys}
        onChangeModel={changeSeatModel}
        onToggleConfig={toggleConfig}
        onAdd={addSeat}
        onRemove={removeSeat}
        onApplySmartest={applySmartest}
        renderConfig={(key) => {
          const seat = seats.find((s) => s.id === key)
          if (!seat || !everExpanded.has(key)) return null
          return (
            <SeatConfigForm
              // Remount on model swap (see synthesiserSection).
              key={`${key}:${seat.modelId}`}
              ref={registerForm(key)}
              modelId={seat.modelId}
              config={EMPTY_SEAT_CONFIG}
              role="participant"
              effectiveDefault={
                participantDefault ||
                getModel(seat.modelId).defaultSystemPrompt
              }
              defaultSource={participantSource}
            />
          )
        }}
      />
      {socialStructure === 'trial' && synthesiserSection('judge')}
      {socialStructure === 'consensus' && synthesiserSection('mediator')}

      {/* Every structure has a per-council recipe (Parallel's is just its
          one Participant prompt). Titled "⟨Structure⟩ settings" — not
          "overrides": at creation there's nothing to override yet. */}
      <CouncilRecipePanel
        structure={socialStructure}
        deliberation={undefined}
        formRef={deliberationRef}
      />
    </FormModal>
  )
}
