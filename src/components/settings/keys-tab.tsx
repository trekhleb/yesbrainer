/**
 * Settings → Keys.
 *
 * BYOK paste fields, one per provider. Keys are stored only in this
 * browser's localStorage and sent directly from here to the provider
 * over TLS — see the BYOK section of README.md for the architectural
 * guarantee.
 */

import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Checkbox, STYLE_TYPE } from 'baseui/checkbox'
import { FormControl } from 'baseui/form-control'
import { Input } from 'baseui/input'
import { FiExternalLink } from 'react-icons/fi'
import { FaCheckCircle } from 'react-icons/fa'
import { analytics } from '@/analytics'
import { ProviderLogo } from '@/components/provider-logo'
import { SettingsNotice } from '@/components/settings/settings-notice'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { setOllamaEnabled } from '@/storage/ollama'
import { COMPACT_INPUT_FONT_STYLE } from '@/utils/input-styles'
import type { ApiKeys } from '@/storage/keys'
import type { ProviderId } from '@/models/registry'
import { GITHUB_REPO_URL, SECURITY_THREATS_URL } from '@/utils/external-links'

interface ProviderField {
  id: ProviderId
  label: string
  hint: string
  getKeyUrl: string
}

/** Every key-based provider (Ollama is local and keyless — it has its own
 *  section below). `satisfies` makes a newly added `ProviderId` fail
 *  typecheck until it gets a key field here — a provider without one
 *  would be silently unreachable. Insertion order is the render order. */
const PROVIDER_FIELD_META = {
  anthropic: {
    label: 'Anthropic (Claude)',
    hint: 'sk-ant-...',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI (GPT)',
    hint: 'sk-...',
    getKeyUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    label: 'Google (Gemini)',
    hint: 'AI...',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
  },
  groq: {
    label: 'Groq',
    hint: 'gsk_...',
    getKeyUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    label: 'OpenRouter',
    hint: 'sk-or-...',
    getKeyUrl: 'https://openrouter.ai/keys',
  },
} satisfies Record<Exclude<ProviderId, 'ollama'>, Omit<ProviderField, 'id'>>

const PROVIDER_FIELDS: ProviderField[] = Object.entries(
  PROVIDER_FIELD_META,
).map(([id, meta]) => ({ id: id as ProviderId, ...meta }))

export function KeysTab({
  keys,
  setKeys,
}: {
  keys: ApiKeys
  setKeys: (updater: (k: ApiKeys) => ApiKeys) => void
}) {
  const [css] = useStyletron()
  return (
    <div>
      {/* Deliberate info banner (not quiet text): the privacy guarantee is the
          headline product property, so we stress it up front here. */}
      <SettingsNotice kind="info">
        <strong>You own your keys.</strong> They're stored only in this
        browser and sent straight to the provider you chose — there's no
        server of ours in between. Rotate or revoke them from the provider's
        dashboard at any time. The app is{' '}
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={css({
            color: 'inherit',
            textDecorationLine: 'underline',
            ':hover': { textDecorationLine: 'none' },
          })}
        >
          open source
        </a>{' '}
        — verify any of this yourself; the full threat model —{' '}
        <a
          href={SECURITY_THREATS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={css({
            color: 'inherit',
            textDecorationLine: 'underline',
            ':hover': { textDecorationLine: 'none' },
          })}
        >
          including what it can't protect against
        </a>{' '}
        — is public too.
      </SettingsNotice>

      {/* The user-side layer of the clone-guard, in its own warning notice
          so it reads as a caution, not fine print. Deliberate
          responsibility transfer: the app states
          mechanisms as facts but never guarantees outcomes, and this is
          where the user's two jobs are named — right domain (the in-app
          notice in unofficial-copy-notice.tsx can be stripped from a
          malicious copy, but a habit learned here survives; the address
          bar is the one thing a copy can't fake) and a capped dedicated
          key (makes any leak a bounded, revocable event). Plain bold text,
          not a link: the point is to READ the URL bar, not click. */}
      {/* Spacer div, not a shared-primitive change: SettingsNotice zeroes
          the Notification margins for every settings banner, and only this
          spot stacks two of them. */}
      <div className={css({ marginTop: '8px' })}>
        <SettingsNotice kind="warning">
          <strong>Your part.</strong> A copied site can fake everything
          except the URL — before pasting a key, check that the address bar
          says <strong>yesbrainer.ai</strong> (the official domain is also
          pinned in{' '}
          {/* Cross-check triangulation: a clone controls its own copy of
              the app but not the trekhleb/yesbrainer README — it can only
              link it (and be contradicted) or drop it (and lose the
              credibility prop). */}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={css({
              color: 'inherit',
              textDecorationLine: 'underline',
              ':hover': { textDecorationLine: 'none' },
            })}
          >
            the GitHub README
          </a>
          , so the two can be cross-checked); this app can't protect a key
          pasted into a copy. And cap the blast radius: use a dedicated key
          just for this app, set a spending limit in the provider's
          console, and revoke it there the moment anything looks off.
        </SettingsNotice>
      </div>

      <div className={css({ marginTop: '16px' })}>
        {PROVIDER_FIELDS.map((f) => {
          const configured = !!keys[f.id]
          return (
            <FormControl
              key={f.id}
              label={
                <span
                  className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  })}
                >
                  <ProviderLogo provider={f.id} size={16} />
                  {f.label}
                  {/* Right-aligned cluster: the configured ✓ sits next to the
                      "Get key" button rather than beside the label. */}
                  <span
                    className={css({
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    })}
                  >
                    {configured && <ConfiguredCheck />}
                    <Button
                      kind={KIND.secondary}
                      size={SIZE.mini}
                      endEnhancer={() => <FiExternalLink size={12} />}
                      overrides={{
                        BaseButton: {
                          // Render as a real anchor (so cmd/middle-click opens a
                          // tab + the href actually navigates). Styletron uses
                          // `$as` — plain `as` is a no-op attribute on a button.
                          props: {
                            $as: 'a',
                            href: f.getKeyUrl,
                            target: '_blank',
                            rel: 'noopener noreferrer',
                          },
                        },
                      }}
                    >
                      Get key
                    </Button>
                  </span>
                </span>
              }
            >
              <Input
                type="password"
                value={keys[f.id] ?? ''}
                onChange={(e) => {
                  // Read the value synchronously: React resets the synthetic
                  // event's `currentTarget` to null once the handler returns,
                  // so a *lazy* updater that reads `e.currentTarget` later (in
                  // the reducer/render phase) would crash on null.
                  const value = e.currentTarget.value
                  // Count the empty→non-empty edge (one event per paste,
                  // not per keystroke): the BYOK conversion moment.
                  if (!keys[f.id]?.trim() && value.trim()) {
                    analytics.event(`key-added:${f.id}`)
                  }
                  setKeys((k) => ({ ...k, [f.id]: value }))
                }}
                placeholder={f.hint}
                autoComplete="off"
                overrides={{
                  Input: {
                    props: { spellCheck: false },
                    style: COMPACT_INPUT_FONT_STYLE,
                  },
                }}
              />
            </FormControl>
          )
        })}
      </div>

      <OllamaSection />
    </div>
  )
}

