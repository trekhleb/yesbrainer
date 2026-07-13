/**
 * Council settings modal — one place to reconfigure everything about an
 * existing council. Opened from a council's ⋯ menu (any council, not just
 * the open one), so it loads the target council fresh from storage rather
 * than leaning on the live session.
 *
 * **Same layout as the New-council modal**: a vertical stack —
 * structure identity, Participants roster, Judge / Mediator, collapsed
 * "⟨Structure⟩ settings" recipe panel — so creating and editing a council
 * are the same learned surface. This replaced a per-seat horizontal tab row
 * (model-name tabs overflowed off-screen on phones, and the council's own
 * recipe hid as the last tab). Differences from creation: the structure is
 * fixed (it defines the council's history — shown as a pill, not a picker)
 * and each roster row expands an inline per-seat config form.
 *
 * The roster is fully editable: swap a seat's model, add / remove seats,
 * swap the Judge / Mediator model. Past turns are unaffected — every
 * persisted `TurnEvent` snapshots its own `modelId` — so roster edits only
 * shape future turns.
 *
 * A single **Save** flushes everything at once: roster additions + updates
 * first, removals after (so a fully swapped roster never transits through
 * zero seats), then Judge / Mediator, then the recipe. `onSaved` lets the
 * caller refresh the active session if it happens to be this council.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { toaster } from 'baseui/toast'
import { LabelMedium, ParagraphSmall, ParagraphXSmall } from 'baseui/typography'
import { FiCheckCircle } from 'react-icons/fi'
import { LuSlidersHorizontal } from 'react-icons/lu'
import { FormModal, ModalTitleWithIcon } from '@/components/form-modal'
import { LoadingText } from '@/components/loading-text'
import { StructurePill } from '@/components/structure-pill'
import { CouncilRecipePanel } from '@/components/council-form/council-recipe-panel'
import { useConfigForms } from '@/components/council-form/use-config-forms'
import type { DeliberationFormHandle } from '@/components/council-settings/deliberation-form'
import {
  RosterEditor,
  type RosterRowView,
} from '@/components/roster-editor'
import { SeatConfigForm } from '@/components/seat-config/seat-config-form'
import {
  SynthesiserSection,
  type SynthesiserRole,
} from '@/components/synthesiser-section'
import { useApiKeys } from '@/hooks/use-api-keys'
import type { OllamaStatus } from '@/hooks/use-ollama-reachable'
import { useUserPrompts } from '@/hooks/use-user-prompts'
import { getModel } from '@/models/registry'
import { firstUsableModelId } from '@/utils/usable-models'
import {
  addSeat,
  getCouncil,
  removeSeat,
  setDeliberation,
  setJudge,
  setMediator,
  updateSeat,
} from '@/storage/councils'
import {
  resolveCouncilParticipantDefault,
} from '@/storage/prompts'
import { buildModelOptions, type ModelOption } from '@/components/model-options'
import { isSeatConfigCustomized } from '@/utils/council-overrides'
import { uuid } from '@/utils/uuid'
import type { Council, SeatConfig } from '@/types/council'

/** One roster row being edited. `existingSeatId` is null for a seat added in
 *  this modal session (its `key` becomes the new seat's id on Save). */
interface RosterRow {
  key: string
  existingSeatId: string | null
  modelId: string
  config: SeatConfig
}

