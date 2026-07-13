/**
 * Provider-logo strip for a sidebar row — one tiny logo per seat in
 * registration order. Used as a glanceable "what models is this
 * council using?" summary. Falls back to a `?` glyph for stale model
 * ids that no longer exist in the registry (deletable-but-not-deleted
 * models from a previous release).
 *
 * `scroll` switches it to a single-row, horizontally-scrolling lane (the
 * council card's first row, sandwiched between the type pill and the
 * kebab): a large roster (10+ seats) scrolls instead of wrapping to a
 * second line or shoving the pill / kebab out of alignment. Each logo is
 * `flex-shrink: 0` so the icons keep their size and overflow rather than
 * squish. The strip is left-aligned, starting right after the type pill.
 * Default (wrap) mode is unchanged.
 */

import { useStyletron } from 'baseui'
import { LabelXSmall } from 'baseui/typography'
import { ProviderLogo } from '@/components/provider-logo'
import { registry } from '@/models/registry'

export function SeatLogos({
  modelIds,
  scroll = false,
}: {
  modelIds: string[]
  scroll?: boolean
}) {
  const [css, theme] = useStyletron()
  if (modelIds.length === 0) {
    return (
      <LabelXSmall
        marginTop="0"
        marginBottom="0"
        color={theme.colors.contentTertiary}
      >
        no seats
      </LabelXSmall>
    )
  }
  return (
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        ...(scroll
          ? {
              // Flexible, single-row lane that takes the space left between
              // the type pill and the kebab, and scrolls horizontally when
              // the roster is too wide to fit. Scrollbar hidden for a native
              // feel (same pattern as the council-header roster strip).
              flex: 1,
              minWidth: 0,
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              '::-webkit-scrollbar': { display: 'none' },
            }
          : {
              marginTop: '2px',
              flexWrap: 'wrap',
            }),
      })}
    >
      {modelIds.map((id, i) => {
        const entry = registry.find((m) => m.modelId === id)
        return (
          <span
            key={`${id}:${i}`}
            className={css({ display: 'inline-flex', flexShrink: 0 })}
          >
            {entry ? (
              <ProviderLogo provider={entry.provider} size={14} />
            ) : (
              <LabelXSmall
                marginTop="0"
                marginBottom="0"
                color={theme.colors.contentTertiary}
              >
                ?
              </LabelXSmall>
            )}
          </span>
        )
      })}
    </div>
  )
}
