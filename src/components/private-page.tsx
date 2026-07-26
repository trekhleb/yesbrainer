/**
 * `/private` — the standalone answer to "is there an AI chat I can use
 * without an account, that doesn't keep my conversations, and that takes my
 * own API key?"
 *
 * This exists as its own route because it is the one question the app can
 * answer structurally rather than by promise, and because the home page
 * can't rank for it while doubling as the app shell. Copy here follows the
 * repo's posture strictly: mechanisms as facts, never outcomes as promises,
 * the user's own duties named where keys are involved, and no absolute a
 * pedant could falsify. What the code does *not* cover is stated on the page,
 * not buried — see SECURITY.md, which this links to rather than restating.
 *
 * The prerendered copy a direct load receives is built from this route's
 * entry in `scripts/seo-routes.mjs` — keep the two broadly in sync.
 */

import { useStyletron } from 'baseui'
import {
  LabelLarge,
  LabelMedium,
  ParagraphMedium,
  ParagraphSmall,
} from 'baseui/typography'
import { ProsePage } from '@/components/prose-page'
import {
  GITHUB_REPO_URL,
  SECURITY_DOC_URL,
  SECURITY_THREATS_URL,
} from '@/utils/external-links'

const STORAGE: { asset: string; where: string; who: string }[] = [
  {
    asset: 'API keys',
    where: "Your browser's localStorage, plaintext, per device",
    who: 'The provider you point them at, and only when you actually send a turn.',
  },
  {
    asset: 'Conversations',
    where: "Your browser's IndexedDB",
    who: 'No copy is synced or stored anywhere else. Their content reaches only the providers you send turns to.',
  },
  {
    asset: 'Settings',
    where: 'localStorage',
    who: 'Nobody.',
  },
  {
    asset: 'Provider API calls',
    where: 'Direct browser → provider over TLS',
    who: 'The provider you chose.',
  },
]

export function PrivatePage() {
  const [css, theme] = useStyletron()

  const link = css({ color: theme.colors.contentPrimary })

  return (
    <ProsePage
      title="An AI chat with no account, no server, and your own API keys"
      documentTitle="No account, no server — Yes-Brainer"
      lede={
        <>
          Yes-Brainer asks several AI models one question and shows you where
          their answers differ. It runs entirely in your browser: there is no
          sign-up, and no server run by this project holds your conversations.
        </>
      }
    >
      <section
        className={css({ display: 'flex', flexDirection: 'column', gap: '8px' })}
      >
        <LabelLarge marginTop="0" marginBottom="0">
          No account
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          There is no sign-up form, no email, no password and no profile —
          because there is no backend to hold one. You open the site and use
          it. Recorded demo councils can be read without any API key at all, so
          you can see what the app does before deciding whether to paste
          anything into it.
        </ParagraphMedium>
      </section>

      <section
        className={css({ display: 'flex', flexDirection: 'column', gap: '8px' })}
      >
        <LabelLarge marginTop="0" marginBottom="0">
          No server of ours in the middle
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          The app is a static bundle of HTML, CSS and JavaScript. The network
          traffic from your browser is calls to the model providers you chose,
          with your keys — direct to the vendor for the native adapters, and
          through OpenRouter&apos;s gateway first if you use OpenRouter, which
          is what its one-key-many-vendors convenience buys.
        </ParagraphMedium>
        <ParagraphMedium marginTop="0" marginBottom="0">
          There is also one cookieless counter on the official site. It records
          the route pattern, screen size, language, the referrer that brought
          you, and counts of a few feature-level actions — that a feature was
          used, not what was in it. No cookies, no client-side identifier, and
          it is described in full in the{' '}
          <a className={link} href={SECURITY_DOC_URL} rel="noopener">
            security document
          </a>
          . Here is where everything lives:
        </ParagraphMedium>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginTop: '4px',
          })}
        >
          {STORAGE.map((row) => (
            <div
              key={row.asset}
              className={css({
                border: `1px solid ${theme.colors.borderOpaque}`,
                borderRadius: theme.borders.radius300,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              })}
            >
              <LabelMedium marginTop="0" marginBottom="0">
                {row.asset}
              </LabelMedium>
              <ParagraphSmall
                marginTop="0"
                marginBottom="0"
                color={theme.colors.contentSecondary}
              >
                {row.where}
              </ParagraphSmall>
              <ParagraphSmall
                marginTop="0"
                marginBottom="0"
                color={theme.colors.contentSecondary}
              >
                {row.who}
              </ParagraphSmall>
            </div>
          ))}
        </div>
      </section>

      <section
        className={css({ display: 'flex', flexDirection: 'column', gap: '8px' })}
      >
        <LabelLarge marginTop="0" marginBottom="0">
          Your own API keys
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          Yes-Brainer is bring-your-own-key: you paste keys for the providers
          you want to use — Anthropic, OpenAI, Google, Groq, OpenRouter, or a
          local Ollama that needs no key — and you pay those providers directly
          for what you use. There is no subscription and no paywall on the app
          itself.
        </ParagraphMedium>
        <ParagraphMedium marginTop="0" marginBottom="0">
          Two duties stay yours, and they matter. Before pasting a key into any
          site claiming to be Yes-Brainer, check that the address bar reads{' '}
          <strong>yesbrainer.ai</strong> — a copied site can imitate everything
          except its URL, and this page and the{' '}
          <a className={link} href={GITHUB_REPO_URL} rel="noopener">
            repository
          </a>{' '}
          should agree on that domain. And cap the blast radius: use a key
          created just for this app, with a spending limit set in your
          provider&apos;s console, revocable there the moment anything looks
          off.
        </ParagraphMedium>
      </section>

      <section
        className={css({ display: 'flex', flexDirection: 'column', gap: '8px' })}
      >
        <LabelLarge marginTop="0" marginBottom="0">
          What this does not do
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          Keeping data on your device moves the risk rather than removing it.
          Anything with access to your browser profile can read what is stored
          there. Losing the device loses the data on it — there is no reset
          flow, which is why export exists. Browsers can evict site storage.
          And your prompts still travel to whichever model providers you point
          the app at, under their terms, not this project&apos;s.
        </ParagraphMedium>
        <ParagraphMedium marginTop="0" marginBottom="0">
          The full threat model, including{' '}
          <a className={link} href={SECURITY_THREATS_URL} rel="noopener">
            what the code cannot protect against
          </a>
          , is written down rather than summarised away. The source is public
          under the AGPL, so the claims on this page are checkable rather than
          taken on trust. The software is provided as-is, with no warranty.
        </ParagraphMedium>
      </section>

      <section
        className={css({ display: 'flex', flexDirection: 'column', gap: '8px' })}
      >
        <LabelLarge marginTop="0" marginBottom="0">
          About the answers themselves
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          Every answer the app shows is generated by an AI model and can be
          confidently wrong. Seating several models reduces the odds that one
          model&apos;s blind spot goes unnoticed, but agreement between models
          is not evidence that they are right. Yes-Brainer shows you the
          spread; the judgment stays yours.
        </ParagraphMedium>
      </section>
    </ProsePage>
  )
}
