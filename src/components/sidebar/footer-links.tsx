/**
 * The quiet sidebar footer — open-source link + About + light/dark toggle.
 * (Author attribution lives on the linked © line on /about, not here.)
 * Used by the expanded desktop panel and the mobile drawer (the collapsed
 * rail surfaces About as an icon button and drops the rest). It replaced
 * the old fixed footer strip at the bottom of the content column, so no
 * content page carries a footer band and the chat keeps every vertical
 * pixel.
 */

import { useStyletron } from 'baseui'
import { PLACEMENT } from 'baseui/tooltip'
import { FiGithub, FiMoon, FiSun } from 'react-icons/fi'
import { TbInfoSquareRounded } from 'react-icons/tb'
import { Link } from 'react-router-dom'
import { IconTooltip } from '@/components/icon-tooltip'
import { ABOUT_PATH } from '@/hooks/use-app-route'
import {
  getBehaviorSettings,
  setBehaviorSettings,
} from '@/storage/behavior'
import { GITHUB_REPO_URL } from '@/utils/external-links'

export function SidebarFooterLinks({ onSelect }: { onSelect: () => void }) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  const themeLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  const themeToggle = (
    <IconTooltip label={themeLabel} placement={PLACEMENT.top}>
      <button
        type="button"
        onClick={() =>
          setBehaviorSettings({
            ...getBehaviorSettings(),
            themeMode: isDark ? 'light' : 'dark',
          })
        }
        aria-label={themeLabel}
        className={css({
          color: theme.colors.contentTertiary,
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          ':hover': { color: theme.colors.contentPrimary },
          transition: 'color 120ms ease',
        })}
      >
        {isDark ? (
          <FiSun size={15} aria-hidden />
        ) : (
          <FiMoon size={15} aria-hidden />
        )}
      </button>
    </IconTooltip>
  )

  const linkStyle = css({
    color: theme.colors.contentTertiary,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    ':hover': { color: theme.colors.contentPrimary },
    transition: 'color 120ms ease',
  })
  return (
    <div
      className={css({
        display: 'flex',
        // No wrap here: if space runs out, the *link row* wraps internally
        // and the theme toggle stays pinned to the right instead of
        // dropping onto its own line.
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '4px 8px',
        // Align the link text with the Settings button's content above.
        paddingLeft: '12px',
        paddingRight: '12px',
        fontSize: '12px',
        color: theme.colors.contentTertiary,
      })}
    >
      {/* One left-aligned link row — "About · Source code" — with the theme
          toggle alone on the right. About leads (the app's own story); Source
          code (the GitHub glyph carries "public repo") answers "can I verify
          it?". The "who's behind this?" attribution moved to the linked ©
          line on /about, so the drawer stays minimal. Full
          "open source" wording lives on /about + both key screens. */}
      <div
        className={css({
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px 8px',
        })}
      >
        <Link
          to={ABOUT_PATH}
          className={linkStyle}
          // Mirror the council Row: close the mobile drawer on a plain
          // left-click (the <Link> still navigates) so opening About doesn't
          // leave the drawer covering the page it just opened. `onSelect`
          // no-ops on desktop, so modified clicks / desktop are unaffected.
          onClick={(e) => {
            if (
              e.button !== 0 ||
              e.metaKey ||
              e.ctrlKey ||
              e.shiftKey ||
              e.altKey ||
              e.defaultPrevented
            ) {
              return
            }
            onSelect()
          }}
        >
          {/* Leading info icon — the same glyph the collapsed rail shows for
              About, so the link reads consistently in both states (and mirrors
              the `Settings` button's icon-before-label layout above). */}
          <TbInfoSquareRounded size={14} aria-hidden />
          About
        </Link>
        <span aria-hidden>·</span>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkStyle}
        >
          <FiGithub size={13} aria-hidden />
          Source code
        </a>
      </div>
      {themeToggle}
    </div>
  )
}
