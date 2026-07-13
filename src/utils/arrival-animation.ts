/**
 * One-shot "reveal" entrance for a synthesis card: a
 * subtle fade + rise when the Judge verdict / final Mediator consensus
 * mounts, so the council's conclusion reads as an *arrival* rather than one
 * more block scrolling by. Spread into a styletron `css()` only when the
 * card is the latest turn's result — TurnView gates it, so older verdicts
 * don't re-animate on every council open.
 *
 * Reduced motion needs no local handling: the global rule in `index.css`
 * collapses every animation's duration to ~0 (WCAG 2.3.3), and with
 * `fill-mode: both` the card still lands on its end state. Playwright
 * freezes animations at their end state too, so committed baselines are
 * unaffected by adding this.
 */
export const ARRIVAL_ANIMATION = {
  animationName: {
    '0%': { opacity: 0, transform: 'translateY(10px)' },
    '100%': { opacity: 1, transform: 'translateY(0)' },
  },
  animationDuration: '360ms',
  animationTimingFunction: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  animationFillMode: 'both',
}