/**
 * Local models via Ollama — deliberately the last row, and a toggle rather
 * than a key field: enabling is the moral equivalent of configuring a key.
 * Off by default so the app never probes localhost unsolicited (a hosted
 * page pinging `localhost:11434` reads as a port scan — see
 * `storage/ollama.ts`). Once enabled, the live reachability status renders
 * inline right here, so the "daemon not running / origin not allowed"
 * troubleshooting has a home.
 */
function OllamaSection() {
  const [css, theme] = useStyletron()
  const { enabled, reachable, checked } = useOllamaReachable()
  // On the hosted app (non-localhost origin) a running daemon still
  // rejects us unless the user allowlists the origin — surface the fix.
  const needsOriginHint = !['localhost', '127.0.0.1'].includes(
    window.location.hostname,
  )
  return (
    <div
      className={css({
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: `1px solid ${theme.colors.borderOpaque}`,
      })}
    >
      <FormControl
        label={
          <span
            className={css({
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            })}
          >
            <ProviderLogo provider="ollama" size={16} />
            Ollama (local models)
            <span
              className={css({
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
              })}
            >
              {enabled && reachable && (
                <ConfiguredCheck label="Ollama is running" />
              )}
            </span>
          </span>
        }
        caption={
          enabled && checked && !reachable ? (
            <span className={css({ color: theme.colors.negative })}>
              Ollama isn't reachable — make sure the daemon is running
              (<code>ollama serve</code>)
              {needsOriginHint && (
                <>
                  {' '}
                  and allows this origin: start it with{' '}
                  <code>OLLAMA_ORIGINS={window.location.origin}</code>
                </>
              )}
              .
            </span>
          ) : (
            <>
              No key needed — talks to your local daemon at{' '}
              <code>localhost:11434</code>. Off by default, so the app never
              probes localhost until you opt in.
            </>
          )
        }
      >
        <Checkbox
          checked={enabled}
          onChange={(e) => {
            const enabled = e.currentTarget.checked
            // "The moral equivalent of adding a key" (README) — counted the
            // same way, on the enable edge only.
            if (enabled) analytics.event('ollama-enabled')
            setOllamaEnabled(enabled)
          }}
          checkmarkType={STYLE_TYPE.toggle_round}
        >
          Enable Ollama on localhost
        </Checkbox>
      </FormControl>
    </div>
  )
}

function ConfiguredCheck({ label = 'Key configured' }: { label?: string }) {
  const [css, theme] = useStyletron()
  return (
    <span
      title={label}
      aria-label={label}
      className={css({
        color: theme.colors.positive,
        display: 'inline-flex',
        flexShrink: 0,
      })}
    >
      <FaCheckCircle size={14} aria-hidden />
    </span>
  )
}
