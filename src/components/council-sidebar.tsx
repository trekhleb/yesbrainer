/**
 * Adaptive sidebar shell.
 *
 * - **Desktop** (≥768px): an inline column that owns the chrome the old
 *   full-width top header used to carry (that header is now mobile-only).
 *   - **Expanded** (300px): collapse-toggle + brand, "New council", the
 *     council list, and a minimal **footer** with Settings (+ Install when
 *     offered).
 *   - **Collapsed** (~56px **rail**): keeps the expand-toggle, the logo glyph
 *     and Settings reachable, so the brand never fully disappears and the
 *     whole content column is freed otherwise.
 * - **Mobile** (<768px): the same list inside Base Web's `<Drawer>`
 *   (left-anchored, backdrop, focus trap, ESC, width 80vw capped at 85vw).
 *   The top `<Header>` stays on
 *   mobile (the drawer is hidden), so the drawer only carries New council +
 *   its own close X + the list; brand / settings live in the mobile header.
 *
 * Row / RowContextMenu / SeatLogos all live in
 * `src/components/sidebar/*.tsx`.
 */

import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Drawer, ANCHOR, SIZE as DrawerSize } from 'baseui/drawer'
import type { SharedStylePropsArg } from 'baseui/drawer'
import { LabelMedium } from 'baseui/typography'
import { FiDownload, FiPlus, FiSettings, FiX } from 'react-icons/fi'
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu'
import { TbInfoSquareRounded } from 'react-icons/tb'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '@/components/brand-mark'
import { SidebarFooterLinks } from '@/components/sidebar/footer-links'
import { Row } from '@/components/sidebar/row'
import { ABOUT_PATH } from '@/hooks/use-app-route'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { useIsMobile } from '@/hooks/use-is-mobile'
import type { CouncilSummary } from '@/storage/councils'

export interface CouncilSidebarProps {
  councils: CouncilSummary[]
  activeId: string | null
  collapsed: boolean
  /** Side effect after a row is activated — navigation itself is handled
   *  by the row's `<Link>`; this just closes the mobile drawer. */
  onSelect: () => void
  onCreate: () => void
  onDelete: (id: string) => void
  /** Open the rename modal for a council (from its ⋯ menu). The actual
   *  persist + optimistic update lives in the app, like Settings / Delete. */
  onOpenRename: (id: string) => void
  /** Open a council's settings modal (per-participant config) from its
   *  ⋯ menu. Distinct from `onOpenSettings` (the app-wide Settings page). */
  onOpenCouncilSettings: (id: string) => void
  /** Open the share-card modal for a council's latest finished verdict
   *  (from its ⋯ menu; the row gates it to Trial / Consensus). */
  onShareResult: (id: string) => void
  /** Council ids whose LLM title generation is currently in flight. */
  generatingTitleIds: Set<string>
  /** Council ids with any run in flight (the active-streams registry via
   *  `useStreamingCouncilIds` — includes runs finishing in the background).
   *  Either set puts the row's ⋯ button into its loading state. */
  streamingCouncilIds: ReadonlySet<string>
  /** Closes the sidebar — the Drawer backdrop / ESC on mobile, and the
   *  in-drawer close X. */
  onRequestClose: () => void
  /** Collapse ↔ expand the inline desktop sidebar. Lives in the sidebar now
   *  that the desktop top-header is gone (the toggle sits at the top of the
   *  panel and at the top of the collapsed rail). */
  onToggleSidebar: () => void
  /** Open the Settings route — the gear moved into the sidebar footer on
   *  desktop (mobile keeps it in the header). */
  onOpenSettings: () => void
  /** Highlights the footer Settings button when the Settings page is open. */
  settingsActive: boolean
}

/** Expanded desktop sidebar width. Exported so the header can align its
 *  collapse toggle to the sidebar's right edge (ChatGPT-style). */
const SIDEBAR_WIDTH = 300
/** Mobile drawer width — a generous slice of the viewport so long council
 *  titles get room to breathe (decoupled from the fixed desktop width).
 *  Capped by the `DrawerContainer` `maxWidth` so it never fully covers the
 *  page on a wide phone / small tablet. */
const DRAWER_WIDTH = '80vw'
/** Collapsed desktop rail width — wide enough for a centred icon button. */
const RAIL_WIDTH = 56
const GLYPH = 18

