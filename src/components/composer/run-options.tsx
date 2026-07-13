/**
 * The composer's run controls — three compact triggers on the composer's
 * action row (split from one combined popover):
 *
 *   - **Thinking** (brain icon): the thinking-dial override (Default / Off /
 *     Low / Med / High / Max — one ordinal scale, no separate on/off toggle)
 *     applied to every reasoning-capable role — seats *and* the Judge /
 *     Mediator, live sends and retries alike — with per-role disclosure rows
 *     showing what the armed rung is actually sent as on each model. The
 *     armed level reads on the trigger as a short accent label ("High").
 *   - **Tools** (wrench icon): one switch per provider tool any seat has
 *     enabled (Web search, Code execution, …), pre-set from the seats' own
 *     config — switching off mutes that tool for upcoming sends; a tool no
 *     seat enables isn't listed (you can't force-on what per-seat config
 *     disables). Armed state reads as "Off" (all muted) / "1 off" (partial).
 *   - **Council settings** (sliders icon): opens the council-settings modal,
 *     where durable per-seat setup lives — promoted from the old popover's
 *     easy-to-miss footer link to a first-class trigger. Wears an accent dot
 *     when the council departs from plain defaults (custom recipe or a tuned
 *     seat / Judge / Mediator).
 *
 * The combined popover read as a junk drawer (two unrelated levers behind
 * one abstract sliders glyph), and its worded trigger summary ("Web search
 * off · Think: high") was too wide for phones, degrading to a bare accent
 * dot that named nothing. Split, each trigger's indicator is short enough
 * to show on **every** width — the armed state is always legible at a
 * glance, which is what makes sticky state safe to carry.
 *
 * Tool mutes + the thinking override stay **sticky per council** — they
 * hold for every following message until changed back (a per-message reset
 * shipped first and lost to real use, where re-arming "keep search off" on
 * every send was pure friction).
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Checkbox, STYLE_TYPE } from 'baseui/checkbox'
import { StatefulPopover, PLACEMENT } from 'baseui/popover'
import { Segment, SegmentedControl } from 'baseui/segmented-control'
import { LabelXSmall } from 'baseui/typography'
import { LuBrain, LuSlidersHorizontal, LuWrench } from 'react-icons/lu'
import { menuPopoverWithArrowOverrides } from '@/utils/popover-styles'
import { describeReasoningResolution } from '@/providers/reasoning'
import type { ModelEntry } from '@/models/registry'
import type { ReasoningEffortValue } from '@/components/seat-config/reasoning-field'

/** One provider tool at least one seat has enabled — a switch row. */
export interface ComposerToolOption {
  name: string
  label: string
  /** Seats whose config enables the tool / seats whose model offers it —
   *  captions the row when the roster disagrees ("On for 1 of 3 seats"). */
  enabledSeats: number
  toolSeats: number
}

/** One reasoning-capable role — a disclosure row in the Thinking popover
 *  ("Opus 4.8 · max effort"). `seatEffort` is the role's own sticky setting,
 *  shown when the override is Default (the override cascade is
 *  `override ?? seatEffort` — same rule as `resolveReasoningEffort`).
 *  `role` marks the Judge / Mediator rows: the override governs their calls
 *  too, and the marker also disambiguates a synthesiser sharing a seat's
 *  model (seat rows carry no marker). */
export interface ComposerReasoningSeat {
  entry: ModelEntry
  seatEffort?: ReasoningEffortValue | undefined
  role?: 'Judge' | 'Mediator' | undefined
}

const REASONING_DEFAULT_KEY = 'default'
// "Med", not "Medium": six segments share the popover's 320px, ~53px each —
// the full word ellipsises (same reason the seat-config field abbreviates).
const REASONING_OPTIONS = [
  { key: REASONING_DEFAULT_KEY, label: 'Default' },
  { key: 'off', label: 'Off' },
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Med' },
  { key: 'high', label: 'High' },
  { key: 'max', label: 'Max' },
]
/** Trigger-indicator forms — abbreviated so the armed state stays a few
 *  characters wide and fits phones (the popover discloses the full story). */
const REASONING_SHORT: Record<ReasoningEffortValue, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  max: 'Max',
}

const trigger = {
  iconSize: 15,
  buttonOverrides: {
    BaseButton: {
      style: { paddingLeft: '8px', paddingRight: '8px' },
    },
  },
} as const

