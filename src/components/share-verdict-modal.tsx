/**
 * Share modal for a council result — opened from the
 * Judge verdict / final Mediator round header. Shows a live preview of the
 * canvas-rendered card (`utils/share-card/`, dynamically imported so
 * the painter + react-dom/server stay out of the main chunk) and the
 * actions around it:
 *
 *   - **Download PNG** — the primary (always works, every platform);
 *   - **Copy image** — `ClipboardItem`, for pasting straight into
 *     Slack / X / docs (hidden where unsupported);
 *   - **Copy text** — the plain-text verdict + credit line, for places
 *     that want words, not pixels;
 *   - **Share…** — the native sheet via `navigator.share({ files })`,
 *     shown only where file-sharing is actually available (mobile).
 *
 * A preview-first modal on purpose: people check what an artifact looks
 * like before posting it, and the preview doubles as the home for the
 * secondary actions without cluttering the verdict card itself.
 */

import { useEffect, useRef, useState } from 'react'
import { useStyletron } from 'baseui'
import { analytics } from '@/analytics'
import {
  Button,
  KIND as ButtonKind,
  SIZE as ButtonSize,
} from 'baseui/button'
import { Notification, KIND as NotificationKind } from 'baseui/notification'
import { toaster } from 'baseui/toast'
import { FiCopy, FiFileText, FiShare2 } from 'react-icons/fi'
import { FormModal, ModalTitleWithIcon } from '@/components/form-modal'
import { LoadingText } from '@/components/loading-text'
import { compactNotificationOverrides } from '@/utils/notification-styles'
// Eager (not via the lazy `@/utils/share-card` barrel): the preview box must
// reserve the card's size on first paint, before the painter chunk loads.
import {
  SHARE_CARD_ASPECT_RATIO,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from '@/utils/share-card/dimensions'
import type { Seat, SocialStructure, TurnEvent } from '@/types/council'

export interface ShareVerdictModalProps {
  structure: SocialStructure
  question: string
  /** The turn's image attachments — the card paints the first as a
   *  thumbnail beside the question (see `ShareCardData.userImages`). */
  userImages?: string[] | undefined
  events: TurnEvent[]
  seats: Seat[]
  onClose: () => void
}

interface ReadyState {
  blob: Blob
  url: string
  text: string
  filename: string
}

export function ShareVerdictModal({
  structure,
  question,
  userImages,
  events,
  seats,
  onClose,
}: ShareVerdictModalProps) {
  const [css, theme] = useStyletron()
  const [ready, setReady] = useState<ReadyState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // "Shared" = the first successful share action (download / copy / native
  // sheet) — not merely opening this modal. Once per modal instance: a user
  // downloading *and* copying shared one verdict, not two.
  const sharedRef = useRef(false)
  const countShared = () => {
    if (sharedRef.current) return
    sharedRef.current = true
    analytics.event(`verdict-shared:${structure}`)
  }

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    void (async () => {
      try {
        const mod = await import('@/utils/share-card')
        const data = mod.buildShareCardData({
          structure,
          question,
          events,
          seats,
          ...(userImages && userImages.length > 0 ? { userImages } : {}),
        })
        if (!data) {
          throw new Error('This turn has no finished synthesis to share.')
        }
        const blob = await mod.renderShareCard(data)
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setReady({
          blob,
          url,
          text: mod.buildShareText(data),
          filename: mod.shareCardFilename(question),
        })
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not render the card',
          )
        }
      }
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [structure, question, userImages, events, seats])

  const download = () => {
    if (!ready) return
    const a = document.createElement('a')
    a.href = ready.url
    a.download = ready.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    countShared()
  }

  const copyImage = async () => {
    if (!ready) return
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': ready.blob }),
      ])
      toaster.positive('Image copied — paste it anywhere')
      countShared()
    } catch {
      toaster.negative('Could not copy the image — try Download instead')
    }
  }

  const copyText = async () => {
    if (!ready) return
    try {
      await navigator.clipboard.writeText(ready.text)
      toaster.positive('Text copied')
      countShared()
    } catch {
      toaster.negative('Could not copy the text')
    }
  }

  // Native share only where *file* sharing is really supported — a
  // text-only fallback sheet on desktop reads as broken.
  const shareFile = ready
    ? new File([ready.blob], ready.filename, { type: 'image/png' })
    : null
  const canNativeShare =
    !!shareFile &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [shareFile] })
  const nativeShare = async () => {
    if (!ready || !shareFile) return
    try {
      await navigator.share({ files: [shareFile], title: question })
      countShared()
    } catch {
      // Cancelled sheets land here too — nothing to report (or count).
    }
  }

  const canCopyImage = typeof ClipboardItem !== 'undefined'

  return (
    <FormModal
      title={
        <ModalTitleWithIcon icon={<FiShare2 size={18} aria-hidden />}>
          Share this result
        </ModalTitleWithIcon>
      }
      onCancel={onClose}
      {...(ready ? { onSubmit: download } : {})}
      submitLabel="Download PNG"
      cancelLabel="Close"
    >
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        })}
      >
        {error ? (
          <Notification
            kind={NotificationKind.negative}
            overrides={compactNotificationOverrides({ fontSize: '13px' })}
          >
            {error}
          </Notification>
        ) : ready ? (
          <img
            src={ready.url}
            alt="Share card preview"
            // Intrinsic size as attributes + the same reserved aspect-ratio
            // the loader used: the box is correct on mount, so swapping the
            // rendered PNG in never waits for the blob to decode (that gap is
            // the height "blink"). Ratio is fixed and shared via
            // dimensions.ts, so it can't drift from the real output.
            width={SHARE_CARD_WIDTH}
            height={SHARE_CARD_HEIGHT}
            className={css({
              width: '100%',
              height: 'auto',
              aspectRatio: SHARE_CARD_ASPECT_RATIO,
              borderRadius: '10px',
              border: `1px solid ${theme.colors.borderOpaque}`,
              display: 'block',
            })}
          />
        ) : (
          <div
            className={css({
              // Reserve the card's exact box (shared via dimensions.ts) so
              // neither this loader nor the rendered image that replaces it
              // reflows the modal.
              aspectRatio: SHARE_CARD_ASPECT_RATIO,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '10px',
              border: `1px solid ${theme.colors.borderOpaque}`,
              backgroundColor: theme.colors.backgroundSecondary,
              fontSize: '13px',
              color: theme.colors.contentTertiary,
            })}
          >
            <LoadingText>Rendering the card</LoadingText>
          </div>
        )}

        {ready && (
          <div
            className={css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            })}
          >
            {canCopyImage && (
              <Button
                type="button"
                kind={ButtonKind.secondary}
                size={ButtonSize.compact}
                onClick={() => void copyImage()}
                startEnhancer={() => <FiCopy size={14} />}
              >
                Copy image
              </Button>
            )}
            <Button
              type="button"
              kind={ButtonKind.secondary}
              size={ButtonSize.compact}
              onClick={() => void copyText()}
              startEnhancer={() => <FiFileText size={14} />}
            >
              Copy text
            </Button>
            {canNativeShare && (
              <Button
                type="button"
                kind={ButtonKind.secondary}
                size={ButtonSize.compact}
                onClick={() => void nativeShare()}
                startEnhancer={() => <FiShare2 size={14} />}
              >
                Share…
              </Button>
            )}
          </div>
        )}
      </div>
    </FormModal>
  )
}
