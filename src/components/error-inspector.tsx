import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { StatefulPopover, PLACEMENT, TRIGGER_TYPE } from 'baseui/popover'
import { LabelXSmall, ParagraphXSmall } from 'baseui/typography'
import { FiFileText } from 'react-icons/fi'

/**
 * Click-to-open popover that surfaces the raw model response when a
 * structured parse failed — the dual of `<PromptInspector>`. Same visual
 * pattern (small file-icon button → popover with content) but tinted red
 * to signal "this is what came BACK, and it was bad", versus the prompt
 * inspector's neutral "this is what we SENT".
 *
 * Used today by the voting block when a voter LLM returns a response that
 * doesn't match the expected schema. Reusable for any future error case
 * where the raw response is worth surfacing.
 */
export interface ErrorInspectorProps {
  /** Short header label shown at the top of the popover. */
  label: string
  /** Raw response text (typically pretty-printed JSON). */
  rawResponse: string
  /** Optional explanatory copy shown above the response. */
  description?: string
  ariaLabel?: string
}

export function ErrorInspector({
  label,
  rawResponse,
  description,
  ariaLabel,
}: ErrorInspectorProps) {
  const [, theme] = useStyletron()
  return (
    <StatefulPopover
      placement={PLACEMENT.bottom}
      triggerType={TRIGGER_TYPE.click}
      autoFocus={false}
      overrides={{
        Body: { style: { maxWidth: '520px', zIndex: 30 } },
        Inner: { style: { padding: 0 } },
      }}
      content={() => (
        <InspectorBody
          label={label}
          rawResponse={rawResponse}
          description={description}
        />
      )}
    >
      <Button
        type="button"
        kind={KIND.tertiary}
        size={SIZE.mini}
        aria-label={ariaLabel ?? `Show ${label}`}
        title="Show what the model returned"
        overrides={{
          BaseButton: {
            style: {
              paddingLeft: '6px',
              paddingRight: '6px',
              color: theme.colors.negative,
            },
          },
        }}
      >
        <FiFileText size={14} aria-hidden />
      </Button>
    </StatefulPopover>
  )
}

function InspectorBody({
  label,
  rawResponse,
  description,
}: Omit<ErrorInspectorProps, 'ariaLabel'>) {
  const [css, theme] = useStyletron()
  return (
    <div className={css({ padding: '12px', minWidth: '320px' })}>
      <LabelXSmall
        marginTop="0"
        marginBottom="8px"
        color={theme.colors.negative}
        overrides={{
          Block: {
            style: {
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 600,
            },
          },
        }}
      >
        {label}
      </LabelXSmall>

      {description && (
        <ParagraphXSmall
          marginTop="0"
          marginBottom="6px"
          color={theme.colors.contentTertiary}
        >
          {description}
        </ParagraphXSmall>
      )}

      <pre
        className={css({
          margin: 0,
          padding: '8px 10px',
          backgroundColor: theme.colors.backgroundSecondary,
          borderRadius: '6px',
          fontSize: '12px',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '260px',
          overflow: 'auto',
        })}
      >
        {rawResponse}
      </pre>
    </div>
  )
}
