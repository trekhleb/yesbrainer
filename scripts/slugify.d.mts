/**
 * Types for `slugify.mjs`, so the parity test in
 * `tests/unit/utils/slug.test.ts` can import the build-side copy without
 * falling back to `any` (which the strict type-coverage gate would count).
 */
export function slugify(value: string): string
