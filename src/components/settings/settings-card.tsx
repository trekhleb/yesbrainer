/**
 * Bordered card wrapper for a Settings → Storage section — a small header +
 * its content inside a 12px-radius bordered box, so the Persistence / Storage
 * usage / Backup sections read as distinct blocks instead of one running
 * column of headers and text.
 *
 * A lightweight custom card on purpose, not Base Web `Card` (which is heavier
 * — its own title styling + thumbnail/action slots — and would fight the house
 * geometry). Matches the border + 12px radius the Councils accordion panels
 * and sidebar cards already use.
 */

import type { ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { LabelSmall } from 'baseui/typography'

export function SettingsCard({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  const [css, theme] = useStyletron()
  return (
    <section
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        border: `1px solid ${theme.colors.borderOpaque}`,
        borderRadius: '12px',
        padding: '16px',
        backgroundColor: theme.colors.backgroundPrimary,
      })}
    >
      <LabelSmall marginTop="0" marginBottom="0">
        {title}
      </LabelSmall>
      {children}
    </section>
  )
}
