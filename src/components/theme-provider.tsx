import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BaseProvider } from 'baseui'
import { PLACEMENT, ToasterContainer } from 'baseui/toast'
import { useBehaviorSettings } from '@/hooks/use-behavior-settings'
import { appDarkTheme, appLightTheme } from '@/styles/app-theme'
import { DEFAULT_THEME_MODE, type ThemeMode } from '@/storage/behavior'

/**
 * Theme selector. Wraps Base Web's `BaseProvider` and picks the
 * app's custom light / dark theme (`src/styles/app-theme.ts`) based on
 * the user's chosen `themeMode`:
 *
 *   - `'system'` (default) — listens to `prefers-color-scheme: dark`
 *     and swaps live when the OS preference changes.
 *   - `'light'` / `'dark'` — forced override.
 *
 * Side-effect: keeps `<html data-theme="…">` in sync so the global
 * `index.css` rules (body background, code-block tint) can branch
 * via a single attribute selector without re-rendering React.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const behavior = useBehaviorSettings()
  const mode: ThemeMode = behavior.themeMode ?? DEFAULT_THEME_MODE
  const systemDark = useSystemDark()
  const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effective)
  }, [effective])

  const theme = useMemo(
    () => (effective === 'dark' ? appDarkTheme : appLightTheme),
    [effective],
  )

  return (
    <BaseProvider theme={theme}>
      {/* App-wide toast host. Mounted once here — inside BaseProvider so
          toasts inherit the active light/dark theme and the Layers context
          (correct z-index stacking) — so the imperative `toaster.*` API can
          be fired from anywhere (e.g. Settings → Save confirmation). */}
      <ToasterContainer placement={PLACEMENT.bottom} autoHideDuration={4000}>
        {children}
      </ToasterContainer>
    </BaseProvider>
  )
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return dark
}
