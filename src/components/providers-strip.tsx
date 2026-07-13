/**
 * "Supported providers" section — a headed strip of provider logos, derived
 * from the registry so it can't drift from the models we actually support.
 * Rendered by `<AboutContent>` between the deliberation modes and the
 * differentiators (it used to live inside the
 * `<GetStartedKeys>` CTA block at the very bottom; surfacing it earlier
 * answers "will it work with my models?" while the visitor is still
 * reading, and slims the CTA block down to the action itself).
 */

import { useStyletron } from 'baseui'
import { LabelXSmall } from 'baseui/typography'
import { IconTooltip } from '@/components/icon-tooltip'
import { ProviderLogo } from '@/components/provider-logo'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { registry, type ProviderId } from '@/models/registry'

// Tooltip label per provider — the company (matching the logo) + the model
// family people recognise it by.
const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI (ChatGPT)',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (local)',
}

// Logo-strip order: lead with the flagships we steer people toward first
// (Claude, Gemini, ChatGPT), then the rest, with local Ollama last (it only
// appears at all once its opt-in Settings → Keys toggle is on). Filtered
// against the registry so it only lists providers we actually support; add
// new providers here to give them a spot.
const PROVIDER_ORDER: ProviderId[] = [
  'anthropic', // Claude
  'google', // Gemini
  'openai', // ChatGPT
  'groq',
  'openrouter',
  'ollama', // local, opt-in — last
]
const SUPPORTED = new Set(registry.map((m) => m.provider))
const PROVIDERS: ProviderId[] = PROVIDER_ORDER.filter((p) => SUPPORTED.has(p))

export function ProvidersStrip() {
  const [css, theme] = useStyletron()
  const { enabled: ollamaEnabled } = useOllamaReachable()
  // Ollama is opt-in — until its Settings → Keys toggle is on, the logo
  // strip stays silent about local models.
  const providers = ollamaEnabled
    ? PROVIDERS
    : PROVIDERS.filter((p) => p !== 'ollama')
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      })}
    >
      {/* Quiet micro-label, not a section header — inside the get-started
          card the logos are the *trust row under the action*, so they take
          the "WORKS WITH" convention rather than headline billing. */}
      <LabelXSmall
        marginTop="0"
        marginBottom="0"
        color={theme.colors.contentTertiary}
        overrides={{
          Block: {
            style: {
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              fontWeight: 600,
            },
          },
        }}
      >
        Works with
      </LabelXSmall>
      <div
        className={css({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '18px',
          rowGap: '14px',
          flexWrap: 'wrap',
        })}
      >
        {providers.map((p) => (
          <IconTooltip key={p} label={PROVIDER_LABEL[p]}>
            {/* span wrapper gives the tooltip a real DOM trigger to ref */}
            <span className={css({ display: 'inline-flex' })}>
              <ProviderLogo provider={p} size={36} />
            </span>
          </IconTooltip>
        ))}
      </div>
    </div>
  )
}
