/**
 * The shared "what is this?" explainer — hero, the deliberation modes
 * (from the shared SOCIAL_STRUCTURES metadata), and the differentiators.
 * Reused by two surfaces so they can't drift:
 *  - `<Onboarding>` — the first-run empty state (adds a capability CTA:
 *    `<GetStartedKeys>` with no model, or "Convene your first council" once
 *    one is usable).
 *  - `<AboutPage>` — the shareable `#about` route (adds `<GetStartedKeys>`).
 *
 * The `children` slot renders at the bottom of the centred column, so each
 * caller drops its own call-to-action in at the right width / position.
 */

import { useStyletron } from 'baseui'
import {
  HeadingMedium,
  LabelLarge,
  LabelMedium,
  ParagraphMedium,
  ParagraphSmall,
} from 'baseui/typography'
import type { IconType } from 'react-icons'
import {
  FiGithub,
  FiHardDrive,
  FiKey,
  FiMessageSquare,
  FiUnlock,
  FiUserX,
} from 'react-icons/fi'
import { BrandMark } from '@/components/brand-mark'
import { DeliberationCardContent } from '@/components/deliberation-card-content'
import { ProvidersStrip } from '@/components/providers-strip'
import { structureColorSet } from '@/models/social-structure-colors'
import { SOCIAL_STRUCTURES } from '@/models/social-structures'
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from '@/utils/external-links'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
const DIFFERENTIATORS: {
  title: string
  body: React.ReactNode
  Icon: IconType
}[] = [
  {
    title: 'Free & open source',
    // "public" carries the repo link inline (same colour, underlined);
    // it adds no extra line, so all four tiles keep
    // roughly equal height. No "run it yourself" phrasing on purpose —
    // self-hosting isn't something we want the copy to encourage.
    body: (
      <>
        No subscription, no paywall — and the entire codebase is{' '}
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline' }}
        >
          public
        </a>{' '}
        for anyone to read and audit.
      </>
    ),
    Icon: FiUnlock,
  },
  {
    title: 'No accounts, no server',
    body: "There's no sign-up and no backend we operate, so there's nothing of yours for us to hold.",
    Icon: FiUserX,
  },
  {
    title: 'Your keys (BYOK)',
    body: 'Bring your own API keys. They stay in this browser and go straight to the provider you chose.',
    Icon: FiKey,
  },
  {
    title: 'On-device data',
    // "Nothing leaves your device" was quotably false — prompts do go to
    // the chosen provider. Absolutes we don't claim can't be held against
    // us (copy audit).
    body: 'Councils, messages, and settings live in your browser — all that ever leaves is the prompt you send your provider.',
    Icon: FiHardDrive,
  },
]

/**
 * One soft radial blob of the get-started aura. Rendered as an invisible
 * box whose background is a centre→transparent radial in a structure's
 * `solid` hue, heavily blurred, drifting on a very slow transform loop
 * (25–45s, alternate) — ambient "Siri-listening" motion that's only
 * noticeable when stared at. Blur + transform animate on the composited
 * layer (no per-frame repaint); the global `prefers-reduced-motion` rule
 * freezes it at the 0% resting pose, which is also the deterministic pose
 * visual tests capture (`animations: 'disabled'`).
 */
function AuraBlob({
  color,
  alpha,
  style,
  mobile,
  drift,
  duration,
}: {
  /** Structure `glow` hex (6-digit). */
  color: string
  /** Two-digit hex alpha for the blob centre (e.g. '2e'). */
  alpha: string
  /** Position + size within the aura layer (top/left/right/bottom/width). */
  style: Record<string, string>
  /** Position/size overrides under the mobile breakpoint. Needed because
   *  offsets are %-of-card-dimensions while size is %-of-width — on the
   *  narrow-but-tall phone card the desktop offsets fling the (smaller)
   *  blobs almost entirely outside the overflow clip, leaving the card
   *  nearly white. */
  mobile?: Record<string, string>
  /** 100% keyframe transform, e.g. 'translate(4%, 6%) scale(1.06)'. */
  drift: string
  duration: string
}) {
  const [css] = useStyletron()
  return (
    <div
      className={css({
        position: 'absolute',
        aspectRatio: '1 / 1',
        backgroundImage: `radial-gradient(circle, ${color}${alpha} 0%, transparent 68%)`,
        filter: 'blur(44px)',
        animationName: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '100%': { transform: drift },
        },
        animationDuration: duration,
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDirection: 'alternate',
        ...style,
        ...(mobile ? { [MOBILE_MEDIA_QUERY]: mobile } : {}),
      })}
    />
  )
}

