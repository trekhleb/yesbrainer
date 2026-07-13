/**
 * One council row in the sidebar.
 *
 * Holds: hash-route anchor (so middle-click / cmd-click open in a new
 * tab), active-row styling, the structure pill + seat logos, and the
 * per-row kebab popover (Rename / Settings / Delete). Rename / Settings /
 * Delete all open app-level modals — the Row just fires the triggers.
 */

import { useStyletron } from 'baseui'
import { primitiveDarkColors, primitiveLightColors } from 'baseui/tokens'
import { Button, KIND, SIZE } from 'baseui/button'
import { StatefulPopover, PLACEMENT } from 'baseui/popover'
import { LabelSmall } from 'baseui/typography'
import { FiMoreVertical } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { RowContextMenu } from '@/components/sidebar/row-context-menu'
import { analytics } from '@/analytics'
import { councilExportFilename, exportOneCouncil } from '@/storage/transfer'
import { downloadJson } from '@/utils/download-json'
import { SeatLogos } from '@/components/sidebar/seat-logos'
import { StructurePill } from '@/components/structure-pill'
import { councilPath } from '@/hooks/use-app-route'
import { structureColorSet } from '@/models/social-structure-colors'
import { socialStructureMeta } from '@/models/social-structures'
import { menuPopoverOverrides } from '@/utils/popover-styles'
import type { CouncilSummary } from '@/storage/councils'

