/**
 * Inline annotation rendered just above a Participant's markdown body
 * when the seat called a provider-native tool during streaming.
 *
 * Grouped: one row per *distinct* tool, with an `· N×` count when it ran
 * more than once. A model can fire a dozen web searches for a single
 * answer, and a dozen identical "web_search" rows is pure noise — this
 * strip is a provenance signal ("this answer used live data"), not an
 * audit log, so one compact line per tool is all it needs.
 */

import { useStyletron } from 'baseui'
import { getToolDisplayLabel } from '@/providers/tools'
import type { ToolCallSummary } from '@/types/council'

/** Presentational glyph per tool (decorative — not domain data, so it lives
 *  here). Anything unmapped falls back to a neutral wrench. */
const TOOL_ICON: Record<string, string> = {
  web_search: '🌐',
  url_context: '🔗',
  code_execution: '🔧',
}

export function ToolCallStrip({
  toolCalls,
}: {
  toolCalls: ToolCallSummary[]
}) {
  const [css, theme] = useStyletron()

  // Collapse repeated calls of the same tool into one row + count, keeping
  // first-seen order.
  const counts = new Map<string, number>()
  for (const call of toolCalls) {
    counts.set(call.name, (counts.get(call.name) ?? 0) + 1)
  }

  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        fontSize: '12px',
        color: theme.colors.contentTertiary,
        marginBottom: '4px',
      })}
    >
      {Array.from(counts, ([name, count]) => (
        <span
          key={name}
          className={css({
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: '6px',
          })}
        >
          <span aria-hidden>{TOOL_ICON[name] ?? '🔧'}</span>
          <span>{getToolDisplayLabel(name)}</span>
          {count > 1 && (
            <span className={css({ fontVariantNumeric: 'tabular-nums' })}>
              · {count}×
            </span>
          )}
        </span>
      ))}
    </div>
  )
}
