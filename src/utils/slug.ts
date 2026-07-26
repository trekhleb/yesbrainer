/**
 * Title → URL slug.
 *
 * Used to give each seeded demo council a stable, readable public URL
 * (`/demo/:slug`) derived from its title, so the demos are addressable
 * without exposing the per-device council UUID — which is local state, not a
 * public identifier, and differs between browsers.
 *
 * `scripts/slugify.mjs` mirrors this so the build-time prerender emits the
 * same paths (a `.mjs` build script can't import a `.ts` module). The two
 * must agree or a prerendered file would answer at a URL the app doesn't
 * resolve; `tests/unit/utils/slug.test.ts` asserts the parity, over the demo
 * titles that actually ship.
 */

/** Longest slug we emit — keeps URLs readable when a title runs long. */
const MAX_LENGTH = 80

export function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      // Strip combining marks left by the decomposition above, so "café"
      // becomes "cafe" rather than "caf".
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Everything that isn't a-z0-9 collapses to a single hyphen — including
      // the curly punctuation the app's own titles are full of.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_LENGTH)
      // A trailing hyphen can reappear after the slice.
      .replace(/-+$/g, '')
  )
}
