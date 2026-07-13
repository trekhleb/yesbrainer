/**
 * The Participants section shared by the **New-council** and
 * **Council-settings** modals — one component so the two rosters can't
 * drift (it merged the create modal's `SeatsListEditor` with the settings
 * modal's roster editor once both grew per-seat config).
 *
 * Each row is a model picker (`SeatDraftRow`) with a configure toggle that
 * expands an inline per-seat config form — the parent owns the row drafts,
 * the expanded set, and the forms (it reads them on Create / Save), and
 * injects each form via `renderConfig`. "+ Add seat" appends a row; the
 * remove button hides at the structure's seat floor (2 for Trial /
 * Consensus — their deliberation needs a second voice — 1 for Parallel).
 *
 * When the user has *no* usable model at all (no keys configured, and no
 * opt-in Ollama reachable), a prominent `NoModelsCallout` leads the
 * section: nothing can actually be seated, so we guide them to Settings →
 * Keys rather than leave them on a picker full of greyed-out rows. The
 * seat rows still render below it as a (greyed) preview of how seating
 * works once a key lands.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { FormControl } from 'baseui/form-control'
import { LabelMedium, ParagraphXSmall } from 'baseui/typography'
import { FiKey, FiPlus } from 'react-icons/fi'
import { LuUsersRound, LuSparkles } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { ConfigToggleButton } from '@/components/config-toggle-button'
import { InlineConfigPanel } from '@/components/inline-config-panel'
import { SeatDraftRow } from '@/components/new-council/seat-draft-row'
import type { ModelOption } from '@/components/model-options'
import type { SocialStructure } from '@/types/council'

export interface RosterRowView {
  key: string
  modelId: string
  /** Persisted per-seat customizations exist — marks the row's configure
   *  toggle with a dot. Always false at creation (nothing persisted yet). */
  customized: boolean
}

/**
 * Example labels for the "Smartest available" tooltip — each reachable
 * provider's `smartest`-flagged model, OpenRouter excluded. Derived from the
 * live `modelOptions` (which mirror the registry flag) so the copy names
 * exactly what `pickSmartestModelIds` would seat — never a retired model,
 * never a parallel rule that could drift.
 */
function smartestExampleLabels(modelOptions: ModelOption[]): string[] {
  return modelOptions
    .filter((o) => o.smartest && !o.disabled && o.provider !== 'openrouter')
    .map((o) => o.label)
}

