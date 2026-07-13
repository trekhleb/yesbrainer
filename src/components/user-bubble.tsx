import { useState } from 'react'
import { useStyletron } from 'baseui'
import {
  Modal,
  ModalBody,
  ROLE,
  SIZE as ModalSize,
} from 'baseui/modal'
import { MEDIA_MODAL_OVERRIDES } from '@/components/modal-overrides'

export interface UserBubbleProps {
  content: string
  /** Image attachments sent with this message. Each entry is a
   *  `data:image/...;base64,…` URI. Rendered as a thumbnails strip
   *  above the text; click any thumbnail to enlarge in a modal. */
  images?: string[]
}

export function UserBubble({ content, images }: UserBubbleProps) {
  const [css, theme] = useStyletron()
  const [enlarged, setEnlarged] = useState<string | null>(null)
  const imageList = images ?? []
  const hasImages = imageList.length > 0
  const isDark = theme.name === 'dark-theme'
  return (
    <>
      <div
        className={css({
          alignSelf: 'flex-end',
          maxWidth: '80%',
          // Extra space above each question: with the flat (frameless)
          // thread, this is what visually opens a new turn-group.
          marginTop: '12px',
          // Accent-filled bubble (iMessage convention: *your* words
          // carry the tint). Text uses the theme's on-accent colour so it
          // contrasts the fill in both themes — the hardcoded white turned
          // invisible once the dark accent became near-white.
          backgroundColor: theme.colors.accent,
          color: theme.colors.buttonPrimaryText,
          padding: '10px 14px',
          borderRadius: '18px',
          whiteSpace: 'pre-wrap',
          fontSize: '15px',
          lineHeight: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        })}
      >
        {hasImages && (
          <div
            className={css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            })}
          >
            {imageList.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEnlarged(src)}
                aria-label="Open image attachment"
                title="Click to enlarge"
                className={css({
                  width: '96px',
                  height: '96px',
                  padding: 0,
                  border: 'none',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: 'transparent',
                  // Subtle outline that contrasts the bubble fill in either
                  // theme (the fill is dark in light mode, light in dark).
                  outline: `1px solid ${
                    isDark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.15)'
                  }`,
                })}
              >
                <img
                  src={src}
                  alt={`attachment ${i + 1}`}
                  className={css({
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  })}
                />
              </button>
            ))}
          </div>
        )}
        {content}
      </div>
      {enlarged && (
        <Modal
          isOpen
          onClose={() => setEnlarged(null)}
          closeable
          animate
          autoFocus
          size={ModalSize.auto}
          role={ROLE.dialog}
          overrides={MEDIA_MODAL_OVERRIDES}
        >
          {/* No header — the image is the whole content; a "Image
              attachment" title just pushed it down. The ✕ close button is
              rendered by the Modal itself, and the top margin keeps the
              image clear of it. */}
          <ModalBody $style={{ marginTop: '40px' }}>
            <img
              src={enlarged}
              alt="enlarged attachment"
              className={css({
                maxWidth: '100%',
                maxHeight: '70vh',
                display: 'block',
                margin: '0 auto',
              })}
            />
          </ModalBody>
        </Modal>
      )}
    </>
  )
}
