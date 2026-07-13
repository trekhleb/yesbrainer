/**
 * The one mobile breakpoint, in its two consumable forms: the bare
 * matchMedia condition and the Styletron media-query key. Every
 * `@media (max-width: 767px)` in a `css({ ... })` object and every
 * `window.matchMedia(...)` mobile check must use these — a hand-typed
 * copy is how the breakpoint and `useIsMobile` drift apart (the JS
 * switch flips at 768 while a stray 760 in CSS doesn't, and the shell
 * disagrees with its own styles).
 *
 * A constants module, not part of the hook: styles files consume the
 * media-query key without touching React.
 */
export const MOBILE_QUERY = '(max-width: 767px)'
export const MOBILE_MEDIA_QUERY = `@media ${MOBILE_QUERY}` as const
