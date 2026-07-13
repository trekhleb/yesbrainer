/**
 * Spotlight segmented tab strip — the reusable chrome behind the Roundtable
 * answer pager *and* the Mediator round pager (one place to tune the look:
 * the rounded track, the sliding neutral raised pill + shadow, the
 * idle→active expansion, keyboard nav). Callers supply per-tab content via a
 * render fn so the same control can show provider logos (Roundtable) or
 * verdict dots + round numbers (Mediator) without forking the styling.
 *
 * It's a *page control* for a center-snap carousel: clicking a tab centres
 * its card; the lane scrolling back moves the active tab. Honest only because
 * the lane snaps (exactly one card is the focused one).
 *
 * **Legend mode** (`mode="legend"`, for the desktop Compare grid): the same
 * strip demoted from switcher to *roster legend* — every card is already
 * visible, so there is no active segment, no sliding pill, and no tablist
 * semantics (plain buttons). Segments keep their identity + status jobs
 * (logo, streaming/error dot, winner ★) and a click means *locate* (the
 * caller flashes the matching card) rather than *switch*.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { LabelXSmall } from 'baseui/typography'
import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

export interface SegmentedTab {
  key: string
  ariaLabel: string
  /** Tab inner content. `active` lets the focused tab expand (reveal a text
   *  label) the way the spotlight control does — idle tabs stay compact. */
  content: (active: boolean) => React.ReactNode
}

export function SegmentedTabs({
  tabs,
  activeIdx,
  onJump,
  ariaLabel,
  mode = 'switcher',
}: {
  tabs: SegmentedTab[]
  activeIdx: number
  onJump: (idx: number) => void
  ariaLabel: string
  /** `switcher` (default) — carousel page control with an active segment.
   *  `legend` — Compare-grid roster legend: no active state, click = locate. */
  mode?: 'switcher' | 'legend'
}) {
  const [css, theme] = useStyletron()
  const isLegend = mode === 'legend'
  const trackRef = useRef<HTMLDivElement | null>(null)
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  )

  // Measure the active segment after layout so the pill slides to it. Re-run
  // on active change (the active tab grows by its label, shifting neighbours)
  // and on container resize (responsive header). Legend mode has no active
  // segment → nothing to measure.
  useLayoutEffect(() => {
    if (isLegend) return
    const measure = () => {
      const seg = segRefs.current[activeIdx]
      const track = trackRef.current
      if (!seg || !track) return
      const segRect = seg.getBoundingClientRect()
      const trackRect = track.getBoundingClientRect()
      setPill({
        left: segRect.left - trackRect.left + track.scrollLeft,
        width: segRect.width,
      })
    }
    measure()
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(track)
    return () => ro.disconnect()
  }, [activeIdx, tabs.length, isLegend])

  return (
    <div
      ref={trackRef}
      role={isLegend ? 'group' : 'tablist'}
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        // Roving arrow-key nav belongs to the tablist; legend segments are
        // plain buttons reached with Tab.
        if (isLegend) return
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const next =
          e.key === 'ArrowRight'
            ? Math.min(activeIdx + 1, tabs.length - 1)
            : Math.max(activeIdx - 1, 0)
        if (next !== activeIdx) {
          onJump(next)
          segRefs.current[next]?.focus()
        }
      }}
      className={css({
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        padding: '3px',
        borderRadius: '16px',
        backgroundColor: theme.colors.backgroundSecondary,
        // Shrink + scroll its own overflow rather than shove the section
        // label off-screen on a narrow phone.
        minWidth: 0,
        maxWidth: '100%',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '::-webkit-scrollbar': { display: 'none' },
      })}
    >
      {/* Sliding pill under the active tab — neutral raised surface (not
          accent-tinted), the iOS segmented-control look. */}
      {!isLegend && pill && (
        <span
          aria-hidden
          className={css({
            position: 'absolute',
            top: '3px',
            bottom: '3px',
            left: 0,
            width: `${pill.width}px`,
            transform: `translateX(${pill.left}px)`,
            backgroundColor: theme.colors.backgroundPrimary,
            borderRadius: '13px',
            boxShadow: theme.lighting.shadow400,
            transitionProperty: 'transform, width',
            transitionDuration: '260ms',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          })}
        />
      )}
      {tabs.map((tab, i) => {
        const active = !isLegend && i === activeIdx
        return (
          <button
            key={tab.key}
            ref={(el) => {
              segRefs.current[i] = el
            }}
            type="button"
            role={isLegend ? undefined : 'tab'}
            aria-selected={isLegend ? undefined : active}
            tabIndex={isLegend ? undefined : active ? 0 : -1}
            aria-label={tab.ariaLabel}
            title={tab.ariaLabel}
            onClick={() => onJump(i)}
            className={css({
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '26px',
              flexShrink: 0,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: '7px',
              // Extra right padding only when active (the label expands in).
              // On phones the label is hidden, so collapse back to square.
              paddingRight: active ? '11px' : '7px',
              [MOBILE_MEDIA_QUERY]: { paddingRight: '7px' },
              border: 'none',
              borderRadius: '13px',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              color: active
                ? theme.colors.contentPrimary
                : theme.colors.contentTertiary,
              opacity: active ? 1 : 0.65,
              transitionProperty: 'opacity, color, padding',
              transitionDuration: '160ms',
              ':hover': { opacity: 1 },
            })}
          >
            {tab.content(active)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The active tab's text label — ellipsised, capped, hidden on phones (the
 * label costs too much width when 4–5 segments share a narrow header). The
 * pagers over this control (Roundtable answers, voting targets) all reveal
 * their label the same way when a segment is focused, so the treatment
 * lives here rather than re-declared per pager.
 */
export function ActiveSegmentLabel({ children }: { children: React.ReactNode }) {
  return (
    <LabelXSmall
      marginTop="0"
      marginBottom="0"
      color="inherit"
      overrides={{
        Block: {
          style: {
            fontWeight: 600,
            whiteSpace: 'nowrap',
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            [MOBILE_MEDIA_QUERY]: { display: 'none' },
          },
        },
      }}
    >
      {children}
    </LabelXSmall>
  )
}
