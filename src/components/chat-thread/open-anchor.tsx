/**
 * Zero-height scroll marker rendered at the start of the latest turn's
 * *result* block — Judge verdict / final Consensus round / the Parallel
 * answers. `useChatAutoScroll` lands here when an existing council opens,
 * so the conclusion starts at the viewport top and reads downward.
 *
 * The marker is a flex child of the thread's gap-12 column; `marginTop`
 * cancels that gap so it adds no space (same trick as the streaming pin
 * anchor in `chat-thread.tsx` — keep the two in sync with the thread gap).
 */

import { useStyletron } from 'baseui'

export function OpenAnchor({
  anchorRef,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
}) {
  const [css] = useStyletron()
  return (
    <div
      ref={anchorRef}
      aria-hidden
      className={css({ height: 0, marginTop: '-12px' })}
    />
  )
}
