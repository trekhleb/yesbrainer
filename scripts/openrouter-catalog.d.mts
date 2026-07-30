export const MAX_CATALOG_MODELS: number

export interface OpenRouterCatalogModel {
  id: string
  name?: string | null
  pricing?: { prompt?: number | string | null } | null
  architecture?: { input_modalities?: string[] | null } | null
  supported_parameters?: string[] | null
  context_length?: number | string | null
  top_provider?: { context_length?: number | string | null } | null
}

export type OpenRouterCatalogResult =
  | {
      ok: true
      models: OpenRouterCatalogModel[]
      rejectedIndexes: number[]
    }
  | { ok: false; error: string }

export function parseOpenRouterCatalog(
  payload: unknown,
): OpenRouterCatalogResult

export function quoteTsString(value: unknown): string

export function normalizeContextWindow(value: unknown): number

export function compareCatalogEntries(
  a: { label: string; providerModelId: string },
  b: { label: string; providerModelId: string },
): number