export function RosterEditor({
  rows,
  structure,
  modelOptions,
  noUsableModel,
  expandedKeys,
  onChangeModel,
  onToggleConfig,
  onAdd,
  onRemove,
  onApplySmartest,
  renderConfig,
  onNavigateToKeys,
}: {
  rows: RosterRowView[]
  structure: SocialStructure
  modelOptions: ModelOption[]
  /** No provider key configured (and no opt-in Ollama reachable) — nothing
   *  can be seated, so the section leads with the "add your keys" callout. */
  noUsableModel: boolean
  expandedKeys: ReadonlySet<string>
  onChangeModel: (key: string, modelId: string) => void
  onToggleConfig: (key: string) => void
  onAdd: () => void
  onRemove: (key: string) => void
  /** "Smartest available" preset — replaces the roster with the strongest
   *  model from each reachable provider. Optional: only surfaces the button
   *  where the parent wires it (the New-council modal), and it self-hides
   *  when `noUsableModel` (the add-keys callout is the only action then). */
  onApplySmartest?: () => void
  /** The row's inline config form, or null while the row has never been
   *  expanded (the parent mounts forms on first expand — a form must first
   *  mount *visible* so its segmented controls measure correctly — and
   *  keeps them mounted through collapses so hidden edits survive). */
  renderConfig: (key: string) => ReactNode
  /** Called after the keys callout / caption link navigates to
   *  Settings → Keys — lets a state-driven modal (Council-settings) close
   *  itself; the New-council modal closes via its query param on its own. */
  onNavigateToKeys?: () => void
}) {
  const [css, theme] = useStyletron()

  // Trial / Consensus need someone to vote on / debate with, so those
  // structures keep a two-seat floor; Parallel's floor is one. The remove
  // button hides at the floor (same convention as the old only-seat rule) —
  // the New-council modal auto-seeds up to the floor, and post-creation
  // edits can't dip below it.
  const minSeats = structure === 'trial' || structure === 'consensus' ? 2 : 1

  // Tooltip copy for the "Smartest available" preset, derived live from the
  // reachability-resolved options so it never names a retired model.
  const smartestExamples = smartestExampleLabels(modelOptions)
  const smartestTitle =
    smartestExamples.length > 0
      ? `Top model from each provider you can reach — e.g. ${smartestExamples
          .slice(0, 3)
          .join(', ')}`
      : 'Top model from each provider you can reach'

  return (
    <FormControl
      label={
        <span
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          })}
        >
          <span
            className={css({
              display: 'inline-flex',
              color: theme.colors.contentSecondary,
            })}
          >
            <LuUsersRound size={15} aria-hidden />
          </span>
          <span>Participants</span>
        </span>
      }
    >
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        })}
      >
        {noUsableModel && <NoModelsCallout onNavigate={onNavigateToKeys} />}
        {rows.map((row) => {
          const expanded = expandedKeys.has(row.key)
          const config = renderConfig(row.key)
          return (
            <div key={row.key}>
              <SeatDraftRow
                seat={{ id: row.key, modelId: row.modelId }}
                options={modelOptions}
                onChange={(modelId) => onChangeModel(row.key, modelId)}
                onRemove={
                  rows.length > minSeats ? () => onRemove(row.key) : undefined
                }
                trailing={
                  <ConfigToggleButton
                    expanded={expanded}
                    customized={row.customized}
                    onClick={() => onToggleConfig(row.key)}
                  />
                }
              />
              {config != null && (
                <InlineConfigPanel expanded={expanded}>
                  {config}
                </InlineConfigPanel>
              )}
            </div>
          )
        })}
        <div
          className={css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '4px',
          })}
        >
          <Button
            type="button"
            kind={KIND.secondary}
            size={SIZE.compact}
            onClick={onAdd}
          >
            <span
              className={css({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              })}
            >
              <FiPlus size={14} aria-hidden /> Add seat
            </span>
          </Button>
          {/* "Smartest available" preset — one flagship per reachable
              provider. Hidden with no usable model (the add-keys callout
              leads instead), and only when the parent wires the handler. */}
          {onApplySmartest && !noUsableModel && (
            <Button
              type="button"
              kind={KIND.secondary}
              size={SIZE.compact}
              onClick={onApplySmartest}
              overrides={{
                BaseButton: {
                  props: {
                    title: smartestTitle,
                  },
                },
              }}
            >
              <span
                className={css({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                })}
              >
                <LuSparkles size={14} aria-hidden /> Smartest available
              </span>
            </Button>
          )}
        </div>
      </div>
    </FormControl>
  )
}

/**
 * Shown atop the Participants section when no model is reachable: a clear
 * "you have nothing to seat yet" message + a primary CTA into Settings →
 * Keys. In the New-council modal, navigating there drops the `?new-council`
 * query param, which closes that modal on its own (see
 * `useNewCouncilDeepLink`); the Council-settings modal closes itself via
 * `onNavigate`.
 */
function NoModelsCallout({ onNavigate }: { onNavigate?: () => void }) {
  const [css, theme] = useStyletron()
  const navigate = useNavigate()
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '16px',
        marginBottom: '4px',
        backgroundColor: theme.colors.backgroundSecondary,
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '12px',
      })}
    >
      <LabelMedium marginTop="0" marginBottom="0">
        No models to seat yet
      </LabelMedium>
      <ParagraphXSmall
        marginTop="0"
        marginBottom="0"
        color="contentTertiary"
      >
        Add a provider key to seat your council. The picker below previews
        how it’ll work once a model is available.
      </ParagraphXSmall>
      <Button
        type="button"
        size={SIZE.compact}
        onClick={() => {
          void navigate('/settings/keys')
          onNavigate?.()
        }}
        startEnhancer={() => <FiKey size={14} />}
      >
        Add your keys to begin
      </Button>
    </div>
  )
}
