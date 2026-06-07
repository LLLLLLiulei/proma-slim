import { IMAGE_PROVIDERS } from './types'
import type { ImageProvider, ImageSearchProviderConfig, ProviderSecretConfig } from './types'

type EnvSource = Pick<NodeJS.ProcessEnv, string>

const DEFAULT_ENABLED_IMAGE_SEARCH_PROVIDERS: ImageProvider[] = ['pexels', 'pixabay']

function readFirstEnv(env: EnvSource, keys: string[]): { value?: string; source?: string } {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) {
      return { value, source: key }
    }
  }
  return {}
}

function createSecretConfig(value?: string, source?: string): ProviderSecretConfig {
  return {
    apiKey: value,
    source,
    configured: Boolean(value),
    toJSON() {
      return {
        configured: Boolean(value),
        ...(source ? { source } : {}),
        ...(value ? { apiKey: '[configured]' as const } : {}),
      }
    },
  }
}

export function resolveEnabledImageSearchProviders(env: EnvSource = process.env): ImageProvider[] {
  const raw = env.IMAGE_SEARCH_PROVIDERS?.trim()
  if (!raw) return [...DEFAULT_ENABLED_IMAGE_SEARCH_PROVIDERS]

  const enabled = new Set<ImageProvider>()
  for (const value of raw.split(/[,\s]+/)) {
    const provider = value.trim().toLowerCase()
    if ((IMAGE_PROVIDERS as readonly string[]).includes(provider)) {
      enabled.add(provider as ImageProvider)
    }
  }

  return enabled.size > 0 ? [...enabled] : [...DEFAULT_ENABLED_IMAGE_SEARCH_PROVIDERS]
}

export function resolveImageSearchProviderConfig(env: EnvSource = process.env): ImageSearchProviderConfig {
  const pexels = readFirstEnv(env, ['PEXELS_API_KEY'])
  const pixabay = readFirstEnv(env, ['PIXABAY_API_KEY'])
  const unsplash = readFirstEnv(env, ['UNSPLASH_ACCESS_KEY'])

  return {
    enabledProviders: resolveEnabledImageSearchProviders(env),
    pexels: createSecretConfig(pexels.value, pexels.source),
    pixabay: createSecretConfig(pixabay.value, pixabay.source),
    unsplash: createSecretConfig(unsplash.value, unsplash.source),
  }
}
