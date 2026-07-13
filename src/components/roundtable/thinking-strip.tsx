/**
 * Live thinking feed for a streaming Participant pane.
 *
 * While a reasoning model deliberates, the provider streams a summary of its
 * thinking (Anthropic `display:'summarized'`, OpenAI `reasoningSummary`,
 * Gemini `includeThoughts`, Groq parsed reasoning). This strip renders that
 * feed **live-only**: it exists solely in the in-flight pane state and
 * unmounts the moment answer text arrives — nothing here is persisted, so
 * thinking can never leak into histories, votes, exports, or share cards.
 *
 * Design: the header is the app's standard status pill (`StatusTag` →
 * `LoadingText` shimmer + animated ellipsis — the same object as
 * "deliberating…", so the pane's wait state stays one visual vocabulary)
 * carrying a gently "breathing" brain glyph, over a bottom-anchored window
 * of the latest summary lines. New text pushes old text up and out through
 * a fade mask, so the pane reads as a mind at work rather than a stalled
 * loader. All motion settles under `prefers-reduced-motion`.
 */

import { useStyletron } from 'baseui'
import { LuBrain } from 'react-icons/lu'
import { StatusTag } from '@/components/status-tag'

/** Bottom-anchored visible window for the summary tail (~4 lines @ 18px). */
const TAIL_MAX_HEIGHT = 72

export function ThinkingStrip({ text }: { text: string }) {
  const [css, theme] = useStyletron()
  return (
    <div
      className={css({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '6px',
      })}
    >
      {/* The pill wraps the glyph in its breathing animation — same object
          as "deliberating…", brain instead of the speech bubble. */}
      <StatusTag status="streaming" label="thinking" icon={<LuBrain size={12} />} />
      {/* Bottom-anchored tail: flex column packed to the end, so once the
          text exceeds the window it overflows *upward* and `overflow:hidden`
          clips the oldest lines — the newest words are always in view,
          drifting up through the fade mask. (Not position:absolute — an
          absolute child would collapse the window to zero height; this
          grows naturally from one line up to the cap.) */}
      <div
        className={css({
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          maxHeight: `${TAIL_MAX_HEIGHT}px`,
          overflow: 'hidden',
          // Fade the oldest visible lines out at the top. Mask (not a
          // gradient overlay) so it works on any themed background.
          maskImage: 'linear-gradient(to bottom, transparent 0, black 26px)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0, black 26px)',
        })}
      >
        <div
          className={css({
            fontSize: '13px',
            lineHeight: '18px',
            fontStyle: 'italic',
            color: theme.colors.contentTertiary,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          })}
        >
          {text}
        </div>
      </div>
    </div>
  )
}
