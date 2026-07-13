/**
 * Base Web's `<Notification>` ships with a fixed inner width + side
 * margins that look awkward when the notification is the dominant
 * element in a flex/grid cell. These helpers strip both so the
 * notification fills its parent. Used everywhere errors / banners
 * surface (chat thread, login screen, settings panels, in-pane error
 * tiles), so we centralise the override here instead of redefining
 * it per file.
 *
 * `FULL_BLEED_NOTIFICATION_OVERRIDES` is the simple no-margins variant
 * (default font size). When the notification sits inside a tight pane
 * and wants a small top gap or a smaller font size, use the function
 * variant `compactNotificationOverrides({ marginTop, fontSize })`.
 */
// Provider error messages often contain long URLs (rate-limit docs,
// dashboard links) and unbroken identifiers (`gemini-2.5-pro`, full
// API endpoints). Without `overflow-wrap: anywhere`, those strings
// punch through the pane's right edge and get clipped. `anywhere` is
// the right knob over `break-word` because we *want* to break inside
// URLs when there's no other option, but only as a last resort.
const WRAP_LONG_STRINGS = {
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const

export const FULL_BLEED_NOTIFICATION_OVERRIDES = {
  Body: {
    style: {
      width: 'auto',
      maxWidth: 'none',
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      ...WRAP_LONG_STRINGS,
    },
  },
} as const

export function compactNotificationOverrides(opts?: {
  marginTop?: number | string
  fontSize?: string
}) {
  return {
    Body: {
      style: {
        width: 'auto',
        maxWidth: 'none',
        marginTop: opts?.marginTop ?? 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
        ...WRAP_LONG_STRINGS,
        ...(opts?.fontSize ? { fontSize: opts.fontSize } : {}),
      },
    },
  } as const
}
