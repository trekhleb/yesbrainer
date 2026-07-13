/**
 * Lane layout switch — carousel vs the desktop **Compare grid**.
 *
 * A multi-card lane (Roundtable / Reconsider answers, Voting targets) renders
 * as the focus **carousel** (one ~80%-wide card, dimmed peeks, snap, pager) —
 * the base pattern everywhere — or, when the lane is wide enough to give
 * every card a readable column, as a side-by-side **grid**: all cards at
 * once, equal width, full opacity. Grid iff
 * `2 ≤ cardCount ≤ MAX_GRID_CARDS` **and** every card gets at least
 * `MIN_GRID_CARD_PX`.
 *
 * The decision measures the **lane, not the viewport**: at the same window
 * width the sidebar being expanded (~300px) vs collapsed (~56px) swings the
 * lane by ~244px, so a viewport breakpoint would lie — and collapsing the
 * sidebar visibly earning an extra column is exactly the right behavior.
 * Phones can never pass the fit check (2 × 360 + 16 > any phone lane), so
 * mobile keeps the carousel by construction, not by a device sniff.
 *
 * The card-count cap is cognitive, not geometric: past three essay-length
 * columns simultaneous reading stops being comparison, and 4+ seats is
 * exactly where the carousel's "read one at a time" wins — so an ultrawide
 * still carousels a 4-seat council. The Mediator round lane deliberately
 * does NOT use this hook: rounds are a timeline, not parallel voices.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { StyleObject } from 'styletron-react'
import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

/** Gap between lane cards — shared with `<CardLane>` so the fit check and
 *  the rendered gap can't drift. */
export const LANE_GAP_PX = 16

/** Readability floor for a grid column (≈45ch of the 15px answer body —
 *  roomier than the ~330px cards phones already read fine). Below this,
 *  essay-length markdown stops being comfortably readable and the carousel
 *  is the better experience. 360 (down from the initial 400)
 *  so a MacBook at default scaling (1470–1512 logical, lane ~1130–1170px
 *  with the sidebar open) earns the 3-up grid without collapsing the rail. */
const MIN_GRID_CARD_PX = 360

/** Grid only up to three columns (see module doc — cognitive cap). */
const MAX_GRID_CARDS = 3

export type LaneLayout = 'carousel' | 'grid'

/** A lane card's layout mode — the two lane layouts plus `full`, the
 *  single-card fallback (no lane geometry; the caller decides whether
 *  to stretch). */
export type LaneCardLayout = LaneLayout | 'full'

/**
 * Shared card geometry for every lane card (Roundtable answer panes,
 * Voting targets, Mediator round cards):
 *
 *  - `carousel` — the ~80%-wide focus card with a peek of the next and
 *    scroll-snap; slightly wider on phones. `cqi` = 80% of the scroll
 *    container's inline size (`CardLane` sets `container-type:
 *    inline-size`); the `%` fallback is close enough where container
 *    units aren't supported.
 *  - `grid` — the desktop Compare view: equal flex columns. `minWidth: 0`
 *    so wide markdown (tables / code) scrolls inside the column instead
 *    of widening it.
 *  - `full` — no geometry (single card; the caller styles it).
 *
 * Both modes cap at 880px so cards don't get absurdly wide on ultrawide
 * monitors. One definition so the three lanes can't drift apart — these
 * numbers and the fit rule below (`MIN_GRID_CARD_PX`) are two halves of
 * the same layout contract.
 */
export function laneCardGeometry(layout: LaneCardLayout): StyleObject {
  switch (layout) {
    case 'carousel':
      return {
        flex: '0 0 auto',
        width: '82%',
        '@supports (width: 1cqi)': { width: '80cqi' },
        maxWidth: '880px',
        [MOBILE_MEDIA_QUERY]: {
          width: '84%',
          '@supports (width: 1cqi)': { width: '84cqi' },
        },
        scrollSnapAlign: 'center',
      }
    case 'grid':
      return { flex: '1 1 0%', minWidth: 0, maxWidth: '880px' }
    case 'full':
      return {}
  }
}

/** Pure fit rule, exported for tests / callers that already know a width. */
function laneLayoutFor(
  cardCount: number,
  laneWidth: number,
): LaneLayout {
  if (cardCount < 2 || cardCount > MAX_GRID_CARDS) return 'carousel'
  const needed =
    cardCount * MIN_GRID_CARD_PX + (cardCount - 1) * LANE_GAP_PX
  return laneWidth >= needed ? 'grid' : 'carousel'
}

/**
 * Live layout for a lane: measures `laneRef` (the scroller element both lane
 * components already own) synchronously before first paint — so a wide lane
 * never flashes a frame of carousel — then tracks resizes (window resizing,
 * sidebar expand/collapse) with a ResizeObserver.
 */
export function useLaneLayout(
  cardCount: number,
  laneRef: React.RefObject<HTMLElement | null>,
): LaneLayout {
  const [layout, setLayout] = useState<LaneLayout>('carousel')

  useLayoutEffect(() => {
    const el = laneRef.current
    if (!el) return
    const apply = () =>
      setLayout(laneLayoutFor(cardCount, el.getBoundingClientRect().width))
    // Synchronous first measure (pre-paint), then observe for changes —
    // same measure-then-set shape as `SegmentedTabs`' pill tracking.
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cardCount, laneRef])

  return layout
}

/**
 * Transient "locate" highlight for grid mode — clicking a legend segment
 * flashes a ring on the matching card (there's nothing to scroll to
 * horizontally; the pager's job demotes from switching to *finding*).
 * Returns the currently-flashed index (or null) and the trigger; re-clicks
 * restart the timer, and the timer is cleaned up on unmount.
 */
export function useLocateFlash(): {
  flashIdx: number | null
  flash: (idx: number) => void
} {
  const [flashIdx, setFlashIdx] = useState<number | null>(null)
  const timerRef = useRef(0)

  const flash = useCallback((idx: number) => {
    setFlashIdx(idx)
    clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFlashIdx(null), 1100)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { flashIdx, flash }
}
