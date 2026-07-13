/**
 * "Bring your own keys" call-to-action — shown on both the first-run
 * onboarding (no usable model yet) and the shareable /about page. Just the
 * action: the button navigates to Settings → Keys. The provider logo strip
 * that used to sit above it moved up into `<AboutContent>` proper
 * (`providers-strip.tsx`) so the CTA block stays small
 * and lands higher on the page.
 *
 * Below the CTA: **"See it in action"** — the seeded demo councils as
 * tappable rows (replaced a single
 * anonymous "explore a demo council →" text link). The rows lead with the
 * *actual recorded questions*: every demo is curated to be a yes-brainer,
 * so the questions themselves are the pitch — a keyless visitor reads
 * "Choosing the best backend language", recognizes their own problem, and
 * taps into a real deliberation (which opens at the top, reading like a
 * story). Structure pill = the same vocabulary the sidebar teaches; real
 * `<Link>`s so middle-click / cmd-click work. Demo provenance lives on the
 * sidebar's Demo tag (the in-thread banner was removed — too
 * costly on phones), and the keyless composer carries the keys CTA.
 * Capped at 3 — the folder order is the curation order, and the card must
 * stay a card.
 */

import { useStyletron } from 'baseui'
import { Button } from 'baseui/button'
import { LabelXSmall, ParagraphSmall } from 'baseui/typography'
import { FiArrowRight, FiKey } from 'react-icons/fi'
import { Link, useNavigate } from 'react-router-dom'
import { councilPath } from '@/hooks/use-app-route'
import { StructurePill } from '@/components/structure-pill'
import type { CouncilSummary } from '@/storage/councils'
import { GITHUB_REPO_URL } from '@/utils/external-links'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

export function GetStartedKeys({
  demos = [],
}: {
  /** Seeded demo councils (sidebar order). When present, the card offers
   *  them as "See it in action" rows — the zero-cost way to feel the
   *  product before adding keys. */
  demos?: CouncilSummary[]
} = {}) {
  const [css, theme] = useStyletron()
  const navigate = useNavigate()
  return (
    // Headline → one-line reassurance → the action. Centre-aligned so it
    // reads as the page's focal move; the button goes full-width on phones
    // for an easy thumb target. Renders inside AboutContent's get-started
    // card, above the "works with" provider strip.
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'center',
      })}
    >
      <div
        className={css({
          fontSize: '18px',
          lineHeight: 1.3,
          fontWeight: 650,
          letterSpacing: '-0.01em',
          color: theme.colors.contentPrimary,
          textAlign: 'center',
        })}
      >
        Get started in a minute
      </div>
      {/* Only facts *we* control — no third-party pricing/tier promises
          (a provider can change its free tier overnight and the copy would
          quietly mislead). Each provider's real terms
          are one click away behind the "Get key" links in Settings → Keys.
          The open-source link lands here on purpose: this is the exact
          moment the visitor asks "is it safe to paste a key?" — the
          strongest trust placement in the app. Worded as an *ability*, not
          a guarantee ("verify that claim… your responsibility either
          way"): the app never positions itself as a
          guarantor of key safety — verification is offered, the outcome
          stays the user's. The full duties (URL check, capped key) live on
          the Keys page where pasting actually happens. */}
      <ParagraphSmall
        marginTop="0"
        marginBottom="0"
        color={theme.colors.contentSecondary}
        overrides={{ Block: { style: { textAlign: 'center', maxWidth: '52ch' } } }}
      >
        Bring your own API keys — they stay in this browser and go straight
        to the provider you chose. The code is{' '}
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
        </a>
        , so you can verify that claim — and your keys remain your
        responsibility either way.
      </ParagraphSmall>
      <Button
        type="button"
        onClick={() => navigate('/settings/keys')}
        startEnhancer={() => <FiKey size={16} />}
        overrides={{
          BaseButton: {
            style: {
              marginTop: '6px',
              [MOBILE_MEDIA_QUERY]: { width: '100%' },
            },
          },
        }}
      >
        Add your keys to begin
      </Button>
      {demos.length > 0 && (
        <div
          className={css({
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '10px',
          })}
        >
          {/* Same quiet micro-label convention as the WORKS WITH strip
              below — two labelled sub-rows, one visual language. */}
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
                  textAlign: 'center',
                },
              },
            }}
          >
            See it in action
          </LabelXSmall>
          {demos.slice(0, 3).map((d) => (
            <Link
              key={d.id}
              to={councilPath(d.id)}
              className={css({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingTop: '11px',
                paddingBottom: '11px',
                paddingLeft: '12px',
                paddingRight: '12px',
                borderRadius: '10px',
                border: `1px solid ${theme.colors.borderOpaque}`,
                backgroundColor: theme.colors.backgroundPrimary,
                textDecoration: 'none',
                color: theme.colors.contentPrimary,
                transition:
                  'background-color 120ms ease, border-color 120ms ease',
                ':hover': {
                  backgroundColor: theme.colors.backgroundSecondary,
                  borderColor: theme.colors.borderSelected,
                },
              })}
            >
              <StructurePill structure={d.socialStructure} size="small" />
              {/* The full question, wrapping — the yes-brainer is the hook;
                  truncating it would cut the pitch mid-sentence. */}
              <span
                className={css({
                  flex: '1 1 0%',
                  minWidth: 0,
                  fontSize: '13px',
                  lineHeight: 1.35,
                  fontWeight: 500,
                  textAlign: 'left',
                })}
              >
                {d.title ?? 'Untitled council'}
              </span>
              <FiArrowRight
                size={14}
                aria-hidden
                className={css({
                  flexShrink: 0,
                  color: theme.colors.contentTertiary,
                })}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
