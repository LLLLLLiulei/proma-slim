import type { ImageProviderAdapter, ImageSearchProviderConfig } from './types'
import { IMAGE_PROVIDERS } from './types'
import { searchBingImages } from './providers/bing'
import { searchPexelsImages } from './providers/pexels'
import { searchPixabayImages } from './providers/pixabay'
import { searchUnsplashImages } from './providers/unsplash'

export function createImageProviderRegistry(): ImageProviderAdapter[] {
  return [
    {
      provider: 'pexels',
      requiresApiKey: true,
      nativeEnvKey: 'PEXELS_API_KEY',
      search: searchPexelsImages,
    },
    {
      provider: 'pixabay',
      requiresApiKey: true,
      nativeEnvKey: 'PIXABAY_API_KEY',
      search: searchPixabayImages,
    },
    {
      provider: 'unsplash',
      requiresApiKey: true,
      nativeEnvKey: 'UNSPLASH_ACCESS_KEY',
      search: searchUnsplashImages,
    },
    {
      provider: 'bing',
      requiresApiKey: false,
      search: searchBingImages,
    },
  ]
}

export function isProviderConfigured(provider: ImageProviderAdapter, config: ImageSearchProviderConfig): boolean {
  if (!config.enabledProviders.includes(provider.provider)) return false
  if (!provider.requiresApiKey) return true
  if (provider.provider === 'pexels') return config.pexels.configured
  if (provider.provider === 'pixabay') return config.pixabay.configured
  if (provider.provider === 'unsplash') return config.unsplash.configured
  return IMAGE_PROVIDERS.includes(provider.provider)
}
