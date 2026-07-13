/**
 * The active-council pane — wraps `useCouncilSession`, the Roster
 * controls, the ChatThread, the Composer, and the per-seat config
 * modal. Mounted by `app.tsx` with `key={councilId}` so switching
 * councils blows away the prior session state cleanly.
 *
 * Delegates everything substantive (turn execution, seat config) to
 * `useCouncilSession`.
 */

import { useCallback, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { ParagraphSmall } from 'baseui/typography'
import { ChatThread } from '@/components/chat-thread'
import { Composer } from '@/components/composer'
import { ComposerKeysGate } from '@/components/composer-keys-gate'
import type { ComposerToolOption } from '@/components/composer/run-options'
import { useApiKeys } from '@/hooks/use-api-keys'
import { useOllamaReachable } from '@/hooks/use-ollama-reachable'
import { hasUsableModel } from '@/utils/usable-models'
import {
  getAvailableToolNamesForEntry,
  getToolDisplayLabel,
} from '@/providers/tools'
import { getEnabledToolNamesForSeat } from '@/providers/tools/enabled'
import { getRunOptions, setRunOptions } from '@/storage/run-options'
import { getDraft, setDraft } from '@/storage/drafts'
import { LoadingText } from '@/components/loading-text'
import { useCouncilSession } from '@/hooks/use-council-session'
import { estimateContextUsage } from '@/utils/context-estimate'
import { councilHasOverrides } from '@/utils/council-overrides'
import { FULL_BLEED_NOTIFICATION_OVERRIDES } from '@/utils/notification-styles'
import { getModel } from '@/models/registry'

export function CouncilView({
  councilId,
  configRefreshKey,
  onTurnAppended,
  onTitleGenerationStarted,
  onTitleGenerationFinished,
  onOpenCouncilSettings,
}: {
  councilId: string
  /** Bumped by the app when this council's settings modal saves config, so
   *  the session re-reads it from storage. See `useCouncilSession`. */
  configRefreshKey: number
  onTurnAppended: () => void
  onTitleGenerationStarted: (councilId: string) => void
  onTitleGenerationFinished: (councilId: string) => void
  /** Opens this council's settings modal — the composer's people trigger
   *  jumps to it for durable per-seat setup. */
  onOpenCouncilSettings?: () => void
}) {
  const [css, theme] = useStyletron()
  // Keys gate: with no usable model the composer is
  // swapped for the add-keys card — a global rule (not demo-specific), so a
  // keyless visitor exploring a seeded demo (or a backstop-created council)
  // is offered the one action that unblocks sending instead of a send that
  // can only error seat-by-seat. Reactive: the composer appears the moment
  // a key is pasted or the opt-in Ollama ping starts succeeding.
  const keys = useApiKeys()
  const ollama = useOllamaReachable()
  const usableModel = hasUsableModel(keys, ollama.reachable)
  // The composer floats over the bottom of the thread, so we measure its live
  // height and hand it to the thread as extra bottom padding — that way the
  // last reply always scrolls clear of the input instead of hiding behind it.
  // A *callback ref* (not useRef + useEffect) wires up the ResizeObserver:
  // CouncilView renders a loading state first, so the composer node only
  // mounts later — an effect with `[]` deps would run while the node is still
  // null and never attach the observer (leaving composerHeight at 0). The
  // observer also tracks growth (multi-line text, image attachments).
  const composerObserverRef = useRef<ResizeObserver | null>(null)
  const [composerHeight, setComposerHeight] = useState(0)
  const measureComposer = useCallback((node: HTMLDivElement | null) => {
    composerObserverRef.current?.disconnect()
    composerObserverRef.current = null
    if (!node) return
    const ro = new ResizeObserver(() => setComposerHeight(node.offsetHeight))
    ro.observe(node)
    composerObserverRef.current = ro
  }, [])
  const {
    council,
    isLoading,
    loadError,
    sendMessage,
    isStreaming,
    stop,
    streamingTurn,
    votingTurn,
    mediatingTurn,
    judgingTurn,
    retryFailedVotes,
    retrySeatAnswer,
    retryJudge,
    retryMediatorRound,
    seatRetry,
    synthRetry,
  } = useCouncilSession(councilId, {
    onTurnAppended,
    onTitleGenerationStarted,
    onTitleGenerationFinished,
    configRefreshKey,
  })

  // Stabilise the one retry callback handed to *every* turn so `memo(TurnView)`
  // can skip settled turns while a new one streams below (`retryFailedVotes` is
  // already `useCallback`-stable at its hook source, so this reference never
  // changes). The other retry callbacks are passed only to the latest turn —
  // which re-renders on its own retry regardless — so they don't gate the memo
  // and stay inline. Declared above the early returns to satisfy Rules of Hooks.
  const handleRetryFailedVotes = useCallback(
    (turnId: string) => void retryFailedVotes(turnId),
    [retryFailedVotes],
  )

  if (loadError) {
    return (
      <Notification
        kind={NotificationKind.negative}
        overrides={FULL_BLEED_NOTIFICATION_OVERRIDES}
      >
        Failed to load council: {loadError}
      </Notification>
    )
  }
  if (isLoading || !council) {
    return (
      <ParagraphSmall marginTop="0" marginBottom="0">
        <LoadingText>Seating the council</LoadingText>
      </ParagraphSmall>
    )
  }
  // Recomputed by the Composer on every keystroke; passed as a callback
  // so the closure over `council` stays current without a memo dance.
  const contextEstimator = (text: string) =>
    estimateContextUsage(council, text)
  // Run-control inputs: every provider tool at least one seat has enabled
  // (the Tools control's switch rows, with "X of Y seats" mixed-state
  // captions), and whether any seat can do extended thinking (gates the
  // Thinking control). Councils of local-only models get neither, so both
  // controls hide — the composer stays minimal there.
  const toolOptions: ComposerToolOption[] = (() => {
    const byTool = new Map<string, { enabled: number; avail: number }>()
    for (const seat of council.seats) {
      const available = getAvailableToolNamesForEntry(getModel(seat.modelId))
      const enabled = new Set(getEnabledToolNamesForSeat(seat))
      for (const name of available) {
        const row = byTool.get(name) ?? { enabled: 0, avail: 0 }
        row.avail += 1
        if (enabled.has(name)) row.enabled += 1
        byTool.set(name, row)
      }
    }
    return [...byTool.entries()]
      .filter(([, row]) => row.enabled > 0)
      .map(([name, row]) => ({
        name,
        label: getToolDisplayLabel(name),
        enabledSeats: row.enabled,
        toolSeats: row.avail,
      }))
  })()
  // Reasoning-capable roles feed the composer's Thinking popover: its
  // disclosure rows show what the armed dial rung resolves to on each
  // model (and, under Default, each one's own sticky setting). The Judge /
  // Mediator are listed alongside the seats — the override governs every
  // role's calls, so the disclosure must name them too.
  const reasoningSeats = [
    ...council.seats.map((s) => ({ slot: s, role: undefined })),
    ...(council.judge ? [{ slot: council.judge, role: 'Judge' as const }] : []),
    ...(council.mediator
      ? [{ slot: council.mediator, role: 'Mediator' as const }]
      : []),
  ].flatMap(({ slot, role }) => {
    const entry = getModel(slot.modelId)
    return entry.capabilities.reasoning
      ? [
          {
            entry,
            seatEffort: slot.config.reasoningEffort,
            ...(role ? { role } : {}),
          },
        ]
      : []
  })
  // Any per-council departure from defaults — the recipe (`deliberation`) bag
  // or a tuned seat / Judge / Mediator config — lights a dot on the composer's
  // council-settings trigger, so "this council isn't on plain defaults" reads
  // without opening the modal.
  const settingsOverridden = councilHasOverrides(council)

  return (
    <>
      {/* No council header here anymore — the type + roster live in the
          sidebar council card, and per-participant config moved to the
          council-settings modal (sidebar row → ⋯ → Settings). That reclaims
          the whole top band for the chat (a big win on mobile) and removes
          the confusion between the seat chips and the chat's participant
          pager below them. */}
      {/* Chat dock — the thread fills it and scrolls full height; the
          composer floats over the bottom with a fade, so the conversation
          reads as using the whole screen (ChatGPT / Gemini style). */}
      <div
        className={css({
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        {/* No demo banner above the thread (removed — it cost a
            full text row on phones). Demo provenance stays visible via the
            sidebar's Demo tag, and the keyless composer face already
            carries the "add your keys" call to action. */}
        <ChatThread
          council={council}
          streamingTurn={streamingTurn}
          votingTurn={votingTurn}
          mediatingTurn={mediatingTurn}
          judgingTurn={judgingTurn}
          onRetryFailedVotes={handleRetryFailedVotes}
          seatRetry={seatRetry}
          onRetrySeatAnswer={(turnId, seatId) =>
            void retrySeatAnswer(turnId, seatId)
          }
          synthRetry={synthRetry}
          onRetryJudge={(turnId) => void retryJudge(turnId)}
          onRetryMediatorRound={(turnId) => void retryMediatorRound(turnId)}
          error={null}
          // Reserve the full overlay height so content rests *above* the
          // composer's gradient at rest — nothing sits under the fade (which
          // looked broken for horizontally-scrolling blocks like the roundtable
          // panes). The dissolve still happens as you scroll older turns up.
          bottomInset={composerHeight}
        />
        {/* Floating composer overlay. The whole dock is a top-fading gradient
            so the conversation dissolves into the background as it passes
            behind the input — no hard band, and (because the fade covers the
            full dock) nothing peeks out beside the floating island. The
            wrapper is click-through so a touch on the fade scrolls the thread
            behind it; only the composer re-enables pointer events. */}
        <div
          ref={measureComposer}
          className={css({
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            // A scrim anchored at the very bottom of the screen, intentionally
            // light so the conversation stays *faintly* visible behind the
            // floating input — an airier, more-spacious feel, less "suffocated"
            // by the band — fading fully to transparent by the top of the dock
            // (so content ABOVE the input stays crisp). Never fully opaque even
            // at the bottom edge: a sliver of content shows through, paired
            // with the composer's own frosted-translucent surface.
            background: `linear-gradient(to top, color-mix(in srgb, ${theme.colors.backgroundPrimary} 88%, transparent) 0%, color-mix(in srgb, ${theme.colors.backgroundPrimary} 50%, transparent) 48%, transparent 100%)`,
            paddingTop: '8px',
            // Side + bottom margins float the card as an island; bottom also
            // clears the PWA home indicator (footer is hidden in chat;
            // `env()` is 0 in a normal tab).
            paddingLeft: '10px',
            paddingRight: '10px',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
          })}
        >
          <div className={css({ pointerEvents: 'auto' })}>
            {usableModel ? (
              <Composer
                onSend={(content, images, opts) =>
                  void sendMessage(content, images, opts)
                }
                onStop={stop}
                isStreaming={isStreaming}
                contextEstimator={contextEstimator}
                toolOptions={toolOptions}
                reasoningSeats={reasoningSeats}
                // Sticky run options: seeded from the persisted per-council
                // value, written back on every change. CouncilView remounts
                // per council (app keys it by id), so the seed stays honest.
                initialRunOptions={getRunOptions(council.id)}
                onRunOptionsChange={(v) => setRunOptions(council.id, v)}
                // Per-council draft: same seed-on-mount / write-on-change
                // contract as run options, so a refresh or tab discard keeps
                // an unsent prompt. Cleared on send / when emptied.
                initialDraft={getDraft(council.id)}
                onDraftChange={(t) => setDraft(council.id, t)}
                settingsOverridden={settingsOverridden}
                {...(onOpenCouncilSettings ? { onOpenCouncilSettings } : {})}
              />
            ) : (
              <ComposerKeysGate />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
