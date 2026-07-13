import { MOBILE_MEDIA_QUERY } from '@/styles/breakpoints'
/**
 * Shared font sizing for Settings inputs / textareas.
 *
 * A touch smaller than Base Web's default (16px) so fields sit in lockstep
 * with the 14px card / caption text — but **pinned back to 16px on mobile**,
 * because iOS Safari auto-zooms a focused field whose `font-size` is < 16px.
 * So: 14px on desktop (no zoom risk), 16px on narrow viewports (no zoom).
 *
 * One source for the value, spread into the `Input` override of the shared
 * field components (PromptField / DimensionsField / the behavior number input
 * / the Keys input) — change it here, change it everywhere.
 */
export const COMPACT_INPUT_FONT_STYLE = {
  fontSize: '14px',
  [MOBILE_MEDIA_QUERY]: { fontSize: '16px' },
}
