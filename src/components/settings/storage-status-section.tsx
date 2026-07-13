/**
 * Settings → Storage → On-device storage.
 *
 * The two facets of the browser's storage bucket in one card: **durability**
 * (persistent vs best-effort, with a one-click upgrade) and **capacity** (the
 * quota meter). They're two readings of the same `navigator.storage` state
 * (fetched together in the tab's `readStats`) and read naturally as a pair —
 * "Persistent · using 260 KB of ~10 GB".
 *
 * Owns its own busy + error state: the upgrade button spins while
 * `ensurePersistedStorage()` runs, and a declined upgrade surfaces inline at
 * the bottom of this card.
 */

import { useCallback, useState } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Tag, KIND as TagKind } from 'baseui/tag'
import { ParagraphSmall } from 'baseui/typography'
import { FiAlertTriangle, FiShield } from 'react-icons/fi'
import { LoadingText } from '@/components/loading-text'
import { SettingsCard } from '@/components/settings/settings-card'
import {
  InlineError,
  SettingsNotice,
} from '@/components/settings/settings-notice'
import { ensurePersistedStorage } from '@/storage/persist'
import { formatBytes } from '@/utils/format-bytes'

export function StorageStatusSection({
  persisted,
  estimate,
  onChanged,
}: {
  /** Current persistence state; null while reading the initial value. */
  persisted: boolean | null
  /** Bytes used / available; null while reading or when unsupported. */
  estimate: { usage: number; quota: number } | null
  /** Called after a successful `persist()` so the parent can re-read stats. */
  onChanged: () => void | Promise<void>
}) {
  const [css, theme] = useStyletron()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleMakePersistent = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const ok = await ensurePersistedStorage()
      if (!ok) {
        setError(
          'The browser declined the persistence upgrade. On Chrome / Edge, installing the PWA usually unlocks it; on Firefox, granting the storage permission does.',
        )
      }
      await onChanged()
    } finally {
      setBusy(false)
    }
  }, [onChanged])

  const usagePct =
    estimate && estimate.quota > 0
      ? (estimate.usage / estimate.quota) * 100
      : null

  return (
    <SettingsCard title="On-device storage">
      {/* Durability */}
      {persisted === null ? (
        <ParagraphSmall marginTop="0" marginBottom="0">
          <LoadingText>Reading storage status</LoadingText>
        </ParagraphSmall>
      ) : persisted ? (
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          })}
        >
          <Tag closeable={false} kind={TagKind.positive}>
            Persistent
          </Tag>
          <ParagraphSmall
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentTertiary}
          >
            The browser has committed to keeping your data. Only an explicit
            action (clearing site data, uninstalling the PWA) can wipe it.
          </ParagraphSmall>
        </div>
      ) : (
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          })}
        >
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            })}
          >
            <Tag closeable={false} kind={TagKind.warning}>
              Best-effort
            </Tag>
            <ParagraphSmall
              marginTop="0"
              marginBottom="0"
              color={theme.colors.contentTertiary}
            >
              The browser may evict your data under disk pressure.
            </ParagraphSmall>
          </div>
          <div>
            <Button
              type="button"
              kind={KIND.primary}
              size={SIZE.default}
              isLoading={busy}
              disabled={busy}
              startEnhancer={<FiShield size={16} aria-hidden />}
              onClick={() => void handleMakePersistent()}
            >
              Make persistent
            </Button>
          </div>
        </div>
      )}

      {/* Capacity */}
      {estimate ? (
        <>
          <ParagraphSmall marginTop="0" marginBottom="0">
            Using <strong>{formatBytes(estimate.usage)}</strong> of ~
            {formatBytes(estimate.quota)} available
            {usagePct !== null && (
              <span
                className={css({
                  color:
                    usagePct >= 80
                      ? theme.colors.contentNegative
                      : theme.colors.contentTertiary,
                })}
              >
                {' '}
                ({usagePct.toFixed(usagePct >= 10 ? 0 : 1)}%)
              </span>
            )}
          </ParagraphSmall>
          {usagePct !== null && usagePct >= 80 && (
            <SettingsNotice kind="warning">
              <span
                className={css({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                })}
              >
                <FiAlertTriangle size={14} aria-hidden />
                Approaching the quota — export and prune older councils before
                the browser starts rejecting writes.
              </span>
            </SettingsNotice>
          )}
        </>
      ) : (
        <ParagraphSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentTertiary}
        >
          Quota information is not available in this browser.
        </ParagraphSmall>
      )}

      <InlineError message={error} />
    </SettingsCard>
  )
}
