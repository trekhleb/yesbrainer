/**
 * The horizontal card lane shared by the Roundtable / Reconsider answers and
 * the Voting targets — extracted when the Compare grid landed so the two
 * lanes can't drift: they used to hold identical inline
 * scroller + track markup, and the grid/carousel branch would have doubled
 * that duplication.
 *
 * Two layouts (decided per lane by `useLaneLayout`):
 *  - `carousel` — the focus carousel: `overflow-x` scroller, center snap,
 *    container-type for the cards' `cqi` peek widths. DOM contract for
 *    `useCarousel`: `scroller > track(flex) > card[]` — keep the one
 *    wrapping track div.
 *  - `grid` — the desktop Compare view: no scrolling, all cards visible.
 *    `flex-start` alignment (each card ends where its content ends — equal-
 *    height stretch left big empty card bottoms), centered so capped-width
 *    columns don't hug the left edge on ultrawide screens.
 *
 * The Mediator round lane keeps its own markup on purpose — rounds are a
 * timeline, never a grid.
 */

import { useStyletron } from 'baseui'
import { LANE_GAP_PX, type LaneLayout } from '@/hooks/use-lane-layout'

export function CardLane({
  layout,
  scrollerRef,
  onScroll,
  children,
}: {
  layout: LaneLayout
  /** The measured + scrolled element — the same ref `useCarousel` and
   *  `useLaneLayout` hold, so it must land on the outer element in both
   *  layouts. */
  scrollerRef: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  children: React.ReactNode
}) {
  const [css] = useStyletron()
  const grid = layout === 'grid'
  return (
    <div
      ref={scrollerRef}
      onScroll={onScroll}
      className={css(
        grid
          ? {}
          : {
              overflowX: 'auto',
              overflowY: 'hidden',
              // A little bottom room so pane shadows / borders aren't
              // clipped by the scroll container.
              paddingBottom: '2px',
              // Snap each pane to the center on touch — without this,
              // swipes on mobile drift between panes which feels imprecise.
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              // Container for the panes' `cqi` peek widths.
              containerType: 'inline-size',
            },
      )}
    >
      <div
        className={css({
          display: 'flex',
          gap: `${LANE_GAP_PX}px`,
          ...(grid
            ? {
                // Cards self-size vertically; centered so max-width-capped
                // columns share the leftover space on very wide lanes.
                alignItems: 'flex-start',
                justifyContent: 'center',
              }
            : { alignItems: 'stretch' }),
        })}
      >
        {children}
      </div>
    </div>
  )
}
