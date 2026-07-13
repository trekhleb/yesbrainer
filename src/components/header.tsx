import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { LabelMedium } from 'baseui/typography'
import { FiDownload, FiPlus, FiSettings } from 'react-icons/fi'
import { LuPanelLeftClose, LuPanelLeftOpen } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/brand-mark'
import { IconTooltip } from '@/components/icon-tooltip'
import { useInstallPrompt } from '@/hooks/use-install-prompt'
import { useIsMobile } from '@/hooks/use-is-mobile'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
/**
 * Top-of-viewport header.
 *
 * The sidebar toggle is a single button pinned to the header's far-left on
 * every page (including /about & /settings) — same spot in every state, so
 * the brand never moves or morphs. Its directional glyph hints at the action
 * (collapse vs expand); it opens/closes the sidebar (a Drawer on mobile).
 *
 * No user menu, no "Sign out" — the app has no accounts. Right
 * side carries exactly three actions: New council, Install (when the
 * browser offers it), Settings. The old "Councils" nav icon was removed
 * in the redesign — the brand link already goes home and the
 * sidebar lists the councils, so it only duplicated both.
 */

/** Single source of truth for the brand-glyph size (the `<BrandLink>` logo). */
const BRAND_ICON_SIZE = 28

/**
 * Icon size for the header's action buttons (sidebar toggle, Councils,
 * Settings) — kept distinct from `BRAND_ICON_SIZE` so they read as a uniform
 * button cluster and the header height stays put across states.
 */
const HEADER_GLYPH_SIZE = 18

/** Clickable brand (logo + wordmark) that navigates home. */
function BrandLink() {
  const [css] = useStyletron()
  return (
    <Link
      to="/"
      aria-label="Yes-Brainer — go to home"
      className={css({
        display: 'flex',
        alignItems: 'center',
        // Tight brand lockup — the wordmark sits close to the mark (matches the
        // sidebar lockup + the /about hero).
        gap: '6px',
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        ':hover': { opacity: 0.75 },
        transition: 'opacity 120ms ease',
      })}
    >
      <BrandMark size={BRAND_ICON_SIZE} />
      <LabelMedium
        marginTop="0"
        marginBottom="0"
        overrides={{
          Block: {
            style: {
              // Sized to sit proportionally beside the brand glyph (plain
              // `LabelMedium` read too small next to it). Semibold — tuned
              // down from heavy to match the logo's thin line weight.
              fontSize: '17px',
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
  )
}

/** Persistent sidebar toggle — the same button in every state. */
function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const label = collapsed ? 'Open sidebar' : 'Close sidebar'
  // No tooltip here on purpose — the directional glyph + `aria-label` already
  // convey the action, and a hover tooltip gets in the way of the mobile
  // drawer this button opens.
  return (
    <Button
      type="button"
      kind={KIND.tertiary}
      size={SIZE.compact}
      onClick={onToggle}
      aria-label={label}
      overrides={{
        // Cancel the compact button's 12px left padding so the glyph sits
        // flush with the header gutter — lining it up with the page content
        // / sidebar below instead of floating indented.
        BaseButton: { style: { marginLeft: '-12px' } },
      }}
    >
      {/* Directional glyph hints at the action: collapsed → "expand"
          (will open), expanded → "collapse" (will close). */}
      {collapsed ? (
        <LuPanelLeftOpen size={HEADER_GLYPH_SIZE} />
      ) : (
        <LuPanelLeftClose size={HEADER_GLYPH_SIZE} />
      )}
    </Button>
  )
}

export interface HeaderProps {
  sidebarCollapsed: boolean
  /** Which top-level page is active — drives the highlighted header icon.
   *  `'settings'` (/settings) is the only page with its own header icon;
   *  the brand link covers "home". */
  activeNav: 'councils' | 'settings' | null
  onToggleSidebar: () => void
  onOpenSettings: () => void
  /** Open the New-council modal directly — a one-tap create that skips the
   *  sidebar (esp. on mobile, where the list is a Drawer). */
  onNewCouncil: () => void
}

export function Header({
  sidebarCollapsed,
  activeNav,
  onToggleSidebar,
  onOpenSettings,
  onNewCouncil,
}: HeaderProps) {
  const [css, theme] = useStyletron()
  const isMobile = useIsMobile()
  // PWA install prompt. `prompt` is null on browsers that don't
  // support the programmatic prompt (iOS Safari, Firefox) and on
  // pages already running standalone — the button hides in either
  // case so the chrome only carries the affordance when it can
  // actually act.
  const { prompt: installPrompt } = useInstallPrompt()

  return (
    <header
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        // Top padding clears the status bar / notch when installed as a PWA
        // (viewport-fit=cover). `env()` is 0 in a normal browser tab.
        paddingTop: 'calc(8px + env(safe-area-inset-top))',
        paddingBottom: '8px',
        paddingLeft: '16px',
        paddingRight: '16px',
        // Roomier side gutter on mobile so the brand doesn't crowd the edge
        // (matches the tagline strip + chromeless page content).
        [MOBILE_MEDIA_QUERY]: { paddingLeft: '20px', paddingRight: '20px' },
        borderBottom: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundPrimary,
        flexShrink: 0,
      })}
    >
      <div
        className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}
      >
        {/* The sidebar toggle is pinned far-left on every page (including
            /about & /settings) so it's always reachable and the brand never
            shifts — collapsed/expanded, desktop/mobile. */}
        <SidebarToggle
          collapsed={sidebarCollapsed}
          onToggle={onToggleSidebar}
        />
        <BrandLink />
      </div>

      <div
        className={css({ display: 'flex', alignItems: 'center', gap: '4px' })}
      >
        {/* One-tap council creation — skips opening the sidebar/drawer. */}
        <IconTooltip label="New council">
          <Button
            type="button"
            kind={KIND.tertiary}
            size={SIZE.compact}
            onClick={onNewCouncil}
            aria-label="New council"
          >
            <FiPlus size={HEADER_GLYPH_SIZE} />
          </Button>
        </IconTooltip>
        {installPrompt && (
          <IconTooltip label="Install as app">
            <Button
              type="button"
              kind={KIND.tertiary}
              size={SIZE.compact}
              onClick={() => void installPrompt()}
              aria-label="Install app"
            >
              <span
                className={css({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                })}
              >
                <FiDownload size={16} />
                {!isMobile && 'Install'}
              </span>
            </Button>
          </IconTooltip>
        )}
        {/* Active page gets the quiet secondary fill (not a filled-primary
            block) — present but never louder than the content. */}
        <IconTooltip label="Settings">
          <Button
            type="button"
            kind={activeNav === 'settings' ? KIND.secondary : KIND.tertiary}
            size={SIZE.compact}
            onClick={onOpenSettings}
            aria-label="Settings"
            aria-current={activeNav === 'settings' ? 'page' : undefined}
          >
            <FiSettings size={HEADER_GLYPH_SIZE} />
          </Button>
        </IconTooltip>
      </div>
    </header>
  )
}

