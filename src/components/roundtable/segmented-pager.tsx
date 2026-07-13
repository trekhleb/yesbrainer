/**
 * Roundtable answer pager — provider-logo segments over the shared
 * `<SegmentedTabs>` chrome. One segment per Participant: idle shows just the
 * logo, the active segment expands to logo + label (hidden on phones), and
 * each logo carries a liveness dot (pulsing accent while streaming, red on
 * error). The look (track / sliding pill / shadow) lives in `SegmentedTabs`
 * so it stays in lockstep with the Mediator round pager.
 */

import { useStyletron } from 'baseui'
import { ProviderLogo } from '@/components/provider-logo'
import {
  ActiveSegmentLabel,
  SegmentedTabs,
} from '@/components/segmented-tabs'
import { getModel } from '@/models/registry'
import type { RoundtablePane } from '@/types/session'


export function SegmentedPager({
  panes,
  activeIdx,
  onJump,
  mode = 'switcher',
}: {
  panes: RoundtablePane[]
  activeIdx: number
  onJump: (idx: number) => void
  /** `legend` when the lane renders as the Compare grid — the strip keeps
   *  its identity/status jobs but a click *locates* (flashes) the column
   *  instead of switching to it. */
  mode?: 'switcher' | 'legend'
}) {
  return (
    <SegmentedTabs
      ariaLabel={mode === 'legend' ? 'Highlight an answer' : 'Jump to an answer'}
      activeIdx={activeIdx}
      onJump={onJump}
      mode={mode}
      tabs={panes.map((p) => {
        const label = p.displayLabel ?? getModel(p.modelId).label
        return {
          key: p.key,
          ariaLabel: label,
          content: (active: boolean) => (
            <SeatSegment pane={p} label={label} active={active} />
          ),
        }
      })}
    />
  )
}

function SeatSegment({
  pane,
  label,
  active,
}: {
  pane: RoundtablePane
  label: string
  active: boolean
}) {
  const [css] = useStyletron()
  const model = getModel(pane.modelId)
  return (
    <>
      <span
        className={css({
          position: 'relative',
          display: 'inline-flex',
          flexShrink: 0,
        })}
      >
        <ProviderLogo provider={model.provider} size={15} />
        <StatusDot status={pane.status} />
      </span>
      {active && <ActiveSegmentLabel>{label}</ActiveSegmentLabel>}
    </>
  )
}

/**
 * Liveness dot pinned to a segment's provider logo. Streaming seats pulse
 * in the accent colour; errored seats show a steady red dot; done seats
 * show nothing (the control goes calm once the round settles).
 */
function StatusDot({ status }: { status: RoundtablePane['status'] }) {
  const [css, theme] = useStyletron()
  if (status === 'done') return null
  const color =
    status === 'error' ? theme.colors.negative : theme.colors.accent
  return (
    <span
      aria-hidden
      className={css({
        position: 'absolute',
        right: '-3px',
        top: '-3px',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        backgroundColor: color,
        boxSizing: 'border-box',
        border: `1.5px solid ${theme.colors.backgroundSecondary}`,
        ...(status === 'streaming'
          ? {
              animationName: {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.35 },
                '100%': { opacity: 1 },
              },
              animationDuration: '1.2s',
              animationIterationCount: 'infinite',
              animationTimingFunction: 'ease-in-out',
            }
          : {}),
      })}
    />
  )
}
