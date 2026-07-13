/**
 * Settings → Storage — coordinator.
 *
 * An on-device data banner + three storage sections (Status — persistence +
 * quota merged into one card — / Backup / Wipe). Reads the stats once on
 * mount; sections call `refreshStats` after mutations so the persistence badge
 * and quota meter stay in lockstep.
 *
 * Each section owns and renders its **own** error inline (inside its card),
 * so a failed action surfaces right where it was triggered — not in a shared
 * sink at the bottom of the tab.
 *
 * Per-section components live in `src/components/settings/storage-*-section.tsx`.
 */

import { useCallback, useEffect, useState } from 'react'
import { useStyletron } from 'baseui'
import { StorageBackupSection } from '@/components/settings/storage-backup-section'
import { StorageStatusSection } from '@/components/settings/storage-status-section'
import { StorageWipeSection } from '@/components/settings/storage-wipe-section'
import { SettingsNotice } from '@/components/settings/settings-notice'
import { estimateStorage, isStoragePersisted } from '@/storage/persist'

interface StorageStats {
  persisted: boolean
  estimate: { usage: number; quota: number } | null
}

async function readStats(): Promise<StorageStats> {
  const [persisted, estimate] = await Promise.all([
    isStoragePersisted(),
    estimateStorage(),
  ])
  return { persisted, estimate }
}

export function StorageTab({
  onCouncilsChanged,
}: {
  /** Refresh the sidebar after an import adds councils (threaded from the
   *  app's `refreshList`). */
  onCouncilsChanged?: () => void | Promise<void>
}) {
  const [css] = useStyletron()
  const [stats, setStats] = useState<StorageStats | null>(null)

  useEffect(() => {
    void readStats().then(setStats)
  }, [])

  const refreshStats = useCallback(async () => {
    setStats(await readStats())
  }, [])

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      })}
    >
      {/* Deliberate info banner (like Settings → Keys): the on-device,
          no-server data story is a headline product property, stressed up
          front before the durability / backup / reset controls below. */}
      <SettingsNotice kind="info">
        <strong>Your data stays on this device.</strong> Every council,
        setting, and key lives in this browser — we run no server, so none of
        it is stored anywhere else. That keeps it private, but it also means
        it's yours to look after: export a backup now and then, since clearing
        the browser or losing the device takes the data with it.
      </SettingsNotice>

      <StorageStatusSection
        persisted={stats ? stats.persisted : null}
        estimate={stats?.estimate ?? null}
        onChanged={refreshStats}
      />
      <StorageBackupSection
        onChanged={refreshStats}
        onCouncilsChanged={onCouncilsChanged}
      />
      <StorageWipeSection
        onChanged={refreshStats}
        onCouncilsChanged={onCouncilsChanged}
      />
    </div>
  )
}
