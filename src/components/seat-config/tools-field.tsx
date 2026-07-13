/**
 * Tools picker. Two render modes:
 *
 * - **Single-tool case** (provider exposes ≤ 1 tool) — binary
 *   checkbox; enabling adds the available tool, disabling clears.
 * - **Multi-tool case** — one checkbox per available tool, all on
 *   by default. The save logic in the modal collapses the array
 *   to the most-compact storage shape (see `SeatConfigModal.save`).
 */

import { useStyletron } from 'baseui'
import { Checkbox } from 'baseui/checkbox'
import { FormControl } from 'baseui/form-control'
import { LabelXSmall, ParagraphXSmall } from 'baseui/typography'
import {
  TOOL_DESCRIPTION,
  TOOL_DISPLAY_LABEL,
} from '@/providers/tools'

export function ToolsField({
  toolsSupported,
  availableTools,
  enabledTools,
  setEnabledTools,
  modelLabel,
}: {
  toolsSupported: boolean
  availableTools: string[]
  enabledTools: string[]
  setEnabledTools: (
    updater: (cur: string[]) => string[],
  ) => void
  modelLabel: string
}) {
  const [css] = useStyletron()
  return (
    <FormControl
      label="Tools"
      caption={
        !toolsSupported
          ? `${modelLabel} does not advertise tool support.`
          : 'What this seat may call while answering. The composer can also mute tools for a single message.'
      }
    >
      {availableTools.length <= 1 ? (
        // Single-tool case — keep the binary checkbox so existing
        // councils don't suddenly see a one-row list.
        <Checkbox
          checked={enabledTools.length > 0}
          disabled={!toolsSupported}
          onChange={(e) => {
            // Capture before the updater runs — React nulls the event's
            // `currentTarget` after the handler returns (see keys-tab).
            const checked = e.currentTarget.checked
            setEnabledTools(() => (checked ? [...availableTools] : []))
          }}
        >
          <LabelXSmall>Enable provider-side tool calls</LabelXSmall>
        </Checkbox>
      ) : (
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          })}
        >
          {availableTools.map((name) => {
            const checked = enabledTools.includes(name)
            return (
              <Checkbox
                key={name}
                checked={checked}
                onChange={(e) => {
                  // Capture before the updater runs — React nulls the
                  // event's `currentTarget` after the handler returns.
                  const want = e.currentTarget.checked
                  setEnabledTools((cur) => {
                    const isOn = cur.includes(name)
                    if (want === isOn) return cur
                    if (want) {
                      // Preserve the canonical (available) order so
                      // the persisted array doesn't churn when
                      // multiple checkboxes are toggled.
                      return availableTools.filter(
                        (n) => n === name || cur.includes(n),
                      )
                    }
                    return cur.filter((n) => n !== name)
                  })
                }}
              >
                <div
                  className={css({
                    display: 'flex',
                    flexDirection: 'column',
                  })}
                >
                  <LabelXSmall>
                    {TOOL_DISPLAY_LABEL[
                      name as keyof typeof TOOL_DISPLAY_LABEL
                    ] ?? name}
                  </LabelXSmall>
                  <ParagraphXSmall
                    marginTop="0"
                    marginBottom="0"
                    color="contentTertiary"
                  >
                    {TOOL_DESCRIPTION[
                      name as keyof typeof TOOL_DESCRIPTION
                    ] ?? ''}
                  </ParagraphXSmall>
                </div>
              </Checkbox>
            )
          })}
        </div>
      )}
    </FormControl>
  )
}
