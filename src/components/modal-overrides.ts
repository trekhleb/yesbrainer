/**
 * Shared Base Web `Modal` overrides for the app's dialog shapes — the
 * backdrop fix, rounded corners, and phone gutter, in one place.
 *
 * Split out of `form-modal.tsx` so that component file only exports
 * components (React Fast Refresh requirement) and so the media-viewer
 * lightbox (`user-bubble.tsx`), which renders a raw `<Modal>` rather than
 * the `FormModal`/`ConfirmModal` scaffold, can share the exact same
 * treatment without importing from a component module.
 */

// iOS modal-backdrop fix. Base Web paints the dim (rgba(0,0,0,0.5)) on
// `DialogContainer` — but that's the *scrolling content* (`minHeight:100%`)
// inside the fixed, `overflow:auto` `Root`. So an iOS overscroll rubber-band
// slides the dim away from the screen edge and exposes the app behind the
// transparent `Root` ("the backdrop bounces and shows white underneath").
// Moving the dim onto the *fixed* `Root` (a scroll viewport's background never
// scrolls) keeps it covering the screen at all times; only the white dialog
// bounces within it. `overscrollBehavior: contain` stops the modal's scroll
// from chaining out. Trade-off: the dim appears instantly instead of fading in
// with the dialog — negligible. (The body scroll-lock in index.css separately
// handles the *document* bounce, which is what the Drawer hit.)
const BACKDROP_OVERRIDES = {
  Root: {
    style: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      overscrollBehavior: 'contain',
    },
  },
  DialogContainer: {
    style: { backgroundColor: 'transparent' },
  },
} as const

const DIALOG_RADII = {
  borderTopLeftRadius: '16px',
  borderTopRightRadius: '16px',
  borderBottomLeftRadius: '16px',
  borderBottomRightRadius: '16px',
} as const

// Form modals fit their *content* height (`SIZE.default`, not the viewport-
// filling `SIZE.full`), so a short form (e.g. a Parallel council) no longer
// leaves a sea of empty space below the footer and the dialog centres
// vertically. A tall council just grows the dialog and the whole modal scrolls
// inside the backdrop (the `Root` is the scroll viewport). We deliberately set
// **no `maxHeight`**: capping the dialog height without a scrolling body only
// clips the white box and lets the footer spill out below it. Comfortable fixed
// width, capped to the viewport on phones.
export const FORM_OVERRIDES = {
  ...BACKDROP_OVERRIDES,
  Dialog: {
    style: {
      width: '860px',
      maxWidth: 'calc(100vw - 32px)',
      marginLeft: 'auto',
      marginRight: 'auto',
      ...DIALOG_RADII,
    },
  },
} as const

// Confirm dialogs are narrow (a short question), but — like the form modals —
// capped to the viewport on phones via `calc(100vw - 32px)` so they keep a
// left/right gutter instead of running edge-to-edge over the dimmed backdrop.
export const CONFIRM_OVERRIDES = {
  ...BACKDROP_OVERRIDES,
  Dialog: {
    style: {
      width: '460px',
      maxWidth: 'calc(100vw - 32px)',
      marginLeft: 'auto',
      marginRight: 'auto',
      ...DIALOG_RADII,
    },
  },
} as const

// Media-viewer modals (e.g. the image lightbox in `user-bubble.tsx`) render a
// raw Base Web <Modal> rather than the FormModal scaffold — they fit their
// content (`SIZE.auto`). Shares the backdrop fix, rounded corners, and the
// same phone gutter the form / confirm dialogs use.
export const MEDIA_MODAL_OVERRIDES = {
  ...BACKDROP_OVERRIDES,
  Dialog: {
    style: {
      maxWidth: 'calc(100vw - 32px)',
      marginLeft: 'auto',
      marginRight: 'auto',
      ...DIALOG_RADII,
    },
  },
} as const
