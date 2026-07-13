/**
 * Image-attachment state + handlers for the composer.
 *
 * Owns: the in-flight `images[]` (base64 data URIs), the staged
 * `attachError` banner text, the `dragOver` highlight state, the
 * hidden `<input type="file">` ref, and the attach pipeline (count cap,
 * image-type sniff, downscale/recompress via `attachImageAsDataUri`).
 *
 * Splitting the cluster out of `<Composer>` shrinks the component
 * body and makes the attachment behaviour testable in isolation.
 * Drag/drop handlers come back as a `dragProps` bag the caller spreads
 * onto its form element so the form stays in one place and this
 * hook stays DOM-agnostic.
 */

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import {
  attachImageAsDataUri,
  MAX_IMAGES_PER_TURN,
} from '@/utils/file-to-data-uri'

export interface UseImageAttachments {
  /** Base64 data URIs, in attach order. Send to `onSend` and reset
   *  via `clearAll` after a successful turn. */
  images: string[]
  /** Attachments still in the downscale/recompress pipeline — render one
   *  spinner placeholder each, and hold Send until it drops to 0 (a send
   *  mid-processing would silently omit the in-flight images). */
  pendingImages: number
  /** Validation-failure banner text (non-image, undecodable, too many).
   *  Null when nothing's wrong. */
  attachError: string | null
  /** Form's "is something being dragged onto me" highlight. */
  dragOver: boolean
  /** Hidden `<input type="file">` ref. Wire it onto the input the
   *  paperclip button triggers. */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** Spread onto the form element to enable drag/drop file accept. */
  dragProps: {
    onDragEnter: (e: DragEvent<HTMLFormElement>) => void
    onDragOver: (e: DragEvent<HTMLFormElement>) => void
    onDragLeave: (e: DragEvent<HTMLFormElement>) => void
    onDrop: (e: DragEvent<HTMLFormElement>) => void
  }
  /** Wire onto the hidden file input's `onChange`. */
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void
  /** Attach files programmatically — the composer's paste handler feeds
   *  clipboard screenshots (⌘V) through the same validation path. */
  addFiles: (files: File[]) => void
  /** Remove one attached image by index. */
  removeImage: (idx: number) => void
  /** Clear images + error after a successful send. */
  clearAll: () => void
}

export function useImageAttachments(): UseImageAttachments {
  const [images, setImages] = useState<string[]>([])
  const [pendingImages, setPendingImages] = useState(0)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Occupied attachment slots: attached images + accepted files still in
  // the async downscale pipeline. A ref, not state, for two reasons: the
  // cap check needs a synchronously-current value (the previous no-op
  // `setImages` read-trick silently returned 0 whenever another update —
  // e.g. the drop handler's `setDragOver(false)` — was already pending on
  // the component, so every drag-drop hit the "too many images" branch),
  // and counting in-flight files keeps two quick drops from both passing
  // the room check before either batch lands.
  const occupiedSlots = useRef(0)

  const addImageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const errors: string[] = []
      const accepted: File[] = []
      for (const f of files) {
        if (!f.type.startsWith('image/')) {
          errors.push(`"${f.name}" isn't an image`)
          continue
        }
        accepted.push(f)
      }
      const room = Math.max(0, MAX_IMAGES_PER_TURN - occupiedSlots.current)
      const sliced = accepted.slice(0, room)
      if (accepted.length > sliced.length) {
        errors.push(`Only ${MAX_IMAGES_PER_TURN} images per turn`)
      }
      if (sliced.length > 0) {
        // Oversized images are downscaled/recompressed rather than
        // rejected (attachImageAsDataUri); an error here means the file
        // genuinely couldn't be decoded or shrunk. While the batch is in
        // flight, spinner placeholders render in the thumbnails strip.
        occupiedSlots.current += sliced.length
        setPendingImages((n) => n + sliced.length)
        let attached = 0
        try {
          const settled = await Promise.allSettled(
            sliced.map(attachImageAsDataUri),
          )
          const dataUris: string[] = []
          for (const s of settled) {
            if (s.status === 'fulfilled') dataUris.push(s.value)
            else {
              errors.push(
                s.reason instanceof Error
                  ? s.reason.message
                  : 'Couldn\'t process an image',
              )
            }
          }
          attached = dataUris.length
          if (dataUris.length > 0) {
            setImages((cur) => [...cur, ...dataUris])
          }
        } finally {
          setPendingImages((n) => n - sliced.length)
          // Files that failed the pipeline free their slots.
          occupiedSlots.current = Math.max(
            0,
            occupiedSlots.current - (sliced.length - attached),
          )
        }
      }
      setAttachError(errors.length > 0 ? errors.join(' · ') : null)
    },
    [],
  )

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.currentTarget.files
      if (!list) return
      void addImageFiles(Array.from(list))
      // Reset so picking the same file twice in a row re-fires the
      // change event.
      e.currentTarget.value = ''
    },
    [addImageFiles],
  )

  const removeImage = useCallback((idx: number) => {
    occupiedSlots.current = Math.max(0, occupiedSlots.current - 1)
    setImages((cur) => cur.filter((_, i) => i !== idx))
  }, [])

  const clearAll = useCallback(() => {
    // Send is held while pendingImages > 0, so no batch can be in flight
    // here — the slot count resets with the images.
    occupiedSlots.current = 0
    setImages([])
    setAttachError(null)
  }, [])

  const dragProps = {
    onDragEnter: (e: DragEvent<HTMLFormElement>) => {
      if (Array.from(e.dataTransfer.types).includes('Files')) {
        setDragOver(true)
      }
    },
    onDragOver: (e: DragEvent<HTMLFormElement>) => {
      if (Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault()
        setDragOver(true)
      }
    },
    onDragLeave: (e: DragEvent<HTMLFormElement>) => {
      // The drag-leave fires for any child element too; only clear
      // when leaving the form entirely (no relatedTarget inside us).
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragOver(false)
      }
    },
    onDrop: (e: DragEvent<HTMLFormElement>) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) void addImageFiles(files)
    },
  }

  return {
    images,
    pendingImages,
    attachError,
    dragOver,
    fileInputRef,
    dragProps,
    onFileInputChange,
    addFiles: (files: File[]) => void addImageFiles(files),
    removeImage,
    clearAll,
  }
}
