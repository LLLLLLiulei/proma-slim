import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'
import { cmsIntegrationUnauthorized } from './cms-integration-errors'

export type CmsIntegrationMode = 'standalone' | 'cms'

export interface CmsIntegrationConfig {
  integrationMode: CmsIntegrationMode
  enabled: boolean
  basePath: string
  cmsBaseUrl: string | null
  integrationSecret: string | null
}

export interface CmsIntegrationStatus {
  integrationMode: CmsIntegrationMode
  enabled: boolean
  supportedOpenModes?: Array<'iframe' | 'window'>
  basePath?: string
}

type CmsIntegrationEnv = Record<string, string | undefined>

function normalizeIntegrationMode(value: string | undefined): CmsIntegrationMode {
  return value?.trim().toLowerCase() === 'cms' ? 'cms' : 'standalone'
}

function normalizeCmsBaseUrl(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function resolveCmsIntegrationConfig(env: CmsIntegrationEnv = process.env): CmsIntegrationConfig {
  const integrationMode = normalizeIntegrationMode(env.AI_PAGE_BUILDER_INTEGRATION_MODE)
  const basePath = normalizePageBuilderPublicBasePath(env.AI_PAGE_BUILDER_BASE_PATH)

  return {
    integrationMode,
    enabled: integrationMode === 'cms',
    basePath,
    cmsBaseUrl: normalizeCmsBaseUrl(env.AI_PAGE_BUILDER_CMS_BASE_URL),
    integrationSecret: env.AI_PAGE_BUILDER_INTEGRATION_SECRET?.trim() || null,
  }
}

export function buildCmsIntegrationStatus(config: CmsIntegrationConfig): CmsIntegrationStatus {
  if (!config.enabled) {
    return {
      integrationMode: 'standalone',
      enabled: false,
    }
  }

  return {
    integrationMode: 'cms',
    enabled: true,
    supportedOpenModes: ['iframe', 'window'],
    basePath: config.basePath,
  }
}

export function assertCmsIntegrationModeEnabled(config: CmsIntegrationConfig): asserts config is CmsIntegrationConfig & {
  integrationMode: 'cms'
  enabled: true
} {
  if (!config.enabled) {
    throw cmsIntegrationUnauthorized()
  }
}

export function assertCmsIntegrationSecretConfigured(config: CmsIntegrationConfig): asserts config is CmsIntegrationConfig & {
  integrationSecret: string
} {
  if (!config.integrationSecret) {
    throw cmsIntegrationUnauthorized()
  }
}
