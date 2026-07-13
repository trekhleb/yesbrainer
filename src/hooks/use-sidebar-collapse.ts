/**
 * Sidebar collapse state.
 *
 * localStorage holds the *desktop preference* only — whether the user has
 * deliberately collapsed the inline sidebar on a wide screen. It is written
 * solely by desktop toggles; mobile never touches it.
 *
 * Mobile defaults to closed regardless of the stored value, and crossing the
 * desktop→mobile breakpoint mid-session force-closes the sidebar so the Drawer
 * doesn't overlay the chat unprompted. Crucially, that auto-collapse is
 * ephemeral: returning to desktop restores the saved desktop preference, so an
 * auto-collapse (or a mobile drawer close) never strands the sidebar collapsed
 * on desktop where the user never collapsed it manually.
 */

import { useCallback, useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { MOBILE_QUERY } from '@/styles/breakpoints'

const KEY = 'yesbrainer:sidebar-collapsed'

function desktopPrefCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(KEY) === '1'
}

function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  // Mobile defaults to closed regardless of stored value — don't trap
  // the user behind a drawer on first load. Desktop reads the preference.
  if (window.matchMedia(MOBILE_QUERY).matches) return true
  return desktopPrefCollapsed()
}

export function useSidebarCollapse(): {
  collapsed: boolean
  toggle: () => void
  close: () => void
} {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed)

  // Crossing the breakpoint mid-session: entering mobile force-collapses (the
  // Drawer must not overlay the chat unprompted); returning to desktop restores
  // the persisted desktop preference. Neither path writes localStorage, so the
  // preference survives a mobile detour untouched.
  useEffect(() => {
    // Re-derive collapse state only when the breakpoint *crosses* (isMobile
    // flips) — force-closed on mobile, restored to the saved desktop
    // preference on return. Syncing to an external signal (viewport width),
    // which is the effect's legitimate job here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(isMobile ? true : desktopPrefCollapsed())
  }, [isMobile])

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c
      // Only desktop toggles change the saved preference; on mobile the
      // drawer's open/close is ephemeral.
      if (!isMobile) localStorage.setItem(KEY, next ? '1' : '0')
      return next
    })
  }, [isMobile])

  const close = useCallback(() => {
    setCollapsed(true)
    // close() is the mobile drawer-dismiss path (select a chat / tap-away), so
    // it stays ephemeral and never overwrites the desktop preference.
    if (!isMobile) localStorage.setItem(KEY, '1')
  }, [isMobile])

  return { collapsed, toggle, close }
}