export function CouncilSettingsModal({
  councilId,
  ollama,
  onClose,
  onSaved,
}: {
  councilId: string
  /** Opt-in Ollama status (from the parent's `useOllamaReachable()`). */
  ollama: OllamaStatus
  onClose: () => void
  /** Fired after a successful save with the saved council's id — lets the
   *  app refresh the live session when this is the open council. */
  onSaved: (councilId: string) => void
}) {
  const [css] = useStyletron()
  const userPrompts = useUserPrompts()
  const keys = useApiKeys()
  const [council, setCouncil] = useState<Council | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<RosterRow[]>([])
  const [removedSeatIds, setRemovedSeatIds] = useState<string[]>([])
  const [judgeModelId, setJudgeModelId] = useState<string>('')
  const [mediatorModelId, setMediatorModelId] = useState<string>('')
  // Per-slot config forms: the shared mount-on-first-expand +
  // ref-collection machinery (`useConfigForms`). Save reads `builtConfig`
  // off each mounted form; never-opened slots fall back to their stored
  // config.
  const { expandedKeys, everExpanded, toggleConfig, registerForm, builtConfig } =
    useConfigForms()
  const deliberationRef = useRef<DeliberationFormHandle | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const c = await getCouncil(councilId)
        if (cancelled) return
        if (!c) {
          setLoadError('Council not found')
          return
        }
        setCouncil(c)
        setRows(
          c.seats.map((seat) => ({
            key: seat.id,
            existingSeatId: seat.id,
            modelId: seat.modelId,
            config: seat.config,
          })),
        )
        if (c.judge) setJudgeModelId(c.judge.modelId)
        if (c.mediator) setMediatorModelId(c.mediator.modelId)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [councilId])

  const modelOptions = useMemo<ModelOption[]>(
    () => buildModelOptions(keys, ollama),
    [keys, ollama],
  )
  // Nothing reachable (keys removed since creation / Ollama down) — the
  // roster leads with the same "add your keys" callout the create modal
  // shows; navigating there closes this modal (it's state-driven, so the
  // query-param trick that closes the New-council modal doesn't apply).
  const noUsableModel = firstUsableModelId(keys, ollama.reachable) === null

  // The seat baseline (shown un-overridden, and the per-seat Reset target)
  // is this council's participant setting if set, else the global
  // per-structure default — the same cascade the orchestrator resolves.
  const participantBaseline = council
    ? resolveCouncilParticipantDefault(
        council.deliberation,
        council.socialStructure,
        userPrompts,
      )?.trim()
    : undefined
  const participantSource = council?.deliberation?.participant?.trim()
    ? "this council's setting"
    : participantBaseline
      ? 'your default'
      : 'the default'

  function addRow() {
    const first = modelOptions.find((o) => !o.disabled)
    setRows((cur) => [
      ...cur,
      {
        key: uuid(),
        existingSeatId: null,
        modelId: String(first?.id ?? cur.at(-1)?.modelId ?? ''),
        config: {},
      },
    ])
  }

  function removeRow(key: string) {
    // Record the removal *outside* the setRows updater — updaters must stay
    // pure (StrictMode double-invokes them, which would queue the seat id
    // twice and make the second removeSeat throw seat_not_found).
    const seatId = rows.find((r) => r.key === key)?.existingSeatId
    if (seatId) {
      setRemovedSeatIds((ids) =>
        ids.includes(seatId) ? ids : [...ids, seatId],
      )
    }
    setRows((cur) => cur.filter((r) => r.key !== key))
  }

  async function save() {
    if (!council || rows.length === 0) return
    setSaving(true)
    try {
      // Additions + updates before removals, so a fully swapped roster never
      // passes through zero seats (removeSeat refuses to drop the last one).
      for (const row of rows) {
        const built = builtConfig(row.key, row.config)
        if (row.existingSeatId) {
          await updateSeat(council.id, row.existingSeatId, {
            modelId: row.modelId,
            config: built,
          })
        } else {
          await addSeat(council.id, {
            id: row.key,
            modelId: row.modelId,
            config: built,
          })
        }
      }
      for (const seatId of removedSeatIds) {
        await removeSeat(council.id, seatId)
      }
      if (council.judge && judgeModelId) {
        await setJudge(council.id, {
          modelId: judgeModelId,
          config: builtConfig('judge', council.judge.config),
        })
      }
      if (council.mediator && mediatorModelId) {
        await setMediator(council.id, {
          modelId: mediatorModelId,
          config: builtConfig('mediator', council.mediator.config),
        })
      }
      await setDeliberation(
        council.id,
        deliberationRef.current?.buildDeliberation() ??
          council.deliberation ??
          {},
      )
      onSaved(council.id)
      onClose()
      // The modal closes on save, so the app-level toast is the only
      // confirmation the change landed.
      toaster.positive(
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <FiCheckCircle size={16} aria-hidden />
          Council settings saved
        </span>,
      )
    } catch (e) {
      // Keep the modal (and the user's edits) open — a storage failure
      // shouldn't take the whole app down via the error boundary.
      toaster.negative(
        `Couldn’t save: ${e instanceof Error ? e.message : String(e)}`,
      )
    } finally {
      setSaving(false)
    }
  }

  /** The Judge / Mediator slot — the shared `SynthesiserSection` bound to
   *  the persisted slot (its config seeds the form + dots the toggle). */
  function synthesiserSection(role: SynthesiserRole) {
    if (!council) return null
    const slot = role === 'judge' ? council.judge : council.mediator
    if (!slot) return null
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
        customized={isSeatConfigCustomized(slot.config)}
        config={slot.config}
        userPrompts={userPrompts}
        registerForm={registerForm(role)}
      />
    )
  }

  const rowViews: RosterRowView[] = rows.map((row) => ({
    key: row.key,
    modelId: row.modelId,
    customized: isSeatConfigCustomized(row.config),
  }))

  return (
    <FormModal
      title={
        // Same sliders as the kebab's Settings row + the composer trigger
        // that open this modal.
        <ModalTitleWithIcon icon={<LuSlidersHorizontal size={18} aria-hidden />}>
          Council settings
        </ModalTitleWithIcon>
      }
      onCancel={onClose}
      onSubmit={council ? () => void save() : undefined}
      submitDisabled={!council || rows.length === 0}
      submitting={saving}
      // Don't pop the mobile keyboard into a prompt textarea on open.
      autoFocus={false}
    >
      {loadError ? (
        <ParagraphSmall marginTop="0" marginBottom="0" color="contentTertiary">
          Couldn’t load this council: {loadError}
        </ParagraphSmall>
      ) : !council ? (
        <ParagraphSmall marginTop="0" marginBottom="0">
          <LoadingText>Loading the council</LoadingText>
        </ParagraphSmall>
      ) : (
        <>
          {/* Which council this is — the modal opens from any council's ⋯
              menu, not just the open one. The structure is fixed after
              creation (it defines the council's history), hence a pill, not
              the create modal's picker. */}
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              marginBottom: '16px',
            })}
          >
            <StructurePill structure={council.socialStructure} />
            <LabelMedium
              marginTop="0"
              marginBottom="0"
              className={css({
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              })}
            >
              {council.title ?? 'Untitled council'}
            </LabelMedium>
          </div>

          <RosterEditor
            rows={rowViews}
            structure={council.socialStructure}
            modelOptions={modelOptions}
            noUsableModel={noUsableModel}
            onNavigateToKeys={onClose}
            expandedKeys={expandedKeys}
            onChangeModel={(key, modelId) =>
              setRows((cur) =>
                cur.map((r) => (r.key === key ? { ...r, modelId } : r)),
              )
            }
            onToggleConfig={toggleConfig}
            onAdd={addRow}
            onRemove={removeRow}
            renderConfig={(key) => {
              const row = rows.find((r) => r.key === key)
              if (!row || !everExpanded.has(key)) return null
              return (
                <SeatConfigForm
                  // Remount on model swap: tools / thinking support differ
                  // per model, so a form seeded for the old model would lie.
                  key={`${row.key}:${row.modelId}`}
                  ref={registerForm(row.key)}
                  modelId={row.modelId}
                  config={row.config}
                  role="participant"
                  effectiveDefault={
                    participantBaseline ||
                    getModel(row.modelId).defaultSystemPrompt
                  }
                  defaultSource={participantSource}
                />
              )
            }}
          />

          {synthesiserSection('judge')}
          {synthesiserSection('mediator')}

          <CouncilRecipePanel
            structure={council.socialStructure}
            deliberation={council.deliberation}
            customized={!!council.deliberation}
            formRef={deliberationRef}
          />

          <ParagraphXSmall
            marginTop="12px"
            marginBottom="0"
            color="contentTertiary"
          >
            Changes apply to upcoming turns; past responses are unaffected.
          </ParagraphXSmall>
        </>
      )}
    </FormModal>
  )
}
