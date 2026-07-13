/**
 * Inline link to a specific Settings tab — for captions that point the user
 * at a setting (e.g. "editable in Settings → Prompts"). Navigates via the
 * real `/settings/:tab` route, so it's a proper link (cmd/middle-click opens
 * a tab). Renders the "Settings → Tab" label by default; pass children to
 * override the text.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { Link } from 'react-router-dom'

const TAB_LABEL = {
  keys: 'Keys',
  councils: 'Councils',
  appearance: 'Appearance',
  storage: 'Storage',
} as const

export function SettingsLink({
  tab,
  children,
}: {
  tab: keyof typeof TAB_LABEL
  children?: ReactNode
}) {
  const [css, theme] = useStyletron()
  return (
    <Link
      to={`/settings/${tab}`}
      className={css({
        color: theme.colors.linkText,
        textDecoration: 'underline',
        ':hover': { textDecoration: 'none' },
      })}
    >
      {children ?? `Settings → ${TAB_LABEL[tab]}`}
    </Link>
  )
}
