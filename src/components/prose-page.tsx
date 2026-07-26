/**
 * The shared shell for standalone prose routes (`/private`, `/vs/:slug`).
 *
 * `<AboutContent>` predates this and keeps its own column because it also
 * hosts the get-started aura's stacking scope; everything else that is just
 * "a page of text with a heading" comes through here so the measure, gutter
 * and rhythm can't drift page to page.
 *
 * Like the other prose surfaces, this is a full-bleed scroller that owns its
 * gutter internally — the parent `<main>` adds none for prose pages, so
 * content scrolls flush under the header with no dead padding band.
 *
 * The `<h1>` is rendered here (not by callers) so every prose route ships
 * exactly one, which is what the prerendered copies in
 * `scripts/seo-routes.mjs` also assume.
 */

import { useEffect, type ReactNode } from 'react'
import { useStyletron } from 'baseui'
import { HeadingMedium, ParagraphMedium } from 'baseui/typography'
import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'

export function ProsePage({
  title,
  documentTitle,
  lede,
  children,
}: {
  /** The on-page `<h1>`. */
  title: string
  /** `document.title` while mounted. Keep in sync with this route's entry in
   *  `scripts/seo-routes.mjs`, which stamps the same string into the
   *  prerendered copy a direct load receives. */
  documentTitle: string
  /** Optional standfirst under the heading. */
  lede?: ReactNode
  children: ReactNode
}) {
  const [css, theme] = useStyletron()

  // Restore whatever title was set before, so navigating back to a council
  // doesn't leave a stale prose-page title in the tab.
  useEffect(() => {
    const previous = document.title
    document.title = documentTitle
    return () => {
      document.title = previous
    }
  }, [documentTitle])

  return (
    <div
      className={css({
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      })}
    >
      <div
        className={css({
          width: '100%',
          // Same measure cap as AboutContent — full-bleed prose on a wide
          // desktop pushes line lengths past comfortable reading.
          maxWidth: '880px',
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          paddingTop: '28px',
          paddingBottom: '40px',
          paddingLeft: '16px',
          paddingRight: '16px',
          [MOBILE_MEDIA_QUERY]: {
            paddingLeft: '20px',
            paddingRight: '20px',
          },
        })}
      >
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          })}
        >
          <HeadingMedium
            // Base Web's HeadingMedium renders an <h3>; these are standalone
            // documents, so the page title must be the <h1> — for assistive
            // tech, and to match the prerendered copy the build emits from
            // scripts/seo-routes.mjs. `as` is a Block prop, passed straight
            // through (the `overrides` slot below is styling only).
            as="h1"
            marginTop="0"
            marginBottom="0"
            overrides={{
              Block: {
                style: {
                  fontSize: '32px',
                  lineHeight: 1.15,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  [MOBILE_MEDIA_QUERY]: { fontSize: '26px' },
                },
              },
            }}
          >
            {title}
          </HeadingMedium>
          {lede ? (
            <ParagraphMedium
              marginTop="0"
              marginBottom="0"
              color={theme.colors.contentSecondary}
            >
              {lede}
            </ParagraphMedium>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
