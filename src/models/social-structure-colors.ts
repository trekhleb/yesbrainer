/**
 * Per-social-structure accent palette — the single source of truth for the
 * colour that identifies each deliberation shape across the UI (New-council
 * picker, /about explainer cards, and — later — council cards / sidebar rows
 * tinted by type). Anything that needs "the colour for this structure" reads
 * it via `structureColorSet()` rather than hardcoding a hex.
 *
 * ── Experimenting with colours ──────────────────────────────────────────
 * To try a different look, change ONE line: `ACTIVE_PALETTE` below. Several
 * palettes ship ready to go (gradient-chip sets `vibrant` / `aurora` /
 * `sunset`; flat sets `studio` / `atelier` / `jewel` / `ink` / `modern` /
 * `default` / `cool` / `vivid` / `playful`); the dev server hot-reloads so
 * you can eyeball each instantly. To add your own, drop a new entry in
 * `PALETTES` mapping each structure to a `Hue`. `vibrant` is the active
 * set — bright two-stop gradient icon-chips (indigo→sky Parallel, gold
 * Trial, teal→green Consensus) over white cards; Trial's base hue is gold
 * (matches the in-chat Voting/Judge gold; a pink read as an error state on
 * the highlighted card, purple read too close to the accent). Rejected
 * directions stay parked in `PALETTES`: `default` read cartoonish, `ink`
 * bleak, `jewel` a cousin of the original, `atelier` warm-editorial rather
 * than bright.
 *
 * Each structure carries a light- and a dark-mode triple:
 *   - `bg`     — tinted surface for a card / chip background.
 *   - `border` — hairline (or selection ring) that reads against `bg`.
 *   - `accent` — saturated colour for the icon and emphasis.
 */

import type { SocialStructure } from '@/types/council'

export interface StructureColorSet {
  /** Flat tinted card / chip background. */
  bg: string
  /** The **brighter / lighter** type-coloured border (the light l200 shade) —
   *  subtle internal dividers / chips plus the /about showcase cards' outline.
   *  Its darker companion is `cardBorder` (the *selection* states: the picker's
   *  selected segment + the sidebar's active row). Both are derived from the
   *  council colour set, so each is one edit in `buildTheme`. */
  border: string
  /** The *darker* type-coloured **card outline** — the single token every
   *  "type card" reads for its border, so retinting a type's card outline is
   *  one edit: the New-council picker's selected segment, the sidebar's active
   *  row, the /about cards, and (mirrored onto `RoleColors.cardBorder`) the
   *  in-chat synthesis cards. Currently the accent shade; distinct from the
   *  lighter hairline `border` above. */
  cardBorder: string
  /** Saturated colour for an icon or emphasis *text* on a light surface —
   *  dark enough to clear WCAG AA against `bg`. */
  accent: string
  /** Saturated *fill* for solid surfaces (the bold icon-chip, selected
   *  states). Vivid in both themes. */
  solid: string
  /** Optional bright two-stop *gradient* for the solid icon-chip fill
   *  (`linear-gradient(...)`). Undefined → the chip stays a flat `solid` fill.
   *  Layered as `background-image` over `solid` (which is the fallback). */
  solidGradient?: string
  /** Icon / text colour that reads on `solid` — white for every shipped hue
   *  (all the chosen fills are dark enough). Only ever carries an icon, not
   *  body text, so it isn't held to the AA text ratio. */
  onSolid: string
  /** Luminous hue for ambient glows (the get-started aura): the *bright* end
   *  of the gradient stops when the palette has them, else `solid`. The
   *  600-weight solids read muddy at low alpha over the page background
   *  (yellow-600 turns ochre); glows want the vivid 400-weight light. */
  glow: string
}

interface StructureColorTheme {
  light: StructureColorSet
  dark: StructureColorSet
}

/**
 * A hue, sampled from a Tailwind colour ramp. Light cards use the 50 / 200 /
 * 600 shades; dark cards tint the 500 / 400 shades over the dark surface
 * (via alpha) and brighten the accent to 300 so it reads on dark.
 */
interface Hue {
  l50: string
  l200: string
  l600: string
  d500: string
  d400: string
  d300: string
  /** Optional two-stop gradient for the solid icon-chip fill — `[from, to]`,
   *  light- and dark-mode variants. Omitted → the chip stays a flat fill. */
  gradLight?: readonly string[]
  gradDark?: readonly string[]
}

