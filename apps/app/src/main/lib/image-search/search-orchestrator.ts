import { logImageSearchInfo, logImageSearchWarn, serializeImageSearchLogError } from './logging'
import { resolveImageSearchProviderConfig } from './config'
import { createImageProviderRegistry, isProviderConfigured } from './provider-registry'
import { rankResults } from './ranking'
import type {
  FetchLike,
  ImageOrientation,
  ImageResult,
  ImageSearchLogger,
  ImageSearchProviderConfig,
  ProviderDiagnostics,
  ProviderSearchContext,
} from './types'
import { DEFAULT_IMAGE_COUNT, IMAGE_PROVIDERS, REQUEST_TIMEOUT } from './types'

export interface SearchImagesRequest {
  query: string
  count?: number
  orientation?: ImageOrientation
}

export interface SearchImagesOptions {
  fetchFn?: FetchLike
  env?: NodeJS.ProcessEnv
  config?: ImageSearchProviderConfig
  timeoutMs?: number
  logger?: ImageSearchLogger
}

export interface SearchImagesResult {
  results: ImageResult[]
  diagnostics: ProviderDiagnostics
}

function createDiagnostics(): ProviderDiagnostics {
  return Object.fromEntries(
    IMAGE_PROVIDERS.map((provider) => [provider, { status: 'skipped', count: 0 }]),
  ) as ProviderDiagnostics
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function providerMissingMessage(provider: string, nativeEnvKey?: string): string {
  if (provider === 'pexels') return 'PEXELS_API_KEY not configured'
  if (provider === 'pixabay') return 'PIXABAY_API_KEY not configured'
  if (provider === 'unsplash') return 'UNSPLASH_ACCESS_KEY not configured'
  return `${nativeEnvKey || provider} not configured`
}

export async function searchImagesAcrossProviders(
  request: SearchImagesRequest,
  options: SearchImagesOptions = {},
): Promise<SearchImagesResult> {
  const count = request.count ?? DEFAULT_IMAGE_COUNT
  const diagnostics = createDiagnostics()
  const config = options.config ?? resolveImageSearchProviderConfig(options.env ?? process.env)
  const context: ProviderSearchContext = {
    fetchFn: options.fetchFn ?? fetch,
    config,
    timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT,
    logger: options.logger,
  }

  const tasks: Array<Promise<{ provider: keyof ProviderDiagnostics; results: ImageResult[]; error?: never } | { provider: keyof ProviderDiagnostics; results?: never; error: unknown }>> = []
  for (const provider of createImageProviderRegistry()) {
    if (!config.enabledProviders.includes(provider.provider)) {
      diagnostics[provider.provider] = {
        status: 'skipped',
        count: 0,
        error: 'provider disabled by IMAGE_SEARCH_PROVIDERS',
      }
      logImageSearchInfo(options.logger, 'provider_search_skipped', {
        provider: provider.provider,
        reason: diagnostics[provider.provider].error,
        query: request.query,
      })
      continue
    }

    if (!isProviderConfigured(provider, config)) {
      diagnostics[provider.provider] = {
        status: 'skipped',
        count: 0,
        error: providerMissingMessage(provider.provider, provider.nativeEnvKey),
      }
      logImageSearchInfo(options.logger, 'provider_search_skipped', {
        provider: provider.provider,
        reason: diagnostics[provider.provider].error,
        query: request.query,
      })
      continue
    }

    const providerCount = provider.provider === 'bing' ? Math.max(count * 2, count) : count
    logImageSearchInfo(options.logger, 'provider_search_start', {
      provider: provider.provider,
      query: request.query,
      count: providerCount,
      orientation: request.orientation ?? null,
    })
    tasks.push(provider.search(request.query, providerCount, request.orientation, context)
      .then((results) => ({ provider: provider.provider, results }))
      .catch((error: unknown) => ({ provider: provider.provider, error })))
  }

  const completed = await Promise.all(tasks)
  const merged: ImageResult[] = []
  for (const result of completed) {
    if (!('error' in result)) {
      diagnostics[result.provider] = {
        status: 'ok',
        count: result.results.length,
      }
      logImageSearchInfo(options.logger, 'provider_search_success', {
        provider: result.provider,
        resultCount: result.results.length,
        results: result.results,
      })
      merged.push(...result.results)
      continue
    }

    const message = toErrorMessage(result.error)
    diagnostics[result.provider] = {
      status: 'error',
      count: 0,
      error: message,
    }
    logImageSearchWarn(options.logger, 'provider_search_error', {
      provider: result.provider,
      error: serializeImageSearchLogError(result.error),
    })
  }

  const rankedResults = rankResults(merged, request.query, count, request.orientation)
  logImageSearchInfo(options.logger, 'ranking_completed', {
    query: request.query,
    requestedCount: count,
    mergedCount: merged.length,
    rankedCount: rankedResults.length,
    mergedProviderCounts: countResultsByProvider(merged),
    rankedProviderCounts: countResultsByProvider(rankedResults),
    results: rankedResults,
  })

  return {
    results: rankedResults,
    diagnostics,
  }
}

function countResultsByProvider(results: ImageResult[]): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => {
    counts[result.provider] = (counts[result.provider] ?? 0) + 1
    return counts
  }, {})
}
