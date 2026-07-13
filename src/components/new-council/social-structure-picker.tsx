/**
 * Three-segment radio picker for the council's deliberation shape.
 * Each segment carries icon artwork + one-line label + a longer
 * description — all sourced from the shared `SOCIAL_STRUCTURES`
 * metadata so the picker and the read-only council-header summary
 * can't drift.
 *
 * Colour identity comes from the structure palette (see
 * `social-structure-colors`): every segment's icon renders in its accent,
 * and the native sliding active frame is tinted with the *selected*
 * structure's colour — so it keeps Base Web's slide + colour-change
 * animation while signalling which mode is chosen.
 *
 * On mobile (<=600px) the segments stack into vertical cards (each tinted by
 * type, the selected one accent-ringed). The native frame only animates
 * horizontally, so it's hidden there; the per-card ring carries the
 * selection instead. See `segmentOverrides` for the flex reset that keeps
 * the descriptions from collapsing in the column layout.
 */

import { useStyletron } from 'baseui'
import { FormControl } from 'baseui/form-control'
import { FILL, Segment, SegmentedControl } from 'baseui/segmented-control'
import { DeliberationCardContent } from '@/components/deliberation-card-content'
import { segmentOverrides } from '@/components/new-council/segment-overrides'
import { structureColorSet } from '@/models/social-structure-colors'
import { SOCIAL_STRUCTURES } from '@/models/social-structures'
import type { SocialStructure } from '@/types/council'

export function SocialStructurePicker({
  value,
  onChange,
}: {
  value: SocialStructure
  onChange: (next: SocialStructure) => void
}) {
  const [, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  const selected = structureColorSet(value, isDark)
  // No label: the per-segment titles + descriptions already make the choice
  // self-explanatory. FormControl is kept for its consistent field spacing.
  return (
    <FormControl>
      <SegmentedControl
        activeKey={value}
        onChange={({ activeKey }) => onChange(activeKey as SocialStructure)}
        fill={FILL.fixed}
        overrides={{
          // Desktop: native neutral track. Mobile: drop the track + go
          // vertical with gaps so the segments read as standalone cards.
          SegmentList: {
            style: {
              '@media (max-width: 600px)': {
                flexDirection: 'column',
                gap: '8px',
                height: 'auto',
                overflow: 'visible',
                backgroundColor: 'transparent',
              },
            },
          },
          // The sliding frame, flat-tinted with the selected structure's
          // colour (animates as it slides between segments). Hidden on mobile,
          // where it can't slide vertically — the per-card ring takes over.
          // `selected.border` MUST stay the same token the keyboard/autofocus
          // ring uses in `segmentOverrides` ($focusVisible → `colors.border`):
          // a direct page load autofocuses this segment and paints that ring on
          // top of this frame, so if the two shades (or widths) differ the
          // selected segment looks gentle when clicked open but bolder when
          // refreshed. Keep this 1px in lockstep with that ring's 1px.
          Active: {
            style: {
              backgroundColor: selected.bg,
              border: `1px solid ${selected.border}`,
              '@media (max-width: 600px)': { display: 'none' },
            },
          },
        }}
      >
        {SOCIAL_STRUCTURES.map(({ id }) => {
          const colors = structureColorSet(id, isDark)
          return (
            <Segment
              key={id}
              // The whole card body (icon-chip left, title + description right)
              // renders as the segment label — the SAME `DeliberationCardContent`
              // the /about cards use, so the picker and the frontpage lay out
              // identically. Base Web's `artwork` / `description` slots are left
              // unused; `segmentOverrides` makes the label block full-width.
              label={<DeliberationCardContent structure={id} />}
              overrides={segmentOverrides(
                colors,
                theme.colors.backgroundSecondary,
              )}
            />
          )
        })}
      </SegmentedControl>
    </FormControl>
  )
}
