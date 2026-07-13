/**
 * The soft clone-guard: when
 * the app is served from a hostname that isn't the official deployment or
 * a dev host, show a slim dismissible notice pointing at the official URL —
 * and nothing more. Deliberately NOT a hard lock: a runtime lock is one
 * edit away from stripped in a malicious fork (it only deters the lazy
 * rehost, which this notice also deters), and a lock fails dangerous — a
 * domain move or an allowlist gap would brick the app for real users,
 * while the notice fails safe. Dismissal is per-session (sessionStorage)
 * so a rehosted copy can't silence it forever; the official site never
 * renders it at all.
 */

import { useState } from 'react'
import { useStyletron } from 'baseui'
import { FiX } from 'react-icons/fi'
import { OFFICIAL_APP_URL } from '@/utils/external-links'
import { isOfficialHost } from '@/utils/official-host'

const DISMISS_KEY = 'yesbrainer:unofficial-notice-dismissed'

function initiallyHidden(): boolean {
  if (isOfficialHost(window.location.hostname)) return true
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false // storage blocked (strict private mode) → still warn
  }
}

export function UnofficialCopyNotice() {
  const [css, theme] = useStyletron()
  const [hidden, setHidden] = useState(initiallyHidden)
  if (hidden) return null
  return (
    <div
      role="note"
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingLeft: '12px',
        paddingRight: '12px',
        fontSize: '13px',
        lineHeight: 1.4,
        textAlign: 'center',
        backgroundColor: theme.colors.backgroundWarning,
        color: theme.colors.contentPrimary,
        flexShrink: 0,
      })}
    >
      <span>
        This is an unofficial copy of Yes-Brainer — the official app lives
        at{' '}
        {/* Same-tab on purpose: the click means "take me to the real one". */}
        <a
          href={OFFICIAL_APP_URL}
          className={css({
            color: 'inherit',
            fontWeight: 600,
            textDecorationLine: 'underline',
            ':hover': { textDecorationLine: 'none' },
          })}
        >
          yesbrainer.ai
        </a>
        .
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, '1')
          } catch {
            // Best effort — still hide for this render.
          }
          setHidden(true)
        }}
        className={css({
          background: 'none',
          border: 'none',
          padding: '2px',
          margin: '0',
          cursor: 'pointer',
          display: 'inline-flex',
          color: 'inherit',
          ':hover': { opacity: 0.7 },
        })}
      >
        <FiX size={16} aria-hidden />
      </button>
    </div>
  )
}