export function CouncilSidebar(props: CouncilSidebarProps) {
  const isMobile = useIsMobile()
  const [, theme] = useStyletron()

  if (isMobile) {
    return (
      <Drawer
        isOpen={!props.collapsed}
        onClose={props.onRequestClose}
        anchor={ANCHOR.left}
        size={DrawerSize.auto}
        autoFocus={false}
        overrides={{
          DrawerContainer: {
            // Base Web only slides the panel *in*: its slide transform is keyed
            // to `$isVisible`, which it holds true through the 500ms close, so
            // the stock close just fades (opacity is keyed to `$isVisible &&
            // $isOpen`, which flips immediately). Drive the transform off
            // `$isOpen` too so the panel slides back out the way it slid in.
            // `left: 0` keeps the slide purely transform-based — Base Web's
            // `left: -100%` for the hidden state would teleport it off-screen.
            style: ({ $isOpen, $isVisible }: SharedStylePropsArg) => ({
              maxWidth: '85vw',
              left: 0,
              transform:
                $isOpen && $isVisible ? 'translateX(0)' : 'translateX(-100%)',
              // Same total duration (Base Web's `timing400`, applied to both).
              // The slide keeps its ease-out; on *close* the opacity gets an
              // ease-IN so the panel stays solid through most of the slide and
              // only fades near the very end (instead of fading evenly from the
              // start). Open keeps the normal early fade-in.
              transitionProperty: 'transform, opacity',
              transitionTimingFunction: $isOpen
                ? theme.animation.easeOutCurve
                : `${theme.animation.easeOutCurve}, cubic-bezier(0.5, 0, 0.75, 0)`,
            }),
          },
          DrawerBody: {
            style: {
              marginTop: 0,
              marginRight: 0,
              marginBottom: 0,
              marginLeft: 0,
              // The installed PWA runs with a transparent status bar
              // (black-translucent — see index.html), so this full-height
              // panel reaches the physical top edge: keep the content below
              // the clock/notch. 0 in a browser tab.
              paddingTop: 'env(safe-area-inset-top)',
              // Stop iOS overscroll from chaining to the document (which would
              // rubber-band the drawer backdrop). See index.css.
              overscrollBehavior: 'contain',
            },
          },
          // Hide Base Web's floating close (X) — it sits at a fixed top-right
          // offset that doesn't line up with the "New council" button. We
          // render our own X in the same row instead (see SidebarBody).
          Close: { style: { display: 'none' } },
        }}
      >
        <SidebarBody {...props} inDrawer />
      </Drawer>
    )
  }

  return (
    <DesktopOuter collapsed={props.collapsed}>
      <SidebarBody {...props} />
    </DesktopOuter>
  )
}

function DesktopOuter({
  collapsed,
  children,
}: {
  collapsed: boolean
  children: React.ReactNode
}) {
  const [css] = useStyletron()
  return (
    <div
      className={css({
        // Collapsed → a slim rail (not 0): the toggle / logo / Settings stay
        // reachable. Expanded → the full panel.
        width: collapsed ? `${RAIL_WIDTH}px` : `${SIDEBAR_WIDTH}px`,
        flexShrink: 0,
        overflow: 'hidden',
        transitionProperty: 'width',
        transitionDuration: '200ms',
        transitionTimingFunction: 'ease',
      })}
    >
      {children}
    </div>
  )
}

/** The collapse / expand toggle. Directional glyph hints at the action. */
function ToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      kind={KIND.tertiary}
      size={SIZE.compact}
      onClick={onToggle}
      aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
      title={collapsed ? 'Expand' : 'Collapse'}
      overrides={{
        BaseButton: { style: { paddingLeft: '8px', paddingRight: '8px' } },
      }}
    >
      {collapsed ? (
        <LuPanelLeftOpen size={GLYPH} />
      ) : (
        <LuPanelLeftClose size={GLYPH} />
      )}
    </Button>
  )
}

