/**
 * Auto-grow a textarea to fit its content, clamped to a min/max height.
 *
 * The single home for "the prompt box should be as tall as what's typed" —
 * shared by the chat composer and every Settings / seat-config prompt field
 * (via `<PromptField>` / `<DimensionsField>`), so a bug in the grow logic is
 * fixed in exactly one place for all of them.
 *
 * Returns a ref to attach to the raw `<textarea>`. For Base Web's `<Textarea>`
 * that means `overrides={{ Input: { props: { ref } } }}` — Base Web forwards it
 * to the underlying element.
 *
 * Recomputes on three triggers a naive `onInput` handler would miss:
 *  - **value change** — typing, a programmatic set, or Reset-to-default;
 *  - **width change** — the column reflowing / a phone rotating changes text
 *    wrapping and therefore the height needed;
 *  - **becoming visible** — a field inside a collapsed accordion or a
 *    just-opened modal has `scrollHeight 0` until shown; the ResizeObserver
 *    fires on the 0 → N transition so it sizes correctly on reveal, not only
 *    after the first keystroke.
 *
 * Mobile: this hook never touches `font-size`, so it adds no iOS focus-zoom
 * risk — the call sites keep their own 16px-on-mobile rule (the thing that
 * actually suppresses the zoom). Width-keyed recompute means the soft-keyboard
 * opening (which changes height, not width) doesn't trigger spurious resizes.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** Pixel height of `rows` text lines for this element, read from its computed
 *  style so the floor tracks the real font / padding (incl. the 16px mobile
 *  bump) instead of a guessed constant. */
function floorFromRows(el: HTMLTextAreaElement, rows: number): number {
  const cs = getComputedStyle(el)
  // `line-height: normal` parses to NaN — fall back to a typical ratio.
  const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
  const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  const border =
    (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
  // Base Web inputs are `box-sizing: border-box`, so the height we set must
  // include padding + border to actually show `rows` full lines.
  return rows * line + padding + border
}

export function useAutosizeTextarea({
  value,
  maxHeight,
  minHeight = 0,
  minRows,
}: {
  /** Current text — the box recomputes whenever this changes. */
  value: string
  /** Cap in px. Past this the textarea scrolls internally instead of growing. */
  maxHeight: number
  /** Floor in px (e.g. the composer's single-line height). */
  minHeight?: number
  /** Floor expressed in text rows, resolved against the live font/padding.
   *  Use for the multi-line prompt fields so an empty one still shows its
   *  intended starting height. Combined with `minHeight` via `max()`. */
  minRows?: number
}): React.RefObject<HTMLTextAreaElement | null> {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Collapse to 0 first so `scrollHeight` reports the *content* height. NOT
    // `height: auto` — for a <textarea> that falls back to the `rows`
    // attribute, so a field with `rows={6}` would measure 6 rows and never
    // shrink below it (the bug that made these fields stay tall). Within this
    // synchronous layout effect the 0 is never painted.
    el.style.height = '0px'
    const contentHeight = el.scrollHeight
    const floor = Math.max(minHeight, minRows ? floorFromRows(el, minRows) : 0)
    const next = Math.min(Math.max(contentHeight, floor), maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'
  }, [minHeight, minRows, maxHeight])

  // Content changes. Layout effect = corrected before paint, so there's no
  // one-frame jump as the box snaps to size.
  useLayoutEffect(() => {
    resize()
  }, [value, resize])

  // Width changes + visibility transitions. Keyed off *width* so we never react
  // to our own height writes (which would loop), and so the mobile keyboard
  // (height-only change) doesn't retrigger.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w !== lastWidth) {
        lastWidth = w
        resize()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [resize])

  return ref
}
