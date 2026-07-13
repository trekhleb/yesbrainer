/**
 * The single notification primitive for the Settings tabs.
 *
 * Every banner / inline message in Settings (privacy banners, quota warning,
 * import report, per-section errors, the factory-reset block) renders through
 * `SettingsNotice`, so their look — full-bleed body + one font size matched to
 * the card text — lives in **one** place. Change `SETTINGS_NOTICE_OVERRIDES`
 * here and the whole settings surface follows; no per-file copy of
 * `compactNotificationOverrides({ fontSize: … })`.
 *
 * `InlineError` is the thin "show a negative notice only when there's a
 * message" helper the storage sections use for their own error state.
 */

import type { ReactNode } from 'react'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { compactNotificationOverrides } from '@/utils/notification-styles'

export type NoticeKind = 'info' | 'positive' | 'warning' | 'negative'

const KIND_MAP = {
  info: NotificationKind.info,
  positive: NotificationKind.positive,
  warning: NotificationKind.warning,
  negative: NotificationKind.negative,
} as const

// One font size for every settings notification — matched to the card body
// text (`ParagraphSmall`, 14px) so banners don't read oversized next to it.
const SETTINGS_NOTICE_OVERRIDES = compactNotificationOverrides({
  fontSize: '14px',
})

export function SettingsNotice({
  kind,
  children,
}: {
  kind: NoticeKind
  children: ReactNode
}) {
  return (
    <Notification kind={KIND_MAP[kind]} overrides={SETTINGS_NOTICE_OVERRIDES}>
      {children}
    </Notification>
  )
}

/** Negative `SettingsNotice` rendered only when `message` is set — the shared
 *  inline-error affordance for the storage sections. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null
  return <SettingsNotice kind="negative">{message}</SettingsNotice>
}
