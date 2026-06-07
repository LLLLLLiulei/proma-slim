export const DEFAULT_IMAGE_COUNT = 5
export const MIN_IMAGE_SIZE = 200
export const MAX_RETRIES = 3
export const REQUEST_TIMEOUT = 10_000
export const DOWNLOAD_TIMEOUT = 10_000
export const DIMENSION_TIMEOUT = 5_000
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export const IMAGE_PROVIDERS = ['pexels', 'pixabay', 'unsplash', 'bing'] as const

export type ImageProvider = typeof IMAGE_PROVIDERS[number]
export type ImageOrientation = 'landscape' | 'portrait' | 'squarish'

export interface ImageResult {
  id?: string
  provider: ImageProvider
  title?: string
  description?: string
  tags?: string[]
  width: number
  height: number
  downloadUrl: string
  url: string
  previewUrl?: string
  thumbnailUrl?: string
  sourcePage: string
  author?: string
  authorUrl?: string
  authorId?: string
  authorAvatarUrl?: string
  licenseName?: string
  licenseUrl?: string
  attributionRequired?: boolean
  attributionText?: string
  dominantColor?: string
  temporaryUrl?: boolean
  downloadTrackingUrl?: string
  raw?: unknown
}

export interface DownloadedImage {
  downloadUrl: string
  provider: ImageProvider
  width: number
  height: number
  sourcePage: string
  author?: string
  licenseName?: string
  licenseUrl?: string
  attributionText?: string
}

export interface ImportedImageResult extends DownloadedImage {
  assetFileName: string
  assetRelativePath: string
  assetPreviewPath: string
}

export interface FailedDownload {
  downloadUrl: string
  provider: ImageProvider
  sourcePage: string
  error: string
}

export interface ImportImagesResult {
  imported: ImportedImageResult[]
  failed: FailedDownload[]
}

export type ProviderStatus = 'ok' | 'skipped' | 'error'

export interface ProviderDiagnostic {
  status: ProviderStatus
  count: number
  error?: string
}

export type ProviderDiagnostics = Record<ImageProvider, ProviderDiagnostic>

export type FetchLike = typeof fetch

export interface ImageSearchLogger {
  trace?: (payload?: unknown, message?: string) => void
  debug?: (payload?: unknown, message?: string) => void
  info?: (payload?: unknown, message?: string) => void
  warn?: (payload?: unknown, message?: string) => void
  error?: (payload?: unknown, message?: string) => void
  fatal?: (payload?: unknown, message?: string) => void
}

export interface ProviderSecretConfig {
  apiKey?: string
  source?: string
  configured: boolean
  toJSON: () => {
    configured: boolean
    source?: string
    apiKey?: '[configured]'
  }
}

export interface ImageSearchProviderConfig {
  enabledProviders: ImageProvider[]
  pexels: ProviderSecretConfig
  pixabay: ProviderSecretConfig
  unsplash: ProviderSecretConfig
}

export interface ProviderSearchContext {
  fetchFn: FetchLike
  config: ImageSearchProviderConfig
  timeoutMs: number
  logger?: ImageSearchLogger
}

export interface ImageProviderAdapter {
  provider: ImageProvider
  requiresApiKey: boolean
  nativeEnvKey?: string
  search: (
    query: string,
    count: number,
    orientation: ImageOrientation | undefined,
    context: ProviderSearchContext,
  ) => Promise<ImageResult[]>
}
