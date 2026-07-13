/**
 * First-run onboarding — the empty state shown when there are no councils
 * yet (see README → "First-run onboarding"). Rather than seat a model the
 * user can't call, we show the shared `<AboutContent>` explainer plus a
 * capability-driven call to action:
 *  - No usable model → the shared `<GetStartedKeys>` block (→ Settings → Keys).
 *  - A model is usable (key pasted, or opt-in Ollama reachable) →
 *    "Create your first council" opens the New-council modal.
 *
 * The parent re-renders this reactively (`useApiKeys()` + the opt-in
 * Ollama ping), so the CTA flips the instant a model becomes usable.
 */

import { useStyletron } from 'baseui'
import { Button } from 'baseui/button'
import { ParagraphSmall } from 'baseui/typography'
import { AboutContent } from '@/components/about-content'
import { GetStartedKeys } from '@/components/get-started-keys'
import type { CouncilSummary } from '@/storage/councils'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
export interface OnboardingProps {
  /** True once any model is reachable (a cloud key, or opt-in Ollama). */
  hasUsableModel: boolean
  /** Open the New-council modal. */
  onCreateCouncil: () => void
  /** Seeded demo councils, if any survive (sidebar order) — the
   *  get-started card renders them as "See it in action" rows. */
  demos?: CouncilSummary[]
}

export function Onboarding({
  hasUsableModel,
  onCreateCouncil,
  demos = [],
}: OnboardingProps) {
  const [css, theme] = useStyletron()
  if (!hasUsableModel) {
    return (
      <AboutContent>
        <GetStartedKeys demos={demos} />
      </AboutContent>
    )
  }
  return (
    <AboutContent>
      {/* Centre-aligned + full-width-on-mobile, matching the
          <GetStartedKeys> CTA block this replaces once a model lands — like
          it, divider-free: it sits in AboutContent's get-started group right
          under the providers strip. */}
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
        })}
      >
        <Button
          type="button"
          onClick={onCreateCouncil}
          overrides={{
            BaseButton: {
              style: {
                [MOBILE_MEDIA_QUERY]: { width: '100%' },
              },
            },
          }}
        >
          Create your first council
        </Button>
        <ParagraphSmall
          marginTop="0"
          marginBottom="0"
          color={theme.colors.contentTertiary}
          overrides={{ Block: { style: { textAlign: 'center' } } }}
        >
          You have a model ready — pick your council and start asking.
        </ParagraphSmall>
      </div>
    </AboutContent>
  )
}
