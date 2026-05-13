import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'
import { cmsIntegrationUnauthorized } from './cms-integration-errors'

export type CmsIntegrationMode = 'standalone' | 'cms'

export interface CmsIntegrationConfig {
  integrationMode: CmsIntegrationMode
  enabled: boolean
  basePath: string
  cmsBaseUrl: string | null
  integrationSecret: string | null
  publicOrigin: string | null
  handoffTtlMs: number
  accessSessionTtlMs: number
}

export interface CmsIntegrationStatus {
  integrationMode: CmsIntegrationMode
  enabled: boolean
  supportedOpenModes?: Array<'iframe' | 'window'>
  basePath?: string
}

type CmsIntegrationEnv = Record<string, string | undefined>

const DEFAULT_HANDOFF_TTL_MS = 2 * 60 * 1000
const DEFAULT_ACCESS_SESSION_TTL_MS = 72 * 60 * 60 * 1000

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

function normalizePublicOrigin(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    if (url.pathname !== '/' || url.search || url.hash) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

function readOptionalPositiveInteger(value: string | undefined, defaultValue: number): number {
  const raw = value?.trim()
  if (!raw) return defaultValue

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue
  }

  return parsed
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
    publicOrigin: normalizePublicOrigin(env.AI_PAGE_BUILDER_PUBLIC_ORIGIN),
    handoffTtlMs: readOptionalPositiveInteger(env.AI_PAGE_BUILDER_HANDOFF_TTL_MS, DEFAULT_HANDOFF_TTL_MS),
    accessSessionTtlMs: readOptionalPositiveInteger(
      env.AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS,
      DEFAULT_ACCESS_SESSION_TTL_MS,
    ),
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
