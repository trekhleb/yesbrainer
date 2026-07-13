import {
  useMemo,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useStyletron } from 'baseui'
import { Button, KIND, SIZE } from 'baseui/button'
import { Textarea } from 'baseui/textarea'
import { FiPaperclip } from 'react-icons/fi'
import { LuArrowUp } from 'react-icons/lu'
import { ContextUsageRow } from '@/components/composer/context-usage-row'
import {
  ComposerRunControls,
  type ComposerReasoningSeat,
  type ComposerToolOption,
} from '@/components/composer/run-options'
import { PendingThumbnail, Thumbnail } from '@/components/composer/thumbnail'
import { useImageAttachments } from '@/components/composer/use-image-attachments'
import { useAutosizeTextarea } from '@/hooks/use-autosize-textarea'
import type { ReasoningEffortValue } from '@/components/seat-config/reasoning-field'
import type { ContextUsageHint } from '@/utils/context-estimate'
import { MAX_IMAGES_PER_TURN } from '@/utils/file-to-data-uri'

import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
export interface ComposerProps {
  /** Send a turn. `images` is an array of base64 `data:image/...`
   *  URIs when the user attached image(s). `opts` carries the
   *  run-options overrides (sticky per council): `mutedTools` names
   *  provider tools every seat must skip this turn; `reasoningEffort`
   *  overrides extended thinking on every reasoning-capable role (seats
   *  and the Judge / Mediator synthesis phases). */
  onSend: (
    content: string,
    images?: string[],
    opts?: { mutedTools?: string[]; reasoningEffort?: ReasoningEffortValue },
  ) => void
  onStop: () => void
  isStreaming: boolean
  /** Provider tools at least one seat has enabled — the Tools (wrench)
   *  control's switch rows. Empty hides that control so it isn't a no-op. */
  toolOptions?: ComposerToolOption[]
  /** Reasoning-capable roles — seats plus the Judge / Mediator (model entry
   *  + each one's own sticky thinking level) — the Thinking (brain)
   *  control's disclosure rows. Empty hides the control so it isn't a
   *  no-op. */
  reasoningSeats?: ComposerReasoningSeat[]
  /** Opens the council-settings modal — the composer's sliders trigger. */
  onOpenCouncilSettings?: () => void
  /** Whether this council departs from plain defaults (recipe / seat / Judge /
   *  Mediator overrides) — lights an accent dot on the sliders trigger. */
  settingsOverridden?: boolean
  /** Seed for the run-options overrides (the council's persisted value —
   *  overrides are *sticky* per council, not per message). */
  initialRunOptions?: {
    mutedTools: string[]
    reasoningEffort: ReasoningEffortValue | null
  }
  /** Fired on every override change so the owner can persist it. */
  onRunOptionsChange?: (value: {
    mutedTools: string[]
    reasoningEffort: ReasoningEffortValue | null
  }) => void
  /** Seed for the draft text — the council's persisted unsent prompt,
   *  restored on mount so a refresh / tab discard doesn't lose it. Text
   *  only; image attachments aren't persisted (see `storage/drafts.ts`). */
  initialDraft?: string
  /** Fired on every text change *and* on send-clear, so the owner can keep
   *  the per-council draft in sync (persist non-empty, drop on empty). */
  onDraftChange?: (text: string) => void
  /** Pre-flight context-window estimator. Recomputed on every
   *  keystroke; returns the worst-case seat or `null` when no seats
   *  are active. The composer surfaces a small "Context: X% / Yk"
   *  hint above the input when usage rises past a soft floor (10%),
   *  and switches the tone to a warning past `contextWarnPct`
   *  (default 0.8). Pass `undefined` to suppress the hint entirely. */
  contextEstimator?: (upcomingUserMsg: string) => ContextUsageHint | null
  /** Threshold (0-1) above which the context hint turns into a
   *  warning. Defaults to 0.8 — beyond that the prompt is at real
   *  risk of being truncated by the provider on subsequent turns. */
  contextWarnPct?: number
}

const MIN_TEXTAREA_HEIGHT = 28
// Cap the auto-grow at a reasonable height (~7 lines) so a long draft never
// eats the screen — especially important now the composer floats over the
// chat. Past this the textarea scrolls internally (see the auto-grow effect).
const MAX_TEXTAREA_HEIGHT = 160
const SEND_BTN_SIZE = 36