export function Row({
  council,
  active,
  isGeneratingTitle,
  isStreaming,
  onSelect,
  onSettings,
  onDelete,
  onRename,
  onShareResult,
}: {
  council: CouncilSummary
  active: boolean
  isGeneratingTitle: boolean
  /** A run is in flight on this council (any kind — turn fan-out, retries,
   *  titler; background-continuing runs included). Together with
   *  `isGeneratingTitle` it puts the ⋯ button into its loading state — the
   *  card's one busy indicator. */
  isStreaming: boolean
  onSelect: () => void
  onSettings: () => void
  onDelete: () => void
  /** Open the rename modal (app-level). */
  onRename: () => void
  /** Open the share-card modal for this council's latest finished verdict
   *  (app-level; only offered on structures with a synthesis). */
  onShareResult: () => void
}) {
  const [css, theme] = useStyletron()
  // One busy signal for the card: the LLM titler or any run in flight.
  // Worn by the kebab (its `isLoading` state) rather than a spinner next
  // to the title — the button is a fixed overlay in the card's top-right,
  // so nothing reflows, and `isLoading` also blocks the menu: its actions
  // target a moving council (Rename races the titler's write, a Settings
  // save is ignored by the run already in flight, Export snapshots a
  // half-written turn). Stop lives in the composer; Delete unblocks the
  // moment the runs it would abort anyway have settled.
  const busy = isGeneratingTitle || isStreaming
  // Social-structure pill leading the card so councils are distinguishable
  // at a glance (parallel vs trial vs consensus) — the same color-coded
  // `StructurePill` (icon + type label) the council header shows, tinted
  // from the shared `social-structure-colors`. `meta` only gates whether
  // there's a pill row to render (`custom` has no metadata yet).
  const meta = socialStructureMeta(council.socialStructure)

  const isDark = theme.name === 'dark-theme'
  // Demo-pill violet. Base Web ships no violet `<Tag>` tokens, so this
  // borrows its purple primitives with the same light-fill / deep-font
  // pairing per theme that its tag recipes use. Deliberately pale-fill /
  // deep-text (a light tag, not a heavy solid fill), and violet stays clear
  // of all four active `vibrant` type hues (blue/gold/teal/slate). A pink
  // trial was rejected in favour of this.
  const demoPill = isDark
    ? {
        font: primitiveDarkColors.purple900Dark,
        bg: primitiveDarkColors.purple100Dark,
      }
    : {
        font: primitiveLightColors.purple700,
        bg: primitiveLightColors.purple50,
      }
  // The active card is tinted with the council type's own colours — the same
  // centralised `structureColorSet` the pill, the New-council picker and the
  // /about cards read. The selected look mirrors the create-council segment:
  // the type's flat `bg` tint + its **brighter `border`** (the gentle l200
  // shade) — the same soft outline the /about showcase cards use. The darker
  // `cardBorder` is reserved for the New-council picker's selected segment.
  // Single source: change a type's hue in `social-structure-colors.ts`
  // (or flip `ACTIVE_PALETTE`) and the pill, picker and this card all follow.
  const structureColors = structureColorSet(council.socialStructure, isDark)
  return (
    <div
      className={css({
        // Relative so the kebab can overlay the top-right of the first
        // (pill) row without reserving a column for it.
        position: 'relative',
        borderRadius: '10px',
        // Quiet rows (ChatGPT/Claude convention): transparent at rest, soft
        // neutral fill on hover. The active row gets the type's flat tint
        // fill **plus a type-coloured border** — not a heavier title. Bumping
        // the title's font-weight when active reflowed the wrapped text and
        // made the card jump, so selection is carried by the tint + border.
        backgroundColor: active ? structureColors.bg : 'transparent',
        // A 1px border is always present (transparent at rest, the gentle
        // `border` token when active) — the width is constant across states,
        // so selecting/deselecting never nudges contents by a pixel.
        border: `1px solid ${active ? structureColors.border : 'transparent'}`,
        // No transition — selection, deselection and hover are all immediate,
        // so the list stays visually consistent as rows toggle.
        ':hover': {
          // Active rows keep their type tint on hover; inactive rows get the
          // neutral hover wash.
          backgroundColor: active
            ? structureColors.bg
            : isDark
              ? 'rgba(255, 255, 255, 0.06)'
              : 'rgba(0, 0, 0, 0.05)',
        },
      })}
    >
      {/* No hover tooltip on the row — the title now wraps in full on the
          card itself (the old preview popup was redundant). */}
      <Link
        // Real council route (`/council/<id>`). <Link> handles
        // navigation, and modifier / middle-click falls through to the
        // browser — cmd-click opens the real URL in a new tab, which
        // boots the SPA via the 404 fallback and rehydrates from
        // IndexedDB. On a plain click we only fire the side effect
        // (close the mobile drawer); <Link> does the navigating.
        to={councilPath(council.id)}
        onClick={(e) => {
          if (
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            e.defaultPrevented
          ) {
            return
          }
          onSelect()
        }}
        aria-label={council.title ?? 'Untitled'}
        className={css({
          textAlign: 'left',
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '10px',
          paddingRight: '10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          // Two stacked rows: the pill + roster-logos header line, then the
          // full-width title.
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          minWidth: 0,
          color: theme.colors.contentPrimary,
          fontFamily: 'inherit',
          textDecoration: 'none',
        })}
      >
        {/* Row 1 — one line: the structure pill (left, fixed), the roster
            logos (middle, take the slack and scroll horizontally when the
            council has many seats), the DEMO pill on seeded councils
            (right), and the kebab (overlaid top-right; `paddingRight`
            reserves its lane so a long roster scrolls *up to* it and never
            slides underneath). */}
        <span
          className={css({
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
            paddingRight: '30px',
          })}
        >
          {meta && (
            <StructurePill
              structure={council.socialStructure}
              size="small"
            />
          )}
          <SeatLogos modelIds={council.modelIds} scroll />
          {council.isDemo && (
            // Honest labeling for the seeded recordings: the row must never
            // read as a conversation the user (or a live model) had. Sits at
            // the row's far right (`SeatLogos` takes the slack), tucked next
            // to the kebab, so the type pill + roster keep the exact look of
            // a real council and DEMO reads as a corner annotation. Light
            // violet tint (`demoPill` above), not a heavy solid fill. Kept
            // even after keys land.
            <span
              className={css({
                flexShrink: 0,
                // Same height as the StructurePill across the row, by
                // construction rather than by copying its font metrics: the
                // pill is the tallest item in the row, so stretching to the
                // row's cross axis makes the two pills equal, and flex
                // re-centres the label. (Without a pill the tag falls back
                // to its own intrinsic height — stretch never shrinks it.)
                alignSelf: 'stretch',
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '10px',
                lineHeight: 1,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: demoPill.font,
                backgroundColor: demoPill.bg,
                // The light fill blends into the grey sidebar in both themes,
                // so a faint ring in the tag's own font colour pops the edge
                // without reading as a heavy outline (a literal white border
                // would vanish on the light sidebar).
                border: `1px solid color-mix(in srgb, ${demoPill.font} 35%, transparent)`,
                // Fully rounded to read as a sibling of the StructurePill.
                // Height comes from the stretch above, so the vertical
                // padding only matters on pill-less rows; sides stay slim so
                // the tag doesn't outweigh its four-letter label.
                borderRadius: '999px',
                paddingTop: '3px',
                paddingBottom: '3px',
                paddingLeft: '5px',
                paddingRight: '5px',
              })}
            >
              Demo
            </span>
          )}
        </span>
        {/* Row 2 — council title, full width, wraps to 2-3 lines. Rename is
            a modal now (kebab → Rename), so the title is always plain text. */}
        <LabelSmall
          marginTop="0"
          marginBottom="0"
          overrides={{
            Block: {
              style: {
                // Titles wrap in full — they're the only thing
                // identifying a council. Normally the 60-char
                // generation cap bounds them to ~3 lines; the
                // `-webkit-line-clamp` below is the UI safety net for
                // the rare LLM glitch (or a manual title) that slips
                // past the cap — it clamps to 3 lines and appends an
                // ellipsis instead of ballooning the card. (A
                // single-line ellipsis was rejected: it hid the words
                // that distinguish similar councils — 3 lines keeps
                // them.) `overflowWrap: anywhere` lets even a
                // space-less runaway string break so the clamp can
                // catch it; `minWidth: 0` lets the title shrink inside
                // its flex column rather than overflow.
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                minWidth: 0,
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: '3',
                overflow: 'hidden',
                lineHeight: 1.35,
                // Constant weight across active / inactive — selection
                // is shown by the card's accent border, not a heavier
                // title (a weight change reflowed the wrapped text).
                fontWeight: 500,
                // Subtle alpha while gen is in flight so the
                // user perceives the title as draft — the swap
                // to the polished title then reads as "the work
                // finished" rather than as a flicker. (The spinner
                // itself is the kebab's loading state, top-right.)
                opacity: isGeneratingTitle ? 0.65 : 1,
                transitionProperty: 'opacity',
                transitionDuration: '120ms',
              },
            },
          }}
        >
          {council.title ?? 'Untitled'}
        </LabelSmall>
      </Link>
      <StatefulPopover
        placement={PLACEMENT.bottomRight}
        showArrow
        autoFocus={false}
        popperOptions={{
          modifiers: {
            preventOverflow: { boundariesElement: 'viewport' },
            flip: { boundariesElement: 'viewport' },
          },
        }}
        overrides={menuPopoverOverrides(theme)}
        content={({ close }) => (
          <RowContextMenu
            onSettings={() => {
              close()
              onSettings()
            }}
            onRename={() => {
              close()
              onRename()
            }}
            onExport={() => {
              close()
              // Self-contained (no app-level modal/state): fetch the
              // council's bundle and trigger the download right here. The
              // exported file is the same v1 envelope backups use — and
              // dropping it unedited into `src/data/demo-councils/` is the
              // whole workflow for shipping a recorded demo.
              void exportOneCouncil(council.id).then((bundle) => {
                if (bundle) {
                  downloadJson(bundle, councilExportFilename(council.title))
                  analytics.event('data-exported')
                }
              })
            }}
            // Every shippable structure has a share artifact — Trial /
            // Consensus share their verdict, Parallel shares the answer
            // panorama. Only `custom` (no defined artifact) is excluded.
            {...(council.socialStructure !== 'custom'
              ? {
                  onShare: () => {
                    close()
                    onShareResult()
                  },
                }
              : {})}
            onDelete={() => {
              close()
              onDelete()
            }}
            tokenTotal={council.tokenTotal}
          />
        )}
      >
        <Button
          type="button"
          kind={KIND.tertiary}
          size={SIZE.mini}
          // The card's busy indicator (see `busy` above): Base Web swaps the
          // glyph for its spinner inside the same button box (children stay
          // mounted, so the box never resizes — no layout shift) and
          // `isLoading` swallows clicks, which is what keeps the menu shut
          // mid-run.
          isLoading={busy}
          onClick={(e) => e.stopPropagation()}
          aria-label={busy ? 'Council is working' : 'More actions'}
          title={busy ? 'Council is working…' : 'More actions'}
          overrides={{
            // Overlaid on the top-right of the pill row (parent is
            // `position: relative`) so it no longer reserves a column —
            // the title gets the full card width.
            BaseButton: {
              style: { position: 'absolute', top: '4px', right: '4px' },
            },
            LoadingSpinner: {
              style: {
                // Same box as the kebab glyph, so the swap is pixel-stable
                // (Base Web's mini spinner is 16px to the glyph's 14px).
                width: '14px',
                height: '14px',
                // The static partial ring still signals "working" without
                // the rotation (mirrors the retired TitleSpinner's rule).
                '@media (prefers-reduced-motion: reduce)': {
                  animationName: 'none',
                },
              },
            },
          }}
        >
          <FiMoreVertical size={14} />
        </Button>
      </StatefulPopover>
    </div>
  )
}
