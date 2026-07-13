/**
 * Shared scroll helpers for the chat thread.
 *
 * `findScrollParent` is the nearest vertically-scrollable ancestor — the
 * thread's `overflow-y: auto` region. Used both by the sticky stage-header's
 * stuck-detection and by the carousel's scroll-to-column-top below.
 */

export function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

/**
 * On a deliberate tab/segment switch in a focus carousel (Roundtable answers,
 * Mediator rounds, Voting cards), pull the newly-focused column's top up under
 * its sticky stage header — so you read the answer from its first line instead
 * of landing wherever you'd scrolled in the previous one.
 *
 * Deliberately conservative, because the old `scrollIntoView` here yanked the
 * whole thread around:
 *   - scrolls the thread by a *controlled* `scrollTop` delta (never
 *     `scrollIntoView`, which walks every ancestor);
 *   - only scrolls **up** — when you've scrolled into the column — and no-ops
 *     when the column top is already at/above the reading line, so it never
 *     pushes the thread downward;
 *   - aligns the column top just below the pinned stage header (its `:scope >
 *     header`), so the pager + model identity stay visible.
 *
 * `laneEl` is the horizontal carousel lane (the `overflow-x` scroller).
 */
export function scrollColumnTopIntoView(laneEl: HTMLElement): void {
  const scroller = findScrollParent(laneEl)
  if (!scroller) return
  const stageHeader = laneEl
    .closest('section')
    ?.querySelector(':scope > header')
  const headerHeight = (stageHeader as HTMLElement | null)?.offsetHeight ?? 0
  const laneTop = laneEl.getBoundingClientRect().top
  const readingLine = scroller.getBoundingClientRect().top + headerHeight
  const delta = laneTop - readingLine
  // Negative delta = the lane top sits above the reading line (you've scrolled
  // into the answer) → pull it down to the line. Ignore tiny / positive deltas.
  if (delta < -2) {
    scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
  }
}
