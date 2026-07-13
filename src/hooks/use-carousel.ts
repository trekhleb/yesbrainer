/**
 * Horizontal center-snap carousel plumbing — the scroll math the Roundtable
 * answer lane uses, factored out so other "one card in focus, peek the next,
 * tab between them" lanes (the Mediator rounds) behave identically.
 *
 * Owns: the scroller ref, the active (centred) index, a `jumpTo(idx)` that
 * smooth-scrolls a card into the centre, and an `onScroll` handler that
 * tracks which card is nearest the lane centre. `initialIdx` is jumped to
 * (no animation) on first layout — the Mediator opens on its final round.
 *
 * Expected DOM: `scroller > track(flex) > card[]`. `jumpTo` / tracking read
 * `scroller.children[0].children[idx]`, so keep that one wrapping track div.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { scrollColumnTopIntoView } from '@/utils/scroll'

/**
 * Opacity of the out-of-focus (peek) cards in a carousel lane — the
 * in-focus card is fully opaque. Owned here (the module every lane shares)
 * so the Roundtable answer panes and the Mediator round cards can't drift:
 * they used to hold private copies with "kept in sync" comments, which is
 * drift with extra steps.
 */
export const PEEK_OPACITY = 0.45

export interface Carousel {
  scrollerRef: React.RefObject<HTMLDivElement | null>
  activeIdx: number
  jumpTo: (idx: number) => void
  onScroll: () => void
}

export function useCarousel(
  itemCount: number,
  opts?: { initialIdx?: number },
): Carousel {
  const initialIdx = opts?.initialIdx ?? 0
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [activeIdx, setActiveIdx] = useState(initialIdx)
  const rafRef = useRef(0)
  const didInitRef = useRef(false)

  // Scroll offset that centres card `idx` in the lane (rect-based so it's
  // correct regardless of which ancestor is the offset parent; the browser
  // clamps at the ends so the first/last card rest flush).
  const centreOffset = useCallback((idx: number): number | null => {
    const scroller = scrollerRef.current
    const lane = scroller?.children[0] as HTMLElement | undefined
    const card = lane?.children[idx] as HTMLElement | undefined
    if (!scroller || !card) return null
    const scrollerRect = scroller.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const cardLeftInContent =
      cardRect.left - scrollerRect.left + scroller.scrollLeft
    return cardLeftInContent - (scroller.clientWidth - cardRect.width) / 2
  }, [])

  const jumpTo = useCallback(
    (idx: number) => {
      const scroller = scrollerRef.current
      const target = centreOffset(idx)
      if (!scroller || target == null) return
      scroller.scrollTo({ left: target, behavior: 'smooth' })
      // A tab/segment tap is a deliberate switch → read the newly-focused
      // card from its top instead of wherever you'd scrolled the last one.
      scrollColumnTopIntoView(scroller)
    },
    [centreOffset],
  )

  const onScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      const lane = scroller?.children[0]
      if (!scroller || !lane) return
      const scrollerRect = scroller.getBoundingClientRect()
      const viewCentre = scrollerRect.left + scroller.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      Array.from(lane.children).forEach((el, i) => {
        const rect = (el as HTMLElement).getBoundingClientRect()
        const cardCentre = rect.left + rect.width / 2
        const dist = Math.abs(cardCentre - viewCentre)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      setActiveIdx(best)
    })
  }, [])

  // Open on `initialIdx` (the final round) — instant, before paint, so there's
  // no visible scroll-from-zero. Card widths are fixed (peek geometry), so the
  // horizontal positions are stable even before markdown finishes laying out.
  useLayoutEffect(() => {
    if (didInitRef.current || initialIdx <= 0) return
    const target = centreOffset(initialIdx)
    if (target == null) return
    didInitRef.current = true
    const scroller = scrollerRef.current
    // `activeIdx` already starts at `initialIdx` (useState), so only the
    // scroll position needs nudging here — no setState in the effect.
    if (scroller) scroller.scrollLeft = target
    // `itemCount` in deps so a council opened mid-stream (cards not laid out on
    // the first pass) still lands on the final round once the cards exist.
  }, [centreOffset, initialIdx, itemCount])

  return { scrollerRef, activeIdx, jumpTo, onScroll }
}
