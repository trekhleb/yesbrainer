/// <reference types="vite/client" />

// Build-time analytics wiring (see src/analytics/index.ts). Declared so the
// `import.meta.env.VITE_*` reads are `string | undefined` instead of the
// index-signature `any`. Optional on purpose: unset (forks, plain local
// builds) resolves analytics to the no-op provider.
interface ImportMetaEnv {
  readonly VITE_ANALYTICS_ENDPOINT?: string
  readonly VITE_ANALYTICS_WEBSITE_ID?: string
}