export function AboutContent({ children }: { children?: React.ReactNode }) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  // The aura wears the three council-type hues from the central palette
  // (auto-follows ACTIVE_PALETTE): blue answers + teal consensus + gold
  // verdict converging behind the one action that starts it all. `glow` =
  // the bright gradient-end hues — the 600-weight solids read muddy/ochre
  // at low alpha over the page background. Alphas step up on dark (glows
  // read brighter there).
  const blue = structureColorSet('roundtable', isDark).glow
  const teal = structureColorSet('consensus', isDark).glow
  const gold = structureColorSet('trial', isDark).glow
  // Same quiet link treatment as the sidebar footer's `linkStyle`.
  const colophonLink = css({
    color: theme.colors.contentTertiary,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    ':hover': { color: theme.colors.contentPrimary },
    transition: 'color 120ms ease',
  })
  return (
    <div
      className={css({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // The aura bleeds past the content column on purpose; without this
        // the scroll container would grow a horizontal scrollbar for it
        // (overflow-y:auto forces overflow-x to compute to auto, not
        // visible). Nothing else page-level scrolls horizontally.
        overflowX: 'hidden',
      })}
    >
      <div
        className={css({
          width: '100%',
          // Cap the measure — full-bleed prose on a wide desktop pushes
          // line lengths well past comfortable reading.
          maxWidth: '880px',
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          // Stacking scope for the get-started aura: the aura sits at
          // z-index −1 *within this column*, so it paints under every
          // in-flow thing here (neighbour cards' backgrounds, text, the
          // card itself — truly background, only page whitespace shows
          // it), and nothing in the group can escape upward to cover
          // Base Web's portal layers (the mobile drawer carries no
          // z-index of its own).
          isolation: 'isolate',
          // All gutter lives inside the scroll viewport (the parent `<main>`
          // adds none for prose pages), so the content scrolls flush under
          // the header / footer with no dead padding band. Roomier sides on
          // mobile, matching the header + tagline strip.
          paddingTop: '28px',
          paddingBottom: '24px',
          paddingLeft: '16px',
          paddingRight: '16px',
          [MOBILE_MEDIA_QUERY]: {
            paddingLeft: '20px',
            paddingRight: '20px',
          },
        })}
      >
        {/* Hero — a two-line lockup: the brand line
            (mark + "Yes-Brainer") stays short and confident, and the tagline
            gets its own smaller line below instead of wrapping 2–3 deep
            inside the heading (on phones the old one-liner h1 ate half the
            first screen). Then the sub-headline paragraph. */}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          })}
        >
          <HeadingMedium
            marginTop="0"
            marginBottom="0"
            overrides={{
              Block: {
                style: {
                  fontSize: '32px',
                  lineHeight: 1.15,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  // Phones: the top Header already carries the mark +
                  // wordmark directly above this hero — repeating the brand
                  // as line one stacked them back-to-back, so the hero
                  // leads with the tagline there. Desktop has no top header
                  // (brand lives in the sidebar, collapsible), so the
                  // lockup stays.
                  [MOBILE_MEDIA_QUERY]: { display: 'none' },
                },
              },
            }}
          >
            <span
              className={css({
                display: 'inline-block',
                // Centre the mark on the text line; kept a hair under the line
                // box (30px < 32px·1.15) so it doesn't bump line 1's height.
                verticalAlign: 'middle',
                // Match the tight brand lockup gap used in the header / sidebar
                // (6px) — keeps the mark close to the "Yes-Brainer" wordmark.
                marginRight: '6px',
              })}
            >
              <BrandMark size={30} />
            </span>
            Yes-Brainer
          </HeadingMedium>
          {/* Tagline — one visual step below the brand line (smaller, still
              emphasised, primary ink) so the lockup reads brand → promise. */}
          <div
            className={css({
              fontSize: '20px',
              lineHeight: 1.35,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: theme.colors.contentPrimary,
              '@media (max-width: 600px)': { fontSize: '18px' },
            })}
          >
            A council of AI models for the decisions that aren’t no-brainers
          </div>
          <ParagraphMedium
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentSecondary}
          >
            Ask one question and let several AI models deliberate over it —
            answering in parallel, debating toward consensus, or judging each
            other for a single verdict. No accounts, no server, just your
            keys. Models can still be confidently wrong — the council&apos;s
            job is to show you the spread; the judgment stays yours.
          </ParagraphMedium>
        </div>

        {/* Deliberation modes — shared copy with the New-council picker. */}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          })}
        >
          <LabelLarge marginTop="0" marginBottom="0">
            Ways the council can deliberate
          </LabelLarge>
          {/* Side-by-side on desktop, stacked on mobile (same 600px
              breakpoint as the "Why it's different" grid below). */}
          <div
            className={css({
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              '@media (max-width: 600px)': { gridTemplateColumns: '1fr' },
            })}
          >
            {SOCIAL_STRUCTURES.map(({ id }) => {
              const colors = structureColorSet(id, isDark)
              return (
                <div
                  key={id}
                  className={css({
                    padding: '16px',
                    borderRadius: '14px',
                    // Flat tint + the *brighter* `border` token (the lighter
                    // l200 shade). These always-on showcase cards read better
                    // with a soft, bright outline than the darker `cardBorder`
                    // the *selection* states (picker / sidebar) use — both are
                    // centralised, derived from the same council colour set.
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                  })}
                >
                  <DeliberationCardContent structure={id} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Get-started card — the page's action
            station, ahead of the differentiators: a distinct surface (the
            only carded *action* on an otherwise informational page) holding
            the caller's CTA block with the "works with" provider strip as
            the trust row beneath it — logos as evidence under the action
            (the trust-strip convention), not a headline of their own.
            "Why it's different" reads below as the closing reassurance.

            The **aura, variant B (contained)**: the three blurred glows
            live *inside* the card — the card is its own stacking context
            (`isolation`) with `overflow: hidden` clipping the blobs to the
            rounded corners; the blob layer sits at z-index −1, which in
            the card's own context paints *above the card background but
            below its in-flow content*, so the copy/CTA never sit on
            uncontrolled color. Blob centres are pushed outside the card
            bounds — only their soft falloff washes the edges; the middle
            stays clean. Drift is transform-only; reduced-motion freezes
            it. (Variant A — the outside halo bleeding past the card — and
            the WebGL mixing-field tier both live in git history.) */}
        <div
          className={css({
            position: 'relative',
            isolation: 'isolate',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '22px',
            padding: '28px 24px',
            borderRadius: '16px',
            backgroundColor: theme.colors.backgroundPrimary,
            border: `1px solid ${theme.colors.borderOpaque}`,
            // A whisper of lift so the action station reads raised against
            // the flat informational tiles around it.
            boxShadow: '0 12px 32px -20px rgba(0, 0, 0, 0.35)',
            [MOBILE_MEDIA_QUERY]: { padding: '24px 16px' },
          })}
        >
          <div
            aria-hidden
            className={css({
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: -1,
              pointerEvents: 'none',
            })}
          >
            {/* Corners/edges carry the colour; gold a notch under the cool
                hues (bright yellow reaches perceptual parity fast). */}
            <AuraBlob
              color={blue}
              alpha={isDark ? '4a' : '38'}
              style={{ top: '-55%', left: '-12%', width: '55%' }}
              mobile={{ top: '-45%', left: '-40%', width: '90%' }}
              drift="translate(6%, 9%) scale(1.08)"
              duration="14s"
            />
            <AuraBlob
              color={gold}
              alpha={isDark ? '3d' : '30'}
              style={{ top: '-25%', right: '-14%', width: '52%' }}
              mobile={{ top: '25%', right: '-45%', width: '85%' }}
              drift="translate(-7%, 6%) scale(1.06)"
              duration="18s"
            />
            <AuraBlob
              color={teal}
              alpha={isDark ? '4a' : '38'}
              style={{ bottom: '-60%', left: '22%', width: '60%' }}
              mobile={{ bottom: '-45%', left: '5%', width: '95%' }}
              drift="translate(-5%, -8%) scale(1.09)"
              duration="12s"
            />
          </div>
          {children}
          <ProvidersStrip />
        </div>

        {/* Differentiators */}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          })}
        >
          <LabelLarge marginTop="0" marginBottom="0">
            Why it's different
          </LabelLarge>
          <div
            className={css({
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              '@media (max-width: 600px)': { gridTemplateColumns: '1fr' },
            })}
          >
            {DIFFERENTIATORS.map(({ title, body, Icon }) => (
              <div
                key={title}
                className={css({
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  padding: '14px',
                  borderRadius: '12px',
                  border: `1px solid ${theme.colors.borderOpaque}`,
                  backgroundColor: theme.colors.backgroundSecondary,
                })}
              >
                <span
                  className={css({
                    flexShrink: 0,
                    paddingTop: '2px',
                    display: 'inline-flex',
                    color: theme.colors.contentPrimary,
                  })}
                >
                  <Icon size={20} aria-hidden />
                </span>
                <div
                  className={css({
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  })}
                >
                  <LabelMedium marginTop="0" marginBottom="0">
                    {title}
                  </LabelMedium>
                  <ParagraphSmall
                    marginTop="0"
                    marginBottom="0"
                    color={theme.colors.contentSecondary}
                  >
                    {body}
                  </ParagraphSmall>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colophon — the quiet trust closer, three centered lines:
            the license/no-warranty statement, then
            the two action links, then the copyright. Sits right under "Why
            it's different"; this is where the "Free & open source" tile's
            claim gets its proof links. */}
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: theme.colors.contentTertiary,
            textAlign: 'center',
          })}
        >
          <span>
            Free &amp; open source under AGPL-3.0 · provided as-is, no
            warranty
          </span>
          <div
            className={css({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: '4px 8px',
            })}
          >
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={colophonLink}
            >
              <FiGithub size={13} aria-hidden />
              View the source code
            </a>
            <span aria-hidden>·</span>
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={colophonLink}
            >
              <FiMessageSquare size={13} aria-hidden />
              Report a bug or idea
            </a>
          </div>
          <span>
            © 2026{' '}
            <a
              href="https://trekhleb.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              Oleksii Trekhleb
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
