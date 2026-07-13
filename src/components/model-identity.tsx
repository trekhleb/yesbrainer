import { useStyletron } from 'baseui'
import { LabelSmall } from 'baseui/typography'
import { ProviderLogo } from '@/components/provider-logo'
import { getModel } from '@/models/registry'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
/**
 * Provider-logo + model-label pair — the most common way the app refers
 * to a model in headers, chips, and column titles. Extracted because the
 * same three-element layout (logo + label + inline-flex) was inlined in
 * five places.
 *
 * Caller can opt in to extra trailing content (e.g. action buttons) by
 * passing `children`; the wrapper stays inline-flex so the trailing
 * elements sit on the same baseline as the logo + label.
 */
export interface ModelIdentityProps {
  modelId: string
  /** Logo size in px — default 14 (matches the chip / pane / column
   *  inline-text size). Use 16 in modal headers and similar. */
  logoSize?: number
  /** Override the rendered label. Used to surface the disambiguated
   *  "Llama 3.1 8B #2"-style suffix when a council has multiple seats
   *  on the same model — see `getSeatDisplayLabel`. Falls back to the
   *  registry label when unset. */
  displayLabel?: string
  /** Hide the text label below 768px (icon-only on mobile) — for tight
   *  headers where the model name would otherwise wrap. Also keeps the
   *  label on a single line at all widths. */
  hideLabelOnMobile?: boolean
  /** Trailing nodes (badges, action buttons) rendered after the label
   *  inside the same inline-flex wrapper. */
  children?: React.ReactNode
  /** Wrap the logo + label in a gentle grey pill (rounded
   *  `backgroundSecondary` chip) so the identity reads as a distinct unit
   *  next to an adjacent label — e.g. the "MEDIATOR" stage label, where the
   *  bare name otherwise runs on as one phrase. On mobile (with
   *  `hideLabelOnMobile`) it collapses to a tidy logo-only chip. */
  pill?: boolean
}

export function ModelIdentity({
  modelId,
  logoSize = 14,
  displayLabel,
  hideLabelOnMobile = false,
  children,
  pill = false,
}: ModelIdentityProps) {
  const [css, theme] = useStyletron()
  const model = getModel(modelId)
  return (
    <span
      className={css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...(pill
          ? {
              paddingTop: '2px',
              paddingBottom: '2px',
              paddingLeft: '8px',
              paddingRight: '8px',
              backgroundColor: theme.colors.backgroundSecondary,
              borderRadius: '999px',
            }
          : {}),
      })}
    >
      <ProviderLogo provider={model.provider} size={logoSize} />
      <LabelSmall
        marginTop="0"
        marginBottom="0"
        overrides={
          hideLabelOnMobile
            ? {
                Block: {
                  style: {
                    whiteSpace: 'nowrap',
                    [MOBILE_MEDIA_QUERY]: { display: 'none' },
                  },
                },
              }
            : undefined
        }
      >
        {displayLabel ?? model.label}
      </LabelSmall>
      {children}
    </span>
  )
}