/**
 * Touch-primary devices (phones, tablets) drive an on-screen keyboard whose
 * Enter key means "newline", not "send" — the same posture ChatGPT / Claude /
 * Gemini take on mobile, where the Send button is the only submit path.
 * `(hover: none) and (pointer: coarse)` is the standard test for such a device:
 * it reads *false* for a narrow desktop window (mouse-primary → keeps
 * Enter-to-send) and *true* for a large tablet (touch-primary → newline), where
 * a width breakpoint gets both backwards. Read per-call, not captured at import,
 * so it stays test-mockable. Guarded for SSR, mirroring icon-tooltip's CAN_HOVER.
 */
function isSoftKeyboardDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: none) and (pointer: coarse)').matches
  )
}

export function Composer({
  onSend,
  onStop,
  isStreaming,
  contextEstimator,
  contextWarnPct = 0.8,
  toolOptions = [],
  reasoningSeats = [],
  onOpenCouncilSettings,
  settingsOverridden = false,
  initialRunOptions,
  onRunOptionsChange,
  initialDraft,
  onDraftChange,
}: ComposerProps) {
  const [css, theme] = useStyletron()
  const isDark = theme.name === 'dark-theme'
  // Soft, diffuse elevation under the input (Claude-style). Pulled into a const
  // so the focus state can prepend its 2px-border inset shadow without losing
  // the lift.
  const elevation = isDark
    ? '0 1px 2px rgba(0, 0, 0, 0.40), 0 8px 28px rgba(0, 0, 0, 0.55)'
    : '0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 28px rgba(0, 0, 0, 0.10)'
  // 2px emphasis frame without layout shift: the border stays 1px, the
  // second px is an inset shadow drawn just inside it, and the elevation is
  // preserved after it. Shared by focus (high-contrast) and drag-over
  // (accent) so both highlights read at the same weight.
  const frameShadow = (color: string) =>
    `inset 0 0 0 1px ${color}, ${elevation}`
  // Seeded from the persisted per-council draft (restored on mount) — see
  // `onDraftChange` below and `storage/drafts.ts`. Lazy initializer so the
  // read happens once per mount, not on every render.
  const [text, setText] = useState(() => initialDraft ?? '')
  // Persist + mirror local state in one place, so the send-clear path and the
  // change handler can't drift on which one forgot to save.
  const changeText = (next: string) => {
    setText(next)
    onDraftChange?.(next)
  }
  // Image-attachment state + drag/drop/paste handling lives in its
  // own hook so the composer body stays focused on text + send.
  const {
    images,
    pendingImages,
    attachError,
    dragOver,
    fileInputRef,
    dragProps,
    onFileInputChange,
    addFiles,
    removeImage,
    clearAll: clearImageAttachments,
  } = useImageAttachments()
  // Run-options overrides (the run controls' state). **Sticky**: they apply to
  // every send in this council until changed back — resetting after each
  // send meant re-arming "keep search off" on every message. Seeded from
  // the persisted per-council value; every change notifies the owner.
  const [mutedTools, setMutedTools] = useState<ReadonlySet<string>>(
    () => new Set(initialRunOptions?.mutedTools ?? []),
  )
  const [reasoningOverride, setReasoningOverride] =
    useState<ReasoningEffortValue | null>(
      initialRunOptions?.reasoningEffort ?? null,
    )
  const changeMutedTool = (name: string, muted: boolean) => {
    const next = new Set(mutedTools)
    if (muted) next.add(name)
    else next.delete(name)
    setMutedTools(next)
    onRunOptionsChange?.({
      mutedTools: [...next],
      reasoningEffort: reasoningOverride,
    })
  }
  const changeReasoning = (next: ReasoningEffortValue | null) => {
    setReasoningOverride(next)
    onRunOptionsChange?.({
      mutedTools: [...mutedTools],
      reasoningEffort: next,
    })
  }
  // Auto-grow the input with its content (shared with every Settings /
  // seat-config prompt field — one home for the grow logic).
  const textareaRef = useAutosizeTextarea({
    value: text,
    minHeight: MIN_TEXTAREA_HEIGHT,
    maxHeight: MAX_TEXTAREA_HEIGHT,
  })

  // Context-window pre-flight. Cheap pure derivation of inputs
  // (local char/4 approximation), memoised for clarity.
  const contextHint = useMemo(
    () => (contextEstimator ? contextEstimator(text) : null),
    [contextEstimator, text],
  )

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    // pendingImages gate: sending mid-processing would silently omit the
    // attachments still in the resize pipeline.
    if (!trimmed || isStreaming || pendingImages > 0) return
    const opts = {
      ...(mutedTools.size > 0 ? { mutedTools: [...mutedTools] } : {}),
      ...(reasoningOverride ? { reasoningEffort: reasoningOverride } : {}),
    }
    onSend(
      trimmed,
      images.length > 0 ? images : undefined,
      Object.keys(opts).length > 0 ? opts : undefined,
    )
    changeText('') // clears the input *and* the persisted draft for this council
    clearImageAttachments()
    // Run options deliberately survive the send — see their comment above.
  }

  // ⌘V a screenshot straight into the input — clipboard images run through
  // the same validation as the picker / drag-drop. Text pastes untouched.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (files.length === 0) return
    e.preventDefault()
    addFiles(files)
  }

  // Desktop chat-app convention: Enter sends, Shift+Enter or ⌘/Ctrl+Enter
  // inserts a newline (ChatGPT / Claude / Gemini muscle memory). On a soft
  // keyboard Enter is *always* a newline — the Send button is the only submit
  // path, matching those same apps on mobile.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return
    if (isSoftKeyboardDevice()) return // let Enter make a newline; tap Send
    if (e.shiftKey || e.metaKey || e.ctrlKey) return // allow newline
    e.preventDefault()
    submit()
  }

  return (
    <form
      onSubmit={submit}
      {...dragProps}
      className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        // Hairline at rest; drag-over and focus each promote it to the same
        // 2px frame (`frameShadow`) — accent while a file hovers the input,
        // high-contrast while typing. Drag-over wins over focus: mid-drag,
        // the drop affordance is the state that matters.
        border: `1px solid ${
          dragOver ? theme.colors.accent : theme.colors.borderOpaque
        }`,
        borderRadius: '24px',
        // Frosted, slightly translucent surface (iOS-style) so the
        // conversation is *faintly* visible through the input — it makes the
        // screen feel roomier without ever competing with the draft text. The
        // blur keeps the input legible; `-webkit-` is required for iOS Safari.
        backgroundColor: `color-mix(in srgb, ${theme.colors.backgroundPrimary} 82%, transparent)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        // Soft, diffuse elevation *under* the input (Claude-style) so it reads
        // as a card floating above the conversation.
        boxShadow: dragOver ? frameShadow(theme.colors.accent) : elevation,
        transitionProperty: 'border-color, box-shadow',
        transitionDuration: '120ms',
        ':focus-within': {
          borderColor: dragOver
            ? theme.colors.accent
            : theme.colors.contentPrimary,
          boxShadow: frameShadow(
            dragOver ? theme.colors.accent : theme.colors.contentPrimary,
          ),
        },
      })}
    >
      {(images.length > 0 || pendingImages > 0) && (
        <div
          className={css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            paddingTop: '2px',
            paddingBottom: '2px',
          })}
        >
          {images.map((dataUri, i) => (
            <Thumbnail
              key={i}
              src={dataUri}
              onRemove={() => removeImage(i)}
              disabled={isStreaming}
            />
          ))}
          {Array.from({ length: pendingImages }, (_, i) => (
            <PendingThumbnail key={`pending-${i}`} />
          ))}
        </div>
      )}
      {attachError && (
        <div
          role="status"
          className={css({
            fontSize: '12px',
            color: theme.colors.negative,
            paddingLeft: '4px',
          })}
        >
          {attachError}
        </div>
      )}
      {contextHint && contextHint.pct >= 0.1 && (
        <ContextUsageRow hint={contextHint} warnAt={contextWarnPct} />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onFileInputChange}
        style={{ display: 'none' }}
        aria-hidden
      />
      <Textarea
        value={text}
        onChange={(e) => changeText(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask your council…"
        rows={1}
        size={SIZE.compact}
        overrides={{
          // Strip the Textarea's own chrome — the outer <form> is the visual
          // container; the textarea inside is just the input surface.
          Root: {
            style: {
              borderTopWidth: 0,
              borderRightWidth: 0,
              borderBottomWidth: 0,
              borderLeftWidth: 0,
              backgroundColor: 'transparent',
            },
          },
          InputContainer: {
            style: { backgroundColor: 'transparent' },
          },
          Input: {
            // `onPaste` rides the raw <textarea> via override props — Base
            // Web's Textarea doesn't forward it as a top-level prop.
            props: { ref: textareaRef, onPaste },
            style: {
              resize: 'none',
              lineHeight: '1.4',
              paddingTop: '4px',
              paddingBottom: '4px',
              paddingLeft: '4px',
              paddingRight: '4px',
              backgroundColor: 'transparent',
              // iOS Safari auto-zooms the page when a focused field's font is
              // < 16px. The compact textarea is 14px, so on phones bump it to
              // 16px to suppress that zoom — without touching pinch-to-zoom.
              [MOBILE_MEDIA_QUERY]: {
                fontSize: '16px',
              },
            },
          },
        }}
      />
      <div
        className={css({
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '8px',
        })}
      >
        {/* Every icon trigger lives in this left cluster; only Send sits on
            the right — a lone, isolated send target can't be fat-fingered
            into the adjacent council-settings trigger on phones. */}
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            marginRight: 'auto',
          })}
        >
          <Button
            type="button"
            kind={KIND.tertiary}
            size={SIZE.compact}
            disabled={isStreaming || images.length >= MAX_IMAGES_PER_TURN}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach images"
            title={
              images.length >= MAX_IMAGES_PER_TURN
                ? `Up to ${MAX_IMAGES_PER_TURN} images per turn`
                : `Attach images (drag-drop also works · up to ${MAX_IMAGES_PER_TURN} · large images are resized automatically)`
            }
            overrides={{
              BaseButton: {
                style: {
                  paddingLeft: '8px',
                  paddingRight: '8px',
                },
              },
            }}
          >
            <FiPaperclip size={16} />
          </Button>
          <ComposerRunControls
            toolOptions={toolOptions}
            reasoningSeats={reasoningSeats}
            mutedTools={mutedTools}
            onToggleTool={changeMutedTool}
            reasoningEffort={reasoningOverride}
            onChangeReasoning={changeReasoning}
            disabled={isStreaming}
            onOpenCouncilSettings={onOpenCouncilSettings}
            settingsOverridden={settingsOverridden}
          />
        </div>

        {isStreaming ? (
          <Button
            type="button"
            onClick={onStop}
            kind={KIND.secondary}
            size={SIZE.compact}
            aria-label="Stop"
            title="Stop"
            overrides={{
              BaseButton: {
                style: {
                  width: `${SEND_BTN_SIZE}px`,
                  height: `${SEND_BTN_SIZE}px`,
                  paddingLeft: 0,
                  paddingRight: 0,
                  borderTopLeftRadius: '999px',
                  borderTopRightRadius: '999px',
                  borderBottomLeftRadius: '999px',
                  borderBottomRightRadius: '999px',
                },
              },
            }}
          >
            {/* Filled square (ChatGPT/Claude stop convention) — a plain
                span keeps the glyph crisp and inherits the button color. */}
            <span
              aria-hidden
              className={css({
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                backgroundColor: 'currentColor',
              })}
            />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={!text.trim() || pendingImages > 0}
            size={SIZE.compact}
            aria-label="Send"
            title={
              pendingImages > 0
                ? 'Processing images…'
                : isSoftKeyboardDevice()
                  ? 'Send'
                  : 'Send (Enter)'
            }
            overrides={{
              BaseButton: {
                style: {
                  width: `${SEND_BTN_SIZE}px`,
                  height: `${SEND_BTN_SIZE}px`,
                  paddingLeft: 0,
                  paddingRight: 0,
                  borderTopLeftRadius: '999px',
                  borderTopRightRadius: '999px',
                  borderBottomLeftRadius: '999px',
                  borderBottomRightRadius: '999px',
                },
              },
            }}
          >
            <LuArrowUp size={18} />
          </Button>
        )}
      </div>
    </form>
  )
}

// ContextUsageRow + formatTokens → src/components/composer/context-usage-row.tsx
// Thumbnail                      → src/components/composer/thumbnail.tsx
// fileToDataUri + MAX_*          → src/utils/file-to-data-uri.ts
