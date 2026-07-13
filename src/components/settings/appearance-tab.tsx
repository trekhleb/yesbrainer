/**
 * Settings → Appearance.
 *
 * UI / display preferences — kept distinct from Settings → Behavior, which is
 * the orchestrator's *deliberation* knobs (a theme picker isn't council
 * behaviour). Today that's just the theme mode (system / light / dark);
 * density / font-size / reduced-motion settings would join here as the
 * category grows. Theme still persists as `themeMode` in `BehaviorSettings`,
 * so it rides the settings page's single staged Save like the other knobs.
 */

import { ThemeModeField } from '@/components/settings/behavior-fields'
import type { BehaviorSettings } from '@/storage/behavior'

export function AppearanceTab({
  behavior,
  setBehavior,
}: {
  behavior: BehaviorSettings
  setBehavior: (updater: (b: BehaviorSettings) => BehaviorSettings) => void
}) {
  return (
    <ThemeModeField
      value={behavior.themeMode}
      onChange={(v) => setBehavior((b) => ({ ...b, themeMode: v }))}
    />
  )
}
