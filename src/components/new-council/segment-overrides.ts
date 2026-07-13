/**
 * Per-structure `<Segment>` overrides for the social-structure picker.
 *
 * Desktop keeps the native segmented control — a neutral track with the
 * sliding, colour-tinted active frame (the picker's `Active` override tints
 * that frame with the selected structure's colour, so it animates *and*
 * carries the type colour). Here we only set the card padding / radius and
 * let labels + descriptions wrap (Base Web truncates them to one ellipsised
 * line by default).
 *
 * Mobile (<=600px) stacks the segments into vertical cards. To match desktop,
 * the cards stay *neutral* (`neutralBg`) until selected — the type colour
 * (tint + accent ring) fades in on the selected card only; the icon stays
 * its accent colour in every state, exactly like the desktop track. The flex
 * reset is load-bearing — Base Web's fixed-fill segments use
 * `flex-basis: 0; flex-grow: 1`, which collapses to zero height in a column
 * and (with the segment's `overflow: hidden`) clips the description; `flex:
 * 0 0 auto` + `overflow: visible` lets each card grow to fit its text.
 *
 * Lives in its own file so the picker can build per-segment overrides
 * without tripping react-refresh's "components only" rule. `neutralBg` is the
 * theme's `backgroundSecondary` (passed in since this isn't a component).
 */

import type { StructureColorSet } from '@/models/social-structure-colors'

export function segmentOverrides(colors: StructureColorSet, neutralBg: string) {
  return {
    Segment: {
      style: ({
        $isActive,
        $focusVisible,
      }: {
        $isActive?: boolean
        $focusVisible?: boolean
      }) => ({
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '14px',
        paddingRight: '14px',
        borderRadius: '10px',
        // Top-align the content so the chip + title row sits at the SAME height
        // in every segment, regardless of how many lines its description wraps
        // to. Base Web's stock `alignItems: center` floated the titles to
        // different heights as the descriptions differed in length.
        alignItems: 'start',
        alignContent: 'start',
        // Focus ring colour MUST stay the SAME token as the active selection
        // frame's border (the picker's `Active` override = `selected.border`,
        // i.e. this same `colors.border`). Why this matters: on a direct page
        // load the modal autofocuses the active segment → `$focusVisible` fires
        // and this outline paints; on client-side nav (clicking "New council")
        // it doesn't. If the two read *different* shades (this used the stronger
        // `cardBorder` before, or here a thicker 3px outline), the very same
        // selected segment looked gentle when clicked but bolder when refreshed.
        // Reading `border` here — the identical token the active frame uses — at
        // the same 1px width keeps the selection one colour AND one weight
        // however the modal was opened; it can only drift if BOTH change. (We
        // still override away from the brand default, a harsh black ring.)
        ...($focusVisible
          ? { outline: `1px solid ${colors.border}`, outlineOffset: '-1px' }
          : {}),
        '@media (max-width: 600px)': {
          flexGrow: 0,
          flexBasis: 'auto',
          overflow: 'visible',
          // Neutral until selected; the type colour (flat tint) fades in on
          // select. The bold solid icon-chip carries the colour either way.
          backgroundColor: $isActive ? colors.bg : neutralBg,
          border: `1px solid ${$isActive ? colors.border : 'transparent'}`,
          transitionProperty: 'border-color, background-color, color',
          transitionDuration: '160ms',
          transitionTimingFunction: 'ease',
        },
      }),
    },
    LabelBlock: {
      // The whole card body (icon-chip + title + description) renders as the
      // segment label now, so the label block just needs to be full-width and
      // left-aligned — `DeliberationCardContent` lays itself out.
      style: { width: '100%', justifyContent: 'flex-start' },
    },
    Label: {
      // Let the shared card body fill the segment and wrap freely (Base Web's
      // default constrains the label to a single ellipsised line).
      style: {
        width: '100%',
        whiteSpace: 'normal',
        overflow: 'visible',
        textOverflow: 'clip',
      },
    },
  }
}
