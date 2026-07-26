/**
 * Mirror of `src/utils/slug.ts`, for build-time use.
 *
 * A `.mjs` build script can't import a `.ts` module, so the app and the
 * prerender each need their own copy of this function — and the slugs they
 * produce must be identical, or the build emits `dist/demo/<slug>.html` at a
 * URL the app resolves to nothing. `tests/unit/utils/slug.test.ts` imports
 * both and asserts they agree, including on the titles that actually ship.
 *
 * Kept in its own module with **no imports and no side effects** so the test
 * can load it in a jsdom environment; `seo-routes.mjs` reads files at import
 * time and can't be imported from a test.
 */

/** Longest slug we emit — keeps URLs readable when a title runs long. */
const MAX_LENGTH = 80

export function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '')
}
