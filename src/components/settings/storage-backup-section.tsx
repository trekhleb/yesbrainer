/**
 * Settings → Storage → Backup & restore.
 *
 * Bulk export (downloads all councils as one JSON file) + import from
 * file picker (validates + merges by council id, surfaces import
 * report). The user's cross-device path until BYOS (sync via the
 * user's own cloud) lands.
 */

import { useCallback, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { ParagraphSmall } from 'baseui/typography'
import { FiDownload, FiUpload } from 'react-icons/fi'
import { SettingsCard } from '@/components/settings/settings-card'
import {
  InlineError,
  SettingsNotice,
} from '@/components/settings/settings-notice'
import {
  bundleExportFilename,
  exportAllCouncils,
  importCouncils,
  type ImportReport,
} from '@/storage/transfer'
import { downloadJson } from '@/utils/download-json'
import { analytics } from '@/analytics'

export function StorageBackupSection({
  onChanged,
  onCouncilsChanged,
}: {
  /** Called after a successful import so the parent can refresh the
   *  quota meter. */
  onChanged: () => void | Promise<void>
  /** Called after a successful import so the app can refresh the sidebar
   *  council list — import merges new councils into Dexie, but the sidebar
   *  reads a snapshot loaded at mount, so it needs a nudge to re-read (the
   *  same `refreshList` create/delete already fire). */
  onCouncilsChanged?: () => void | Promise<void>
}) {
  const [css, theme] = useStyletron()
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleExport = useCallback(async () => {
    setError(null)
    try {
      const bundle = await exportAllCouncils()
      downloadJson(bundle, bundleExportFilename())
      analytics.event('data-exported')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'export failed')
    }
  }, [])

  const handleImportFile = useCallback(
    async (file: File) => {
      setReport(null)
      setError(null)
      try {
        const text = await file.text()
        const parsed: unknown = JSON.parse(text)
        const next = await importCouncils(parsed)
        analytics.event('data-imported')
        setReport(next)
        await onChanged()
        // Refresh the sidebar too when the import actually added councils —
        // the list is a mount-time snapshot and won't otherwise show them
        // until a reload.
        if (next.imported > 0) await onCouncilsChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'import failed')
      }
    },
    [onChanged, onCouncilsChanged],
  )

  return (
    <SettingsCard title="Backup &amp; restore">
      <ParagraphSmall
        marginTop="0"
        marginBottom="0"
        color={theme.colors.contentTertiary}
      >
        Your councils live in this browser. Export a JSON backup
        regularly, or move data to another device by exporting on
        one and importing on the other.
      </ParagraphSmall>
      <div
        className={css({
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        })}
      >
        <Button
          type="button"
          kind={KIND.secondary}
          size={SIZE.default}
          onClick={() => void handleExport()}
          startEnhancer={<FiDownload size={16} aria-hidden />}
        >
          Export all councils
        </Button>
        <Button
          type="button"
          kind={KIND.secondary}
          size={SIZE.default}
          onClick={() => fileInputRef.current?.click()}
          startEnhancer={<FiUpload size={16} aria-hidden />}
        >
          Import from JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            if (f) void handleImportFile(f)
            // Reset so picking the same file twice in a row still
            // fires the change event.
            e.currentTarget.value = ''
          }}
          className={css({ display: 'none' })}
        />
      </div>
      {report && (
        <SettingsNotice
          kind={report.errors.length > 0 ? 'warning' : 'positive'}
        >
          Imported <strong>{report.imported}</strong>; skipped{' '}
          <strong>{report.skipped}</strong> already-present council
          {report.skipped === 1 ? '' : 's'};{' '}
          <strong>{report.errors.length}</strong> error
          {report.errors.length === 1 ? '' : 's'}.
          {report.errors.length > 0 && (
            <ul className={css({ marginTop: '6px', paddingLeft: '20px' })}>
              {report.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  {e.id.slice(0, 8)}…: {e.reason}
                </li>
              ))}
            </ul>
          )}
        </SettingsNotice>
      )}
      <InlineError message={error} />
    </SettingsCard>
  )
}