/** The trigger's face: icon + optional compact armed-state label. A text
 *  `indicator` also turns the icon accent (the trigger names its armed state);
 *  a `dot` renders a small accent corner-dot over the icon instead — for state
 *  that can't be spelled in a word, like "this council has custom settings"
 *  (mirrors the per-seat dot on the roster's configure toggle). */
function TriggerFace({
  icon,
  indicator,
  dot,
}: {
  icon: ReactNode
  indicator?: string | undefined
  dot?: boolean | undefined
}) {
  const [css, theme] = useStyletron()
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '12px',
        ...(indicator ? { color: theme.colors.accent } : {}),
      })}
    >
      <span className={css({ position: 'relative', display: 'inline-flex' })}>
        {icon}
        {dot && (
          <span
            aria-hidden
            className={css({
              position: 'absolute',
              top: '-3px',
              right: '-4px',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: theme.colors.accent,
              // A surface-colored ring cuts the dot out from the glyph behind
              // it. Theme-aware, not a literal white: near-white on the light
              // composer, dark on the dark one — a hard white ring would glow
              // on the dark surface. boxShadow so it adds no layout box.
              boxShadow: `0 0 0 1.5px ${theme.colors.backgroundPrimary}`,
            })}
          />
        )}
      </span>
      {indicator && (
        <span className={css({ fontWeight: 600, whiteSpace: 'nowrap' })}>
          {indicator}
        </span>
      )}
    </span>
  )
}

/** Shared popover card chrome: width, padding, icon + uppercase title.
 *  The header wears the same glyph as the trigger below it, tying the
 *  floating card back to the control that opened it. */
function PopoverCard({
  icon,
  title,
  width,
  children,
}: {
  icon: ReactNode
  title: string
  width: string
  children: ReactNode
}) {
  const [css, theme] = useStyletron()
  return (
    <div
      className={css({
        width,
        maxWidth: 'calc(100vw - 48px)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      })}
    >
      <span
        className={css({
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: theme.colors.contentTertiary,
        })}
      >
        {icon}
        <LabelXSmall
          marginTop="0"
          marginBottom="0"
          color="contentTertiary"
          overrides={{
            Block: {
              style: {
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              },
            },
          }}
        >
          {title}
        </LabelXSmall>
      </span>
      {children}
    </div>
  )
}

/** Footer caption carrying the scope story (sticky, this council). */
function ScopeCaption({ children }: { children: ReactNode }) {
  return (
    <LabelXSmall
      marginTop="0"
      marginBottom="0"
      color="contentTertiary"
      overrides={{ Block: { style: { fontWeight: 400 } } }}
    >
      {children}
    </LabelXSmall>
  )
}

/** Brain trigger → the segmented thinking dial (Default / Off / Low / Med /
 *  High / Max) plus a per-seat disclosure of what the armed rung *actually
 *  becomes* on each model — the same one-dial-many-encodings rule as
 *  `providers/reasoning.ts`, surfaced so a mixed council is never a
 *  surprise (mirrors the Tools popover's per-seat availability captions). */
function ThinkingControl({
  reasoningSeats,
  reasoningEffort,
  onChangeReasoning,
  disabled,
}: {
  reasoningSeats: ComposerReasoningSeat[]
  reasoningEffort: ReasoningEffortValue | null
  onChangeReasoning: (next: ReasoningEffortValue | null) => void
  disabled: boolean
}) {
  const [css, theme] = useStyletron()
  const indicator = reasoningEffort
    ? REASONING_SHORT[reasoningEffort]
    : undefined
  const label = reasoningEffort
    ? `Thinking: ${reasoningEffort} — for upcoming messages`
    : 'Thinking effort for upcoming messages'
  return (
    <StatefulPopover
      placement={PLACEMENT.top}
      showArrow
      overrides={menuPopoverWithArrowOverrides(theme)}
      autoFocus={false}
      content={() => (
        // 320px (not the tools card's 280px) — the caption + per-seat
        // disclosure rows need the line length.
        <PopoverCard
          icon={<LuBrain size={13} />}
          title="Thinking"
          width="320px"
        >
          <SegmentedControl
            activeKey={reasoningEffort ?? REASONING_DEFAULT_KEY}
            onChange={({ activeKey: k }) =>
              onChangeReasoning(
                k === REASONING_DEFAULT_KEY
                  ? null
                  : (String(k) as ReasoningEffortValue),
              )
            }
            // Intrinsic, not fixed: six labels can't share equal slots at
            // this card width without ellipsising ("Defa…", "M…" — the
            // active thumb's own padding eats further into its slot). Each
            // segment hugs its word instead; "Default" gets the room it
            // needs and the whole row still ends short of the card edge.
            fill="intrinsic"
          >
            {REASONING_OPTIONS.map((o) => (
              <Segment
                key={o.key}
                label={o.label}
                overrides={{
                  Segment: {
                    // MUST be `paddingInline` — the stock Segment pads with
                    // that logical property (16px/side), and an override only
                    // wins deterministically when it names the *same*
                    // property (Base Web merges the style objects). A
                    // paddingLeft/Right override coexists with the base's
                    // paddingInline and loses the cascade — six segments'
                    // 32px-each padding then overflow the card and flex-
                    // shrink ellipsises every label.
                    style: { paddingInline: '6px' },
                  },
                  Label: {
                    style: { fontSize: '12px', lineHeight: '16px' },
                  },
                }}
              />
            ))}
          </SegmentedControl>
          <ScopeCaption>
            Applies to upcoming messages and retries, on every model listed
            below. Default keeps each one's own setting.
          </ScopeCaption>
          {/* Per-seat resolution: what the armed rung is sent as, per model
              (each provider encodes the dial differently — effort string,
              token budget, or nothing to adjust). Under Default this shows
              each seat's own sticky setting, so the cascade stays legible. */}
          <div
            className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              paddingTop: '8px',
              marginTop: '8px',
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            {reasoningSeats.map((s, i) => (
              <div
                key={`${s.entry.modelId}-${i}`}
                className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '11px',
                  lineHeight: '16px',
                  color: theme.colors.contentTertiary,
                })}
              >
                <span
                  className={css({
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  })}
                >
                  {s.role ? `${s.entry.label} · ${s.role}` : s.entry.label}
                </span>
                <span className={css({ whiteSpace: 'nowrap' })}>
                  {describeReasoningResolution(
                    s.entry,
                    reasoningEffort ?? s.seatEffort,
                  )}
                </span>
              </div>
            ))}
          </div>
        </PopoverCard>
      )}
    >
      {/* The Button must be the popover's *direct* child — StatefulPopover
          clones its trigger handlers + anchor ref onto this element, so an
          intermediary wrapper component would swallow them and the popover
          would never open (regressed once when this was extracted). */}
      <Button
        type="button"
        kind={KIND.tertiary}
        size={SIZE.compact}
        disabled={disabled}
        aria-label={label}
        title={label}
        overrides={trigger.buttonOverrides}
      >
        <TriggerFace icon={<LuBrain size={trigger.iconSize} />} indicator={indicator} />
      </Button>
    </StatefulPopover>
  )
}