// Appended to the dark bg / border shades as 8-digit-hex alpha (~16% / ~32%).
const BG_ALPHA = '29'
const BORDER_ALPHA = '52'

// The old radial-glow / diagonal-tint *card-wash* `cardGradient` stays retired
// (it read heavy across a whole surface). What's back is a different beast: a
// bright two-stop *linear* gradient on the solid icon-chip only — the vibrant
// "modern SaaS" chip look. A palette opts in by giving its hues `gradLight` /
// `gradDark` stops; without them, `solidGradient` is undefined and the chip
// stays a flat `solid` fill.
function solidGrad(stops?: readonly string[]): string | undefined {
  if (!stops || stops.length < 2) return undefined
  return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 100%)`
}

function buildTheme(h: Hue): StructureColorTheme {
  const darkBg = `${h.d500}${BG_ALPHA}`
  const darkBorder = `${h.d400}${BORDER_ALPHA}`
  return {
    light: {
      bg: h.l50,
      border: h.l200,
      // Card outline = the darker accent shade. Change this mapping (here only)
      // to retint every type card's border at once.
      cardBorder: h.l600,
      accent: h.l600,
      solid: h.l600,
      solidGradient: solidGrad(h.gradLight),
      onSolid: '#FFFFFF',
      glow: h.gradLight?.[1] ?? h.l600,
    },
    dark: {
      bg: darkBg,
      border: darkBorder,
      cardBorder: h.d300,
      accent: h.d300,
      solid: h.d500,
      solidGradient: solidGrad(h.gradDark),
      onSolid: '#FFFFFF',
      glow: h.gradDark?.[1] ?? h.d500,
    },
  }
}

// ── Hue swatches (Tailwind shades) ───────────────────────────────────────
const INDIGO: Hue = { l50: '#EEF2FF', l200: '#C7D2FE', l600: '#4F46E5', d500: '#6366F1', d400: '#818CF8', d300: '#A5B4FC' } // prettier-ignore
const AMBER: Hue = { l50: '#FFFBEB', l200: '#FDE68A', l600: '#D97706', d500: '#F59E0B', d400: '#FBBF24', d300: '#FCD34D' } // prettier-ignore
const EMERALD: Hue = { l50: '#ECFDF5', l200: '#A7F3D0', l600: '#059669', d500: '#10B981', d400: '#34D399', d300: '#6EE7B7' } // prettier-ignore
const SLATE: Hue = { l50: '#F8FAFC', l200: '#E2E8F0', l600: '#475569', d500: '#64748B', d400: '#94A3B8', d300: '#CBD5E1' } // prettier-ignore
const BLUE: Hue = { l50: '#EFF6FF', l200: '#BFDBFE', l600: '#2563EB', d500: '#3B82F6', d400: '#60A5FA', d300: '#93C5FD' } // prettier-ignore
const ROSE: Hue = { l50: '#FFF1F2', l200: '#FECDD3', l600: '#E11D48', d500: '#F43F5E', d400: '#FB7185', d300: '#FDA4AF' } // prettier-ignore
const TEAL: Hue = { l50: '#F0FDFA', l200: '#99F6E4', l600: '#0D9488', d500: '#14B8A6', d400: '#2DD4BF', d300: '#5EEAD4' } // prettier-ignore
const VIOLET: Hue = { l50: '#F5F3FF', l200: '#DDD6FE', l600: '#7C3AED', d500: '#8B5CF6', d400: '#A78BFA', d300: '#C4B5FD' } // prettier-ignore
const ORANGE: Hue = { l50: '#FFF7ED', l200: '#FED7AA', l600: '#EA580C', d500: '#F97316', d400: '#FB923C', d300: '#FDBA74' } // prettier-ignore
const CYAN: Hue = { l50: '#ECFEFF', l200: '#A5F3FC', l600: '#0891B2', d500: '#06B6D4', d400: '#22D3EE', d300: '#67E8F9' } // prettier-ignore
const ZINC: Hue = { l50: '#FAFAFA', l200: '#E4E4E7', l600: '#52525B', d500: '#71717A', d400: '#A1A1AA', d300: '#D4D4D8' } // prettier-ignore
const SKY: Hue = { l50: '#F0F9FF', l200: '#BAE6FD', l600: '#0284C7', d500: '#0EA5E9', d400: '#38BDF8', d300: '#7DD3FC' } // prettier-ignore
const FUCHSIA: Hue = { l50: '#FDF4FF', l200: '#F5D0FE', l600: '#C026D3', d500: '#D946EF', d400: '#E879F9', d300: '#F0ABFC' } // prettier-ignore
const YELLOW: Hue = { l50: '#FEFCE8', l200: '#FEF08A', l600: '#A16207', d500: '#CA8A04', d400: '#EAB308', d300: '#FACC15' } // prettier-ignore
const LIME: Hue = { l50: '#F7FEE7', l200: '#D9F99D', l600: '#65A30D', d500: '#84CC16', d400: '#A3E635', d300: '#BEF264' } // prettier-ignore
const STONE: Hue = { l50: '#FAFAF9', l200: '#E7E5E4', l600: '#57534E', d500: '#78716C', d400: '#A8A29E', d300: '#D6D3D1' } // prettier-ignore

// ── "Ink & Pigment" swatches ─────────────────────────────────────────────
// Hand-mixed muted pigments, not Tailwind's semantic ramps: ~35% less chroma,
// accents deepened toward 700, surface tints pulled almost to white so the hue
// is a whisper. The four share a *value* (all mid-deep, all desaturated) so
// they read as one curated set instead of a rainbow. Brass keeps the
// gold/gavel association for Trial without the school-bus yellow.
const IRIS: Hue = { l50: '#F3F3F8', l200: '#E0E0EC', l600: '#4B4E8C', d500: '#6365A0', d400: '#8284B8', d300: '#A6A8D6' } // prettier-ignore
const BRASS: Hue = { l50: '#F7F4EC', l200: '#E9E1CE', l600: '#8C6E33', d500: '#A88C4E', d400: '#C2A668', d300: '#D9BE86' } // prettier-ignore
const SAGE: Hue = { l50: '#F0F5F2', l200: '#D6E3DC', l600: '#3F7059', d500: '#549177', d400: '#6FAA90', d300: '#8FC2AC' } // prettier-ignore
const TAUPE: Hue = { l50: '#F6F5F3', l200: '#E6E3DE', l600: '#5C5852', d500: '#827D73', d400: '#A39E94', d300: '#C4BFB6' } // prettier-ignore

// ── "Jewel" swatches ─────────────────────────────────────────────────────
// The middle ground between `default` (cartoonish, electric Tailwind ramps)
// and `ink` (too desaturated). Real, vivid colour — but *deep*: jewel tones,
// not crayon. Accents sit a touch richer/darker than the Tailwind 600s with
// higher-chroma surface tints, so each hue stays unmistakably itself while the
// trio reads as a curated family. Keeps the semantics: gold = verdict, jade =
// consensus, sapphire = the neutral-but-confident parallel.
const SAPPHIRE: Hue = { l50: '#EEF1FC', l200: '#C9D2F6', l600: '#3A4DCB', d500: '#6172E6', d400: '#8294F0', d300: '#A8B4F5' } // prettier-ignore
const GOLD: Hue =     { l50: '#FDF6E8', l200: '#F6DFA8', l600: '#C77D14', d500: '#D2962A', d400: '#E8AE3E', d300: '#F2C261' } // prettier-ignore
const JADE: Hue =     { l50: '#E8F8F1', l200: '#A9E8CD', l600: '#0E9E6E', d500: '#13A877', d400: '#2FC78E', d300: '#5DD9A8' } // prettier-ignore
const GRAPHITE: Hue = { l50: '#F4F5F7', l200: '#DCE0E6', l600: '#4B5563', d500: '#727B89', d400: '#9BA3B0', d300: '#C2C8D2' } // prettier-ignore

// ── "Atelier" swatches ───────────────────────────────────────────────────
// A deliberate departure from the blue/amber/green hue *positions* shared by
// `default`, `jewel` and the Tailwind sets. Warm + warm + cool, editorial and
// fashion-house: terracotta clay leads, a regal plum carries the verdict, a
// cool petrol-teal grounds consensus. Well-separated on the wheel so the three
// stay distinguishable; saturated mid-tones (neither electric nor muddy).
const TERRACOTTA: Hue = { l50: '#FAF0EB', l200: '#F0CBB8', l600: '#BD5D3A', d500: '#C96845', d400: '#DD8261', d300: '#E8A085' } // prettier-ignore
const PLUM: Hue =       { l50: '#F6EFF5', l200: '#E2C6DD', l600: '#834D7C', d500: '#9D6695', d400: '#B884B0', d300: '#D2A6CB' } // prettier-ignore
const PETROL: Hue =     { l50: '#E9F5F4', l200: '#A9DDDA', l600: '#1A7E77', d500: '#1F938B', d400: '#34B0A6', d300: '#62CCC2' } // prettier-ignore
const GREIGE: Hue =     { l50: '#F5F4F1', l200: '#E2DED7', l600: '#5A554D', d500: '#7C766C', d400: '#A39D92', d300: '#C8C2B6' } // prettier-ignore

// ── "Studio" swatches ────────────────────────────────────────────────────
// Bright / clean / modern. Saturated, confident accents that read as vivid
// *solid* fills (the icon-chips) while still clearing AA as text on their pale
// `l50` tint. Cobalt leads, a raspberry-coral carries the verdict, a bright
// teal grounds consensus — high-energy but not neon, and built for flat fills
// (no gradients) on a crisp cool-white base.
const COBALT: Hue = { l50: '#EEF0FE', l200: '#C8CEFB', l600: '#3D4EE0', d500: '#5B6BF0', d400: '#8492F6', d300: '#AEB8FA' } // prettier-ignore
const CORAL: Hue =  { l50: '#FFF0F5', l200: '#FBC7D9', l600: '#E11D5B', d500: '#F43F7A', d400: '#FB7099', d300: '#FDA3BC' } // prettier-ignore
const VERD: Hue =   { l50: '#E6FAF6', l200: '#9CEADD', l600: '#0E9F8F', d500: '#14BAA6', d400: '#2FD4BE', d300: '#5FE6D2' } // prettier-ignore

// ── Palettes: each maps the structures to hues. ──────────────────────────
const PALETTES = {
  // Parallel = violet, Trial = rose, Consensus = teal, Custom = slate.
  modern: { roundtable: VIOLET, trial: ROSE, consensus: TEAL, custom: SLATE },
  // Parallel = indigo, Trial = amber, Consensus = emerald, Custom = slate.
  default: { roundtable: INDIGO, trial: AMBER, consensus: EMERALD, custom: SLATE },
  // Cooler, calmer.
  cool: { roundtable: BLUE, trial: ROSE, consensus: TEAL, custom: SLATE },
  // Punchier, higher-chroma.
  vivid: { roundtable: VIOLET, trial: ORANGE, consensus: CYAN, custom: ZINC },
  // Brighter, more playful.
  playful: { roundtable: SKY, trial: FUCHSIA, consensus: LIME, custom: STONE },
  // "Ink & Pigment" — muted, editorial pigments (the high-end / minimalist
  // route). Parallel = iris, Trial = brass, Consensus = sage, Custom = taupe.
  ink: { roundtable: IRIS, trial: BRASS, consensus: SAGE, custom: TAUPE },
  // "Jewel" — vivid but deep; the colourful-yet-refined middle ground.
  // Parallel = sapphire, Trial = gold, Consensus = jade, Custom = graphite.
  jewel: { roundtable: SAPPHIRE, trial: GOLD, consensus: JADE, custom: GRAPHITE },
  // "Atelier" — warm editorial departure from the blue/amber/green family.
  // Parallel = terracotta, Trial = plum, Consensus = petrol, Custom = greige.
  atelier: { roundtable: TERRACOTTA, trial: PLUM, consensus: PETROL, custom: GREIGE },
  // "Studio" — bright / clean / modern; vivid solid fills on flat surfaces.
  // Parallel = cobalt, Trial = coral, Consensus = teal, Custom = slate.
  studio: { roundtable: COBALT, trial: CORAL, consensus: VERD, custom: SLATE },

  // ── Gradient sets ──────────────────────────────────────────────────────
  // The "Roundtable-AI" direction: the icon-chips wear a bright two-stop
  // linear gradient. Each reuses a base hue for its tint/accent and attaches
  // `gradLight` / `gradDark` chip-fill stops. White cards, gradient chips.

  // "Vibrant" — distinct bright gradient per type. Trial is **gold** (the
  // yellow ramp, matching the in-chat Voting + Judge gold) — "verdict / the
  // prize", warm and clearly apart from the cool blue Parallel + teal Consensus
  // pills; it replaced a bright pink that read as an error/alert state on the
  // highlighted council card. Each gradient travels deep→bright so it reads as
  // a gradient on the chip, not a flat fill.
  vibrant: {
    roundtable: { ...BLUE, gradLight: ['#4338CA', '#38BDF8'], gradDark: ['#6366F1', '#7DD3FC'] },
    trial: { ...YELLOW, gradLight: ['#A16207', '#FACC15'], gradDark: ['#A16207', '#FACC15'] },
    consensus: { ...TEAL, gradLight: ['#0D9488', '#4ADE80'], gradDark: ['#2DD4BF', '#86EFAC'] },
    custom: { ...SLATE, gradLight: ['#64748B', '#475569'], gradDark: ['#94A3B8', '#64748B'] },
  },
  // "Aurora" — cooler, all in the cyan→blue→violet→green band.
  aurora: {
    roundtable: { ...CYAN, gradLight: ['#22D3EE', '#3B82F6'], gradDark: ['#67E8F9', '#60A5FA'] },
    trial: { ...VIOLET, gradLight: ['#6366F1', '#A855F7'], gradDark: ['#818CF8', '#C084FC'] },
    consensus: { ...TEAL, gradLight: ['#14B8A6', '#22C55E'], gradDark: ['#2DD4BF', '#4ADE80'] },
    custom: { ...SLATE, gradLight: ['#64748B', '#475569'], gradDark: ['#94A3B8', '#64748B'] },
  },
  // "Sunset" — bright with a warm pop on the verdict (fuchsia→rose).
  sunset: {
    roundtable: { ...INDIGO, gradLight: ['#6366F1', '#3B82F6'], gradDark: ['#818CF8', '#60A5FA'] },
    trial: { ...FUCHSIA, gradLight: ['#D946EF', '#FB7185'], gradDark: ['#E879F9', '#FDA4AF'] },
    consensus: { ...EMERALD, gradLight: ['#10B981', '#84CC16'], gradDark: ['#34D399', '#A3E635'] },
    custom: { ...SLATE, gradLight: ['#64748B', '#475569'], gradDark: ['#94A3B8', '#64748B'] },
  },
} satisfies Record<string, Record<SocialStructure, Hue>>

/**
 * ⟵ Change this one line to try a different palette. Gradient chips:
 *    `'vibrant'` | `'aurora'` | `'sunset'`. Flat fills: `'studio'` |
 *    `'atelier'` | `'jewel'` | `'ink'` | `'modern'` | `'default'` | `'cool'` |
 *    `'vivid'` | `'playful'`.
 */
const ACTIVE_PALETTE: keyof typeof PALETTES = 'vibrant'

const activeHues = PALETTES[ACTIVE_PALETTE]

const SOCIAL_STRUCTURE_COLORS: Record<
  SocialStructure,
  StructureColorTheme
> = {
  roundtable: buildTheme(activeHues.roundtable),
  trial: buildTheme(activeHues.trial),
  consensus: buildTheme(activeHues.consensus),
  custom: buildTheme(activeHues.custom),
}

/**
 * Resolve a structure's colour set for the active theme. Read `isDark` from
 * Base Web's `theme.name === 'dark-theme'` at the call site — the app
 * supports a *forced* dark mode, so `prefers-color-scheme` alone isn't
 * enough to know which variant to use.
 */
export function structureColorSet(
  id: SocialStructure,
  isDark: boolean,
): StructureColorSet {
  // Total even off the declared union: persisted rows can carry ids from
  // older builds (the type lies about IndexedDB data — see
  // `normalizeSocialStructure`), and a colour lookup must never be what
  // crashes a render. Unknown ids wear the neutral `custom` set.
  const set: StructureColorTheme | undefined = SOCIAL_STRUCTURE_COLORS[id]
  const resolved = set ?? SOCIAL_STRUCTURE_COLORS.custom
  return isDark ? resolved.dark : resolved.light
}
