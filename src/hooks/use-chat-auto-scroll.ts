/**
 * Pin-to-top auto-scroll for the chat thread (Claude / ChatGPT behaviour).
 *
 * On a new turn (`pinKey` changes) the freshly-sent question scrolls to the
 * top of the viewport and the answers stream in below it, read top→down. A
 * bottom-reserve spacer is sized so the question can reach the top even before
 * the answers fill the space; it collapses to 0 once an answer grows past one
 * viewport. Opening an existing council lands on `openAnchorRef` — the start
 * of the latest turn's *result* block (Judge verdict / final Consensus round /
 * the Parallel answers), reading downward from the conclusion (the raw
 * bottom cut a long result mid-thought). Falls back to the
 * bottom when no anchor is rendered. Exception: `openAtTop` (demo councils) —
 * a recording is there to be *read*, so it opens on the original question and
 * unfolds downward instead of landing on the conclusion. Only the initial
 * position differs; a follow-up sent into a demo pins to the top like any new
 * turn.
 *
 * The open landing is re-asserted on every commit for a short settle window
 * (cancelled by the first wheel / pointer gesture): the first write races the
 * lanes' pre-paint carousel→grid flip — children's layout effects measure and
 * set state before this hook's owner runs, React flushes their re-render
 * after it, and the grid's narrower columns re-wrap much taller — so a
 * one-shot write strands the view mid-thread at a stale pixel offset.
 *
 * Following the streaming bottom edge is off after a send (you read from the
 * top); scrolling to the bottom re-engages it, scrolling up releases it. There
 * is no jump-to-latest button — it read as too noisy.
 *
 * Deliberately state-free: the spacer height is driven imperatively through a
 * ref, so the hook never re-renders the (already per-chunk re-rendering) thread
 * and stays clear of the project's `set-state-in-effect` lint rule. The owning
 * component wires three refs: the scroller, the pin anchor (rendered just
 * before the latest turn), and the bottom spacer (last child).
 */

import { useCallback, useLayoutEffect, useRef } from 'react'

// Treat "within this many px of the bottom" as at-the-bottom — covers
// sub-pixel rounding and a hair of slack.
const NEAR_BOTTOM_PX = 56
// Covers a smooth programmatic scroll so its own scroll events don't flip the
// follow state mid-animation (a short answer can momentarily land at bottom).
const SMOOTH_SETTLE_MS = 500
// How long the open landing keeps re-asserting itself across commits. Commits
// on a freshly-opened settled council stop within the first frames (the lane
// layout flip, the composer-inset measure), so this only needs to outlive
// those; a user gesture ends it immediately.
const OPEN_SETTLE_MS = 600

export interface ChatAutoScroll {
  scrollRef: React.RefObject<HTMLElement | null>
  anchorRef: React.RefObject<HTMLDivElement | null>
  spacerRef: React.RefObject<HTMLDivElement | null>
  /** Start of the latest turn's result block — the open landing target.
   *  Optional: when never rendered, opening falls back to the bottom. */
  openAnchorRef: React.RefObject<HTMLDivElement | null>
}