/** Wrench trigger → per-tool mute switches. */
function ToolsControl({
  toolOptions,
  mutedTools,
  onToggleTool,
  disabled,
}: {
  toolOptions: ComposerToolOption[]
  mutedTools: ReadonlySet<string>
  onToggleTool: (name: string, muted: boolean) => void
  disabled: boolean
}) {
  const [css, theme] = useStyletron()
  const mutedCount = toolOptions.filter((t) => mutedTools.has(t.name)).length
  const indicator =
    mutedCount === 0
      ? undefined
      : mutedCount === toolOptions.length
        ? 'Off'
        : `${mutedCount} off`
  const label = indicator
    ? `Tools for upcoming messages — ${
        indicator === 'Off' ? 'all off' : `${mutedCount} muted`
      }`
    : 'Tools for upcoming messages'
  return (
    <StatefulPopover
      placement={PLACEMENT.top}
      showArrow
      overrides={menuPopoverWithArrowOverrides(theme)}
      autoFocus={false}
      content={() => (
        <PopoverCard
          icon={<LuWrench size={13} />}
          title="Tools"
          width="280px"
        >
          {toolOptions.map((tool) => {
            const muted = mutedTools.has(tool.name)
            const mixed = tool.enabledSeats < tool.toolSeats
            return (
              <Checkbox
                key={tool.name}
                checked={!muted}
                checkmarkType={STYLE_TYPE.toggle_round}
                // Toggle first, then the name — trailing toggles land wherever
                // each label ends, so the switch column came out ragged.
                labelPlacement="right"
                onChange={(e) => onToggleTool(tool.name, !e.currentTarget.checked)}
                overrides={{
                  Root: { style: { alignItems: 'center' } },
                  Label: { style: { fontSize: '14px', lineHeight: '18px' } },
                }}
              >
                <span
                  className={css({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1px',
                  })}
                >
                  {tool.label}
                  {/* Mixed-roster caption only while the tool is on — a muted
                      row's toggle already says everything. */}
                  {mixed && !muted && (
                    <span
                      className={css({
                        fontSize: '11px',
                        lineHeight: '14px',
                        color: theme.colors.contentTertiary,
                        fontWeight: 400,
                      })}
                    >
                      {`On for ${tool.enabledSeats} of ${tool.toolSeats} seats`}
                    </span>
                  )}
                </span>
              </Checkbox>
            )
          })}
          <ScopeCaption>
            Applies to upcoming messages in this council.
          </ScopeCaption>
        </PopoverCard>
      )}
    >
      {/* Direct child of StatefulPopover — see the Thinking trigger. */}
      <Button
        type="button"
        kind={KIND.tertiary}
        size={SIZE.compact}
        disabled={disabled}
        aria-label={label}
        title={label}
        overrides={trigger.buttonOverrides}
      >
        <TriggerFace icon={<LuWrench size={trigger.iconSize} />} indicator={indicator} />
      </Button>
    </StatefulPopover>
  )
}