function SidebarBody({
  councils,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onOpenRename,
  onOpenCouncilSettings,
  onShareResult,
  generatingTitleIds,
  streamingCouncilIds,
  onRequestClose,
  onToggleSidebar,
  onOpenSettings,
  collapsed,
  settingsActive,
  inDrawer,
}: CouncilSidebarProps & { inDrawer?: boolean }) {
  const [css, theme] = useStyletron()
  const navigate = useNavigate()
  const { prompt: installPrompt } = useInstallPrompt()
  // Desktop collapsed = the slim rail. The drawer is always "expanded" content.
  const rail = !inDrawer && collapsed
  // Footer separator colour — a touch stronger than `borderOpaque` (which read
  // too faint to register as a divider). Used by the expanded panel's
  // mid-footer divider and the mobile drawer's footer top border. (The
  // collapsed rail draws no footer divider at all.)
  const dividerColor =
    theme.name === 'dark-theme'
      ? 'rgba(255, 255, 255, 0.10)'
      : 'rgba(0, 0, 0, 0.09)'
  const iconText = css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  })
  // Left-aligned full-width nav item look for the expanded footer buttons.
  const footerItem = rail ? {} : { width: '100%', justifyContent: 'flex-start' }
  // The expanded panel sits on a grey (`backgroundSecondary`) sidebar, where a
  // stock secondary button's near-identical grey fill vanishes. Give the
  // Settings button a slightly darker grey (`backgroundTertiary`) fill so it
  // reads as a distinct button at rest, and invert to the primary-button ink
  // (black-on-light / white-on-dark via the `buttonPrimary*` tokens) on
  // hover/press; the collapsed rail + mobile keep the lighter treatment.
  const settingsButtonStyle = rail
    ? footerItem
    : {
        ...footerItem,
        backgroundColor: theme.colors.backgroundTertiary,
        ':hover': {
          backgroundColor: theme.colors.buttonPrimaryFill,
          color: theme.colors.buttonPrimaryText,
        },
        ':active': {
          backgroundColor: theme.colors.buttonPrimaryActive,
          color: theme.colors.buttonPrimaryText,
        },
      }

  const newCouncilContent = (
    <span className={iconText}>
      <FiPlus size={16} />
      New council
    </span>
  )

  return (
    <aside
      className={css({
        display: 'flex',
        flexDirection: 'column',
        width: inDrawer ? DRAWER_WIDTH : '100%',
        height: '100%',
        paddingTop: '12px',
        paddingBottom: '12px',
        paddingLeft: rail ? '8px' : '12px',
        paddingRight: rail ? '8px' : '12px',
        gap: '8px',
        boxSizing: 'border-box',
        alignItems: rail ? 'center' : 'stretch',
        backgroundColor: theme.colors.backgroundSecondary,
      })}
    >
      {/* ── Top ─────────────────────────────────────────────────────────── */}
      {rail ? (
        <>
          <ToggleButton collapsed onToggle={onToggleSidebar} />
          <Link
            to="/"
            aria-label="Yes-Brainer — go to home"
            title="Yes-Brainer — home"
            className={css({
              display: 'inline-flex',
              padding: '6px',
              color: 'inherit',
              ':hover': { opacity: 0.75 },
              transition: 'opacity 120ms ease',
            })}
          >
            <BrandMark size={24} />
          </Link>
        </>
      ) : inDrawer ? (
        // Mobile drawer: New council + our own close X in one row (so the X
        // is vertically centred against the button; Base Web's floating X is
        // hidden). No brand/settings here — the mobile header carries those.
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          })}
        >
          <Button
            type="button"
            onClick={onCreate}
            size={SIZE.compact}
            overrides={{ BaseButton: { style: { flexGrow: 1 } } }}
          >
            {newCouncilContent}
          </Button>
          <Button
            type="button"
            kind={KIND.tertiary}
            size={SIZE.compact}
            onClick={onRequestClose}
            aria-label="Close sidebar"
            title="Close"
            overrides={{
              BaseButton: {
                style: {
                  flexShrink: 0,
                  paddingLeft: '10px',
                  paddingRight: '10px',
                },
              },
            }}
          >
            <FiX size={18} />
          </Button>
        </div>
      ) : (
        // Desktop expanded panel: toggle + brand row, then New council.
        <>
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            })}
          >
            <ToggleButton collapsed={false} onToggle={onToggleSidebar} />
            <Link
              to="/"
              aria-label="Yes-Brainer — go to home"
              className={css({
                display: 'flex',
                alignItems: 'center',
                // Tight brand lockup — matches the header + /about hero.
                gap: '6px',
                minWidth: 0,
                overflow: 'hidden',
                textDecoration: 'none',
                color: 'inherit',
                ':hover': { opacity: 0.75 },
                transition: 'opacity 120ms ease',
              })}
            >
              <BrandMark size={24} />
              <LabelMedium
                marginTop="0"
                marginBottom="0"
                overrides={{
                  Block: {
                    style: {
                      fontSize: '16px',
                      lineHeight: 1,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                    },
                  },
                }}
              >
                Yes-Brainer
              </LabelMedium>
            </Link>
          </div>
          <Button
            type="button"
            onClick={onCreate}
            size={SIZE.compact}
            overrides={{ BaseButton: { style: { width: '100%' } } }}
          >
            {newCouncilContent}
          </Button>
        </>
      )}

      {/* ── Council list (hidden in the rail) ───────────────────────────── */}
      {rail ? (
        <div className={css({ flex: 1 })} />
      ) : (
        <ul
          className={css({
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            overflowY: 'auto',
            // Reaching the end of the council list shouldn't chain-scroll the
            // page / drawer behind it (iOS rubber-band).
            overscrollBehavior: 'contain',
            flex: 1,
          })}
        >
          {councils.length === 0 && (
            <li
              className={css({
                paddingTop: '12px',
                paddingLeft: '4px',
                paddingRight: '4px',
                fontSize: '13px',
                lineHeight: 1.5,
                color: theme.colors.contentTertiary,
              })}
            >
              Your councils will appear here.
            </li>
          )}
          {councils.map((c) => (
            <li key={c.id}>
              <Row
                council={c}
                active={c.id === activeId}
                isGeneratingTitle={generatingTitleIds.has(c.id)}
                isStreaming={streamingCouncilIds.has(c.id)}
                onSelect={onSelect}
                onShareResult={() => onShareResult(c.id)}
                onSettings={() => onOpenCouncilSettings(c.id)}
                onDelete={() => onDelete(c.id)}
                onRename={() => onOpenRename(c.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ── Footer — attribution / About / theme toggle on every form factor
           (this used to be a fixed strip in the content column). Settings +
           Install stay desktop-only; mobile keeps those in the top header. ─ */}
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          alignItems: rail ? 'center' : 'stretch',
          gap: '8px',
          // Desktop **expanded** only: tighten the gap above the Settings
          // button so it sits close to the council list. The collapsed rail
          // and the mobile drawer keep their original breathing room (on
          // mobile this padding separates the border from the footer links,
          // which shouldn't change).
          paddingTop: rail || inDrawer ? '8px' : '2px',
          // Expanded panel: a faint top border (the stronger mid-footer
          // divider sits below it). Mobile drawer: no action buttons above the
          // footer, so its top border is the separator (stronger colour). The
          // collapsed rail draws no footer divider at all.
          borderTop: rail
            ? 'none'
            : `1px solid ${inDrawer ? dividerColor : theme.colors.borderOpaque}`,
        })}
      >
        {!inDrawer && (
          <div
            className={css({
              display: 'flex',
              flexDirection: 'column',
              alignItems: rail ? 'center' : 'stretch',
              gap: '4px',
            })}
          >
            {installPrompt && (
              <Button
                type="button"
                kind={KIND.tertiary}
                size={SIZE.compact}
                onClick={() => void installPrompt()}
                aria-label="Install app"
                title="Install as app"
                overrides={{ BaseButton: { style: footerItem } }}
              >
                {rail ? (
                  <FiDownload size={16} />
                ) : (
                  <span className={iconText}>
                    <FiDownload size={16} />
                    Install
                  </span>
                )}
              </Button>
            )}
            <Button
              type="button"
              // Expanded desktop panel: a filled **secondary** button so
              // Settings reads as the primary nav action, set apart from the
              // tertiary footer links. The collapsed rail keeps the quieter
              // tertiary (→ secondary when active) treatment; mobile shows
              // Settings in the top header, not here.
              kind={
                rail
                  ? settingsActive
                    ? KIND.secondary
                    : KIND.tertiary
                  : KIND.secondary
              }
              size={SIZE.compact}
              onClick={onOpenSettings}
              aria-label="Settings"
              aria-current={settingsActive ? 'page' : undefined}
              title="Settings"
              overrides={{ BaseButton: { style: settingsButtonStyle } }}
            >
              {rail ? (
                <FiSettings size={GLYPH} />
              ) : (
                <span className={iconText}>
                  <FiSettings size={GLYPH} />
                  Settings
                </span>
              )}
            </Button>
            {/* On the rail, About joins Settings as a matching tertiary icon
                button (native `title` tooltip). In the expanded panel it stays
                a quiet text link in the footer row below. */}
            {rail && (
              <Button
                type="button"
                kind={KIND.tertiary}
                size={SIZE.compact}
                onClick={() => navigate(ABOUT_PATH)}
                aria-label="About"
                title="About"
                overrides={{ BaseButton: { style: footerItem } }}
              >
                <TbInfoSquareRounded size={GLYPH} />
              </Button>
            )}
          </div>
        )}
        {/* No divider between Settings and the attribution links in the
            expanded panel — the grey (contrasting) Settings button already
            separates the two zones. The collapsed rail draws no footer divider
            either; the mobile drawer has no action buttons above the footer, so
            its top border carries the separator instead. */}
        {/* Attribution + About + theme toggle — the expanded panel and the
            mobile drawer. The rail shows About as an icon button above and
            drops the rest. */}
        {!rail && <SidebarFooterLinks onSelect={onSelect} />}
      </div>
    </aside>
  )
}
