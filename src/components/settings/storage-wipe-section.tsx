/**
 * Settings → Storage → wipe controls.
 *
 * Three destructive actions in a severity gradient, each guarded by its own
 * `ConfirmModal` (`role=alertdialog`, red confirm — the standard guard for an
 * irreversible action):
 *
 *  - **Wipe keys** / **Wipe councils** — *partial* cleaners (outline-red,
 *    secondary rank). Each drops one slice and keeps the rest, so there's no
 *    page reload: keys clear reactively through the keys adapter, and the
 *    council list refreshes via `onCouncilsChanged` (the sidebar's redirect
 *    effect then lands on the empty state). Wiping councils leaves the
 *    demos-seeded flag set, so — exactly like deleting every council by hand
 *    — the demos don't re-seed.
 *  - **Wipe everything** — the solid-red factory reset: drops the IDB
 *    database + every `yesbrainer:*` localStorage key, then reloads so the
 *    empty-state onboarding / first-council flow takes over fresh.
 */

import { useCallback, useState } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { FiKey, FiTrash2, FiUsers } from 'react-icons/fi'
import { ConfirmModal } from '@/components/form-modal'
import { SettingsNotice } from '@/components/settings/settings-notice'
import { analytics } from '@/analytics'
import { wipeAllCouncils, wipeAllStorage, wipeApiKeys } from '@/storage/wipe'
import { abortAllCouncilStreams } from '@/utils/session/active-streams'
import {
  destructiveButtonOverrides,
  destructiveSecondaryButtonOverrides,
} from '@/utils/button-styles'

type WipeKind = 'keys' | 'councils' | 'everything'

export function StorageWipeSection({
  onChanged,
  onCouncilsChanged,
}: {
  /** Refresh the quota meter / persistence badge after a partial wipe frees
   *  space (threaded from the Storage tab's `refreshStats`). */
  onChanged?: () => void | Promise<void>
  /** Refresh the sidebar after a council wipe empties the list (threaded from
   *  the app's `refreshList`). */
  onCouncilsChanged?: () => void | Promise<void>
}) {
  const [css, theme] = useStyletron()
  const [confirm, setConfirm] = useState<WipeKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runWipe = useCallback(
    async (kind: WipeKind) => {
      setError(null)
      try {
        if (kind === 'keys') {
          analytics.event('wipe-keys')
          wipeApiKeys()
          await onChanged?.()
          setConfirm(null)
          return
        }
        if (kind === 'councils') {
          analytics.event('wipe-councils')
          // Cancel any in-flight run first — the wipe drops the rows their
          // results would land on (same contract as a single delete).
          abortAllCouncilStreams()
          await wipeAllCouncils()
          await onCouncilsChanged?.()
          await onChanged?.()
          setConfirm(null)
          return
        }
        // Counted before the wipe: the reload below tears the page down and
        // only the provider's `keepalive` lets the event out. The count is
        // "reset confirmed", deliberately carrying nothing about what died.
        analytics.event('wipe-everything')
        await wipeAllStorage()
        // Hard reload — the empty-state flow takes over on a clean slate.
        window.location.reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'wipe failed')
        setConfirm(null)
      }
    },
    [onChanged, onCouncilsChanged],
  )

  return (
    <section
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      })}
    >
      {/* Partial cleaners — scoped resets that keep everything else. Amber
          (caution) sits one rung below the red factory-reset banner. */}
      <SettingsNotice kind="warning">
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '12px',
          })}
        >
          <span>
            <strong>Selective cleanup.</strong> Wipe only your saved keys, or
            only your councils — the rest stays on this device. Each is
            irreversible, so export a backup first if you might want the data
            back.
          </span>
          <div
            className={css({ display: 'flex', gap: '8px', flexWrap: 'wrap' })}
          >
            <Button
              type="button"
              kind={KIND.secondary}
              size={SIZE.default}
              onClick={() => setConfirm('keys')}
              startEnhancer={<FiKey size={16} aria-hidden />}
              overrides={destructiveSecondaryButtonOverrides(theme)}
            >
              Wipe keys
            </Button>
            <Button
              type="button"
              kind={KIND.secondary}
              size={SIZE.default}
              onClick={() => setConfirm('councils')}
              startEnhancer={<FiUsers size={16} aria-hidden />}
              overrides={destructiveSecondaryButtonOverrides(theme)}
            >
              Wipe councils
            </Button>
          </div>
        </div>
      </SettingsNotice>

      {/* Factory reset — the nuclear option (keys + councils + settings). */}
      <SettingsNotice kind="negative">
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '12px',
          })}
        >
          <span>
            <strong>Factory reset.</strong> Delete every council, every
            setting, every BYOK key on this device. The browser will reload.
            This is irreversible.
          </span>
          <Button
            type="button"
            kind={KIND.secondary}
            size={SIZE.default}
            onClick={() => setConfirm('everything')}
            startEnhancer={<FiTrash2 size={16} aria-hidden />}
            overrides={destructiveButtonOverrides(theme)}
          >
            Wipe everything
          </Button>
        </div>
      </SettingsNotice>

      {error && (
        <SettingsNotice kind="negative">
          <span className={css({ fontWeight: 600 })}>Couldn't wipe: {error}</span>
        </SettingsNotice>
      )}

      {confirm === 'keys' && (
        <ConfirmModal
          title="Wipe keys?"
          confirmLabel="Wipe keys"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runWipe('keys')}
        >
          This removes every BYOK API key saved in this browser. Your councils
          and settings stay put — but you'll need to paste your keys again
          before the next run.
        </ConfirmModal>
      )}

      {confirm === 'councils' && (
        <ConfirmModal
          title="Wipe councils?"
          confirmLabel="Wipe councils"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runWipe('councils')}
        >
          This permanently deletes every council in this browser — questions,
          answers, votes, and verdicts. Your keys and settings stay put. It
          can't be undone, so export a backup first if you might want this data
          back.
        </ConfirmModal>
      )}

      {confirm === 'everything' && (
        <ConfirmModal
          title="Wipe everything?"
          confirmLabel="Wipe everything"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runWipe('everything')}
        >
          This permanently deletes every council, every setting, and every
          BYOK key stored in this browser, then reloads the page. It cannot be
          undone — export a backup first if you might want this data back.
        </ConfirmModal>
      )}
    </section>
  )
}