/** Sliders trigger → the council-settings modal (durable per-seat setup).
 *  Same glyph as the sidebar kebab's Settings row — one icon for "council
 *  settings" everywhere. Sliders, not the gear: the gear is app Settings.
 *  Wears an accent dot when the council departs from plain defaults (custom
 *  recipe or a tuned seat / Judge / Mediator), so the deviation reads without
 *  opening the modal — the label spells it out for assistive tech. */
function CouncilSettingsButton({
  onOpen,
  overridden,
}: {
  onOpen: () => void
  overridden: boolean
}) {
  const label = overridden
    ? 'Council settings — customized for this council'
    : 'Council settings — seats, models, always-on setup'
  return (
    <Button
      type="button"
      kind={KIND.tertiary}
      size={SIZE.compact}
      onClick={onOpen}
      aria-label={label}
      title={label}
      overrides={trigger.buttonOverrides}
    >
      <TriggerFace
        icon={<LuSlidersHorizontal size={trigger.iconSize} />}
        dot={overridden}
      />
    </Button>
  )
}

/** The trio, each self-gated: thinking needs a reasoning-capable seat,
 *  tools need at least one seat-enabled tool, settings needs an opener.
 *  Council settings sits nearest the send button — it's the least-used
 *  trigger. It's navigation, not an armed lever, so it carries no worded
 *  indicator; it does wear an accent dot when the council is customized. */
export function ComposerRunControls({
  toolOptions,
  reasoningSeats,
  mutedTools,
  onToggleTool,
  reasoningEffort,
  onChangeReasoning,
  disabled,
  onOpenCouncilSettings,
  settingsOverridden = false,
}: {
  toolOptions: ComposerToolOption[]
  /** Reasoning-capable seats — the Thinking popover's disclosure rows;
   *  empty hides the whole trigger (no fake affordance). */
  reasoningSeats: ComposerReasoningSeat[]
  /** Tool names muted for upcoming sends. */
  mutedTools: ReadonlySet<string>
  onToggleTool: (name: string, muted: boolean) => void
  /** Thinking override for upcoming sends; null = each seat's own setting. */
  reasoningEffort: ReasoningEffortValue | null
  onChangeReasoning: (next: ReasoningEffortValue | null) => void
  disabled: boolean
  /** Opens the council-settings modal (durable per-seat setup). */
  onOpenCouncilSettings?: (() => void) | undefined
  /** Council departs from defaults — dots the council-settings trigger. */
  settingsOverridden?: boolean | undefined
}) {
  return (
    <>
      {reasoningSeats.length > 0 && (
        <ThinkingControl
          reasoningSeats={reasoningSeats}
          reasoningEffort={reasoningEffort}
          onChangeReasoning={onChangeReasoning}
          disabled={disabled}
        />
      )}
      {toolOptions.length > 0 && (
        <ToolsControl
          toolOptions={toolOptions}
          mutedTools={mutedTools}
          onToggleTool={onToggleTool}
          disabled={disabled}
        />
      )}
      {onOpenCouncilSettings && (
        <CouncilSettingsButton
          onOpen={onOpenCouncilSettings}
          overridden={settingsOverridden}
        />
      )}
    </>
  )
}
