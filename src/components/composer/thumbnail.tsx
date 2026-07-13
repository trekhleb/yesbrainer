/**
 * Compact preview of an attached image. Square-cropped via
 * `object-fit: cover` so a mix of portrait / landscape attachments
 * lines up neatly. The ✕ corner button removes the image; disabled
 * while a turn is streaming so the in-flight payload can't go out of
 * sync with the staged state.
 *
 * `PendingThumbnail` is the same square with a centered spinner —
 * shown while an image is being downscaled/recompressed on attach, so
 * big photos give immediate feedback instead of appearing after a
 * silent pause.
 */

import { useStyletron } from 'baseui'
import { Spinner } from 'baseui/spinner'
import { FiX } from 'react-icons/fi'

/** Placeholder square while an attachment is still being processed. */
export function PendingThumbnail() {
  const [css, theme] = useStyletron()
  return (
    <div
      aria-label="Processing image…"
      role="status"
      className={css({
        width: '56px',
        height: '56px',
        borderRadius: '8px',
        border: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundSecondary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {/* Neutral-ink spinner — Base Web's default is its brand blue, which
          reads foreign next to the app's black accent. contentPrimary keeps
          it black in light mode and white in dark. */}
      <Spinner
        $size="20px"
        $borderWidth="2px"
        $color={theme.colors.contentPrimary}
      />
    </div>
  )
}

export function Thumbnail({
  src,
  onRemove,
  disabled,
}: {
  src: string
  onRemove: () => void
  disabled: boolean
}) {
  const [css, theme] = useStyletron()
  return (
    <div
      className={css({
        position: 'relative',
        width: '56px',
        height: '56px',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${theme.colors.borderOpaque}`,
        backgroundColor: theme.colors.backgroundSecondary,
      })}
    >
      <img
        src={src}
        alt="attachment preview"
        className={css({
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        })}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove image"
        title="Remove"
        className={css({
          position: 'absolute',
          top: '2px',
          right: '2px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: 'none',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          color: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <FiX size={12} />
      </button>
    </div>
  )
}
