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

import { Fragment } from 'react'
import { SegmentedField } from '@/components/fields/segmented-field'
import { ThemeModeField } from '@/components/settings/behavior-fields'
import {
  DEFAULT_KEEP_AWAKE_DURING_RUN,
  type BehaviorSettings,
} from '@/storage/behavior'

export function AppearanceTab({
  behavior,
  setBehavior,
}: {
  behavior: BehaviorSettings
  setBehavior: (updater: (b: BehaviorSettings) => BehaviorSettings) => void
}) {
  const keepAwake =
    behavior.keepAwakeDuringRun ?? DEFAULT_KEEP_AWAKE_DURING_RUN
  return (
    <Fragment>
      <ThemeModeField
        value={behavior.themeMode}
        onChange={(v) => setBehavior((b) => ({ ...b, themeMode: v }))}
      />
      {/* A device preference, not a deliberation knob — which is why it
          lives here rather than on the Behavior tab. Caption states the
          mechanism and its limit; it must not read as "councils run in the
          background", because they don't. */}
      <SegmentedField
        label="Keep the screen awake while a council runs"
        caption="Stops the device auto-locking mid-debate, which would cut the run off. Released as soon as you leave the app — a council only runs while it's open."
        options={[
          { key: 'on', label: 'On' },
          { key: 'off', label: 'Off' },
        ]}
        activeKey={keepAwake ? 'on' : 'off'}
        isOverridden={behavior.keepAwakeDuringRun !== undefined}
        onReset={() =>
          setBehavior((b) => ({ ...b, keepAwakeDuringRun: undefined }))
        }
        onChange={(key) => {
          const next = key === 'on'
          setBehavior((b) => ({
            ...b,
            // Storage invariant: collapse to `undefined` at the documented
            // default so a future release can move it.
            keepAwakeDuringRun:
              next === DEFAULT_KEEP_AWAKE_DURING_RUN ? undefined : next,
          }))
        }}
      />
    </Fragment>
  )
}