export function useChatAutoScroll(
  pinKey: string | null,
  opts?: { openAtTop?: boolean },
): ChatAutoScroll {
  const scrollRef = useRef<HTMLElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const openAnchorRef = useRef<HTMLDivElement | null>(null)

  const followRef = useRef(false)
  const spacerHRef = useRef(0)
  const lastPinRef = useRef<string | null>(null)
  const didInitRef = useRef(false)
  const suppressUntilRef = useRef(0)
  const openSettleUntilRef = useRef(0)

  const distanceFromBottom = (el: HTMLElement) =>
    el.scrollHeight - el.clientHeight - el.scrollTop

  // The pin anchor's distance from the top of the scroll content (rect-based,
  // so it's correct regardless of which ancestor is the offset parent).
  const anchorOffset = (el: HTMLElement, anchor: HTMLElement) =>
    anchor.getBoundingClientRect().top -
    el.getBoundingClientRect().top +
    el.scrollTop

  // Reserve just enough room below the latest turn that its top can pin to the
  // viewport top. Zero when not streaming or once the answer already exceeds a
  // viewport (then the spacer must not pad "bottom" past the real content).
  const sizeSpacer = useCallback(() => {
    const el = scrollRef.current
    const spacer = spacerRef.current
    if (!el || !spacer) return
    const anchor = anchorRef.current
    let reserve = 0
    if (anchor) {
      const contentH = el.scrollHeight - spacerHRef.current
      const belowAnchor = contentH - anchorOffset(el, anchor)
      reserve = Math.max(0, el.clientHeight - belowAnchor)
    }
    if (reserve !== spacerHRef.current) {
      spacerHRef.current = reserve
      spacer.style.height = `${reserve}px`
    }
  }, [])

  // Open landing: the start of the latest result when the owner rendered the
  // anchor, the bottom otherwise. Instant — this is an initial position, not
  // a transition.
  const landOnOpen = useCallback((el: HTMLElement) => {
    const anchor = openAnchorRef.current
    el.scrollTop = anchor ? anchorOffset(el, anchor) : el.scrollHeight
  }, [])

  // Runs after every render — the thread re-renders on each streamed chunk, so
  // this re-measures continuously without needing an explicit content signal.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    sizeSpacer()
    // First paint of an existing council: land on the latest result — unless
    // the owner asked for the top (demos), where the scroller's natural 0
    // is already right and writing scrollTop would only fight it.
    if (!didInitRef.current) {
      didInitRef.current = true
      lastPinRef.current = pinKey
      // (The landing's own scroll event stays un-suppressed on purpose: when
      // it lands at/near the bottom — anchorless fallback, or a short last
      // result — it arms follow, exactly like the pre-anchor behavior.)
      if (!opts?.openAtTop) {
        openSettleUntilRef.current = performance.now() + OPEN_SETTLE_MS
        landOnOpen(el)
      }
      return
    }
    // A brand-new turn: pin its question to the top and read top→down.
    if (pinKey !== lastPinRef.current) {
      lastPinRef.current = pinKey
      followRef.current = false
      openSettleUntilRef.current = 0
      const anchor = anchorRef.current
      if (pinKey != null && anchor) {
        suppressUntilRef.current = performance.now() + SMOOTH_SETTLE_MS
        el.scrollTo({ top: anchorOffset(el, anchor), behavior: 'smooth' })
      }
      return
    }
    // Still settling after open: re-assert the landing — post-init commits
    // (the lanes' pre-paint carousel→grid flip, the composer-inset measure)
    // re-flow the content and strand the one-shot write mid-thread.
    if (performance.now() < openSettleUntilRef.current) {
      landOnOpen(el)
      return
    }
    // An existing turn growing: hold the live edge only if the user has
    // scrolled to the bottom (engaging follow); otherwise leave them be.
    if (followRef.current) {
      el.scrollTop = el.scrollHeight
    }
  })

  // Manual scroll: reaching the bottom engages follow, leaving it releases.
  // Suppressed briefly after a programmatic smooth scroll so the pin-to-top
  // (which can momentarily land at the bottom for a short answer) doesn't
  // immediately re-arm follow and yank the view down. A real gesture (wheel /
  // pointer — scroll events alone can't tell user from programmatic) also
  // ends the open-settle window so the landing never fights the user.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (performance.now() < suppressUntilRef.current) return
      followRef.current = distanceFromBottom(el) <= NEAR_BOTTOM_PX
    }
    const onGesture = () => {
      openSettleUntilRef.current = 0
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onGesture, { passive: true })
    el.addEventListener('pointerdown', onGesture, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onGesture)
      el.removeEventListener('pointerdown', onGesture)
    }
  }, [])

  return { scrollRef, anchorRef, spacerRef, openAnchorRef }
}
