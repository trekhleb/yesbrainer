/**
 * `/vs` — the comparison hub.
 *
 * Deliberately not a list of links. A bare index of five hrefs is a thin page
 * with nothing to say and no reason to be indexed; this one explains the
 * three ways to get several models onto one question, which is the thing
 * someone searching "open source AI council" or "multi-model AI comparison"
 * actually wants, and *then* hands off to the per-product pages.
 *
 * Content lives in `src/models/comparison-hub.json` so the prerendered copy
 * (`scripts/seo-routes.mjs`) and this component share one source.
 */

import { useStyletron } from 'baseui'
import {
  LabelLarge,
  LabelMedium,
  ParagraphMedium,
  ParagraphSmall,
} from 'baseui/typography'
import { ProsePage } from '@/components/prose-page'
import { COMPARISON_HUB, COMPARISONS } from '@/models/comparisons'
import { comparisonPath } from '@/hooks/use-app-route'
import { GITHUB_ISSUES_URL } from '@/utils/external-links'

export function ComparisonIndexPage() {
  const [css, theme] = useStyletron()
  const hub = COMPARISON_HUB

  const link = css({ color: theme.colors.contentPrimary })
  const section = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  })

  return (
    <ProsePage
      title={hub.heading}
      documentTitle={hub.documentTitle}
      lede={hub.lede}
    >
      {hub.categories.map((category) => (
        <section key={category.name} className={section}>
          <LabelLarge marginTop="0" marginBottom="0">
            {category.name}
          </LabelLarge>
          <ParagraphSmall
            marginTop="0"
            marginBottom="0"
            color={theme.colors.contentTertiary}
          >
            {category.examples}
          </ParagraphSmall>
          <ParagraphMedium marginTop="0" marginBottom="0">
            {category.body}
          </ParagraphMedium>
        </section>
      ))}

      <section className={section}>
        <LabelLarge marginTop="0" marginBottom="0">
          Where Yes-Brainer sits
        </LabelLarge>
        <ParagraphMedium marginTop="0" marginBottom="0">
          {hub.position}
        </ParagraphMedium>
      </section>

      <section className={section}>
        <LabelLarge marginTop="0" marginBottom="0">
          Head to head
        </LabelLarge>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          })}
        >
          {COMPARISONS.map((c) => (
            <a
              key={c.slug}
              href={comparisonPath(c.slug)}
              className={css({
                border: `1px solid ${theme.colors.borderOpaque}`,
                borderRadius: theme.borders.radius300,
                padding: '12px 14px',
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                ':hover': { borderColor: theme.colors.borderSelected },
              })}
            >
              <LabelMedium marginTop="0" marginBottom="0">
                Yes-Brainer vs {c.name}
              </LabelMedium>
              <ParagraphSmall
                marginTop="0"
                marginBottom="0"
                color={theme.colors.contentSecondary}
              >
                {c.lede}
              </ParagraphSmall>
            </a>
          ))}
        </div>
      </section>

      <section className={section}>
        <ParagraphSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentSecondary}
        >
          {hub.closing} {hub.invitation.before}
          <a className={link} href={GITHUB_ISSUES_URL} rel="noopener">
            {hub.invitation.linkText}
          </a>
          {hub.invitation.after}
        </ParagraphSmall>
        <ParagraphSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentTertiary}
        >
          {hub.note}
        </ParagraphSmall>
      </section>
    </ProsePage>
  )
}
