/**
 * Per-row kebab menu — Settings / Rename / Delete, with a footer (under a gentle
 * divider) showing this chat's cumulative token usage. Lives inside a
 * normal surface popover (`menuPopoverOverrides`), so colours follow
 * the active theme.
 */

import { useStyletron } from 'baseui'
import {
  FiBarChart2,
  FiDownload,
  FiEdit3,
  FiShare2,
  FiTrash2,
} from 'react-icons/fi'
import { LuSlidersHorizontal } from 'react-icons/lu'
import { formatTokenCount } from '@/utils/format-tokens'
import type { TokenTotals } from '@/types/council'

export function RowContextMenu({
  onSettings,
  onRename,
  onExport,
  onShare,
  onDelete,
  tokenTotal,
}: {
  /** Open this council's settings modal (per-participant config). */
  onSettings: () => void
  onRename: () => void
  /** Download this council as JSON (the same v1 envelope as the bulk
   *  backup, with one council in it) — no modal, click = download. */
  onExport: () => void
  /** Open the share-card modal for this council's latest finished verdict.
   *  Only supplied for structures that *have* a
   *  synthesis to share (Trial / Consensus — Parallel has none); absent →
   *  no menu item. */
  onShare?: () => void
  onDelete: () => void
  /** This council's cumulative token usage — surfaced in the menu footer. */
  tokenTotal: TokenTotals
}) {
  const [css, theme] = useStyletron()
  const totalTokens = tokenTotal.inputTokens + tokenTotal.outputTokens
  const itemStyle = css({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingTop: '8px',
    paddingBottom: '8px',
    paddingLeft: '12px',
    paddingRight: '12px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: '14px',
    ':hover': {
      backgroundColor: theme.colors.backgroundSecondary,
    },
    ':disabled': { cursor: 'not-allowed', opacity: 0.5 },
  })
  return (
    <div
      className={css({
        paddingTop: '4px',
        paddingBottom: '4px',
        minWidth: '180px',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <button
        type="button"
        onClick={onSettings}
        className={`${itemStyle} ${css({
          color: theme.colors.contentPrimary,
        })}`}
      >
        {/* Sliders, not the gear — the gear is reserved for app-level
            Settings; council settings wears sliders everywhere (this row
            + the composer trigger). */}
        <LuSlidersHorizontal size={14} aria-hidden />
        Settings
      </button>
      <button
        type="button"
        onClick={onRename}
        className={`${itemStyle} ${css({
          color: theme.colors.contentPrimary,
        })}`}
      >
        <FiEdit3 size={14} aria-hidden />
        Rename
      </button>
      <button
        type="button"
        onClick={onExport}
        className={`${itemStyle} ${css({
          color: theme.colors.contentPrimary,
        })}`}
      >
        <FiDownload size={14} aria-hidden />
        Export
      </button>
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          className={`${itemStyle} ${css({
            color: theme.colors.contentPrimary,
          })}`}
        >
          <FiShare2 size={14} aria-hidden />
          Share result
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className={`${itemStyle} ${css({ color: theme.colors.negative })}`}
      >
        <FiTrash2 size={14} aria-hidden />
        Delete
      </button>

      {/* Gentle divider, then this chat's token usage as a quiet footer. */}
      <div
        className={css({
          marginTop: '4px',
          paddingTop: '8px',
          paddingBottom: '2px',
          paddingLeft: '12px',
          paddingRight: '12px',
          borderTop: `1px solid ${theme.colors.borderOpaque}`,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: theme.colors.contentTertiary,
        })}
      >
        <FiBarChart2 size={12} aria-hidden />
        {/* Both icon + text inherit the muted `contentTertiary` — the usage
            line is quiet supporting info, not something to draw the eye. */}
        {totalTokens === 0
          ? 'No tokens used yet'
          : `${formatTokenCount(totalTokens)} tokens`}
      </div>
    </div>
  )
}
