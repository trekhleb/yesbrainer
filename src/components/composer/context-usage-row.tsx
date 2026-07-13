/**
 * Pre-flight context-window meter. Shows the worst-case seat's
 * "Context: X% of Yk (model)" hint as a one-line strip above the
 * textarea with a thin progress bar; tint flips to the negative theme
 * colour past `warnAt` (typically 80%) so the warning is unmissable.
 *
 * Suppressed below ~10% usage by the parent so the chrome stays quiet
 * on short prompts.
 */

import { useStyletron } from 'baseui'
import type { ContextUsageHint } from '@/utils/context-estimate'

export function ContextUsageRow({
  hint,
  warnAt,
}: {
  hint: ContextUsageHint
  warnAt: number
}) {
  const [css, theme] = useStyletron()
  const warn = hint.pct >= warnAt
  const pctLabel = hint.pct >= 0.99 ? '~100%' : `~${Math.round(hint.pct * 100)}%`
  const maxLabel = formatTokens(hint.max)
  const usedLabel = formatTokens(hint.used)
  const color = warn ? theme.colors.negative : theme.colors.contentTertiary
  return (
    <div
      role="status"
      title={`Worst-case seat (${hint.displayLabel}): the upcoming turn would consume an estimated ${usedLabel} input tokens against a ${maxLabel} context window. Past ~80% the provider may start truncating history on subsequent turns.`}
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color,
        paddingLeft: '4px',
        fontVariantNumeric: 'tabular-nums',
      })}
    >
      <span>
        Context: {pctLabel} of {maxLabel} ({hint.displayLabel})
      </span>
      <span
        aria-hidden
        className={css({
          flex: '0 0 80px',
          height: '4px',
          borderRadius: '2px',
          backgroundColor: theme.colors.backgroundSecondary,
          position: 'relative',
          overflow: 'hidden',
        })}
      >
        <span
          className={css({
            position: 'absolute',
            inset: 0,
            width: `${Math.max(2, hint.pct * 100)}%`,
            backgroundColor: color,
            transition: 'width 120ms ease-out',
          })}
        />
      </span>
    </div>
  )
}

/** Compact pre-flight token label — "1.2k", "12k", "1.2M", "10M".
 *  Distinct from `formatTokenCount` in `format-tokens.ts` because
 *  pre-flight estimates round more aggressively (no decimals past
 *  10k / 10M) and use lowercase `k` to read as "estimate" rather than
 *  "exact count". */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `${n}`
}
