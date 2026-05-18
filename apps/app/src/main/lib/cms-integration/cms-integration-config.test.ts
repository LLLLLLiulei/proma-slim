import { describe, expect, test } from 'bun:test'
import {
  assertCmsIntegrationModeEnabled,
  assertCmsIntegrationSecretConfigured,
  buildCmsIntegrationStatus,
  resolveCmsIntegrationConfig,
} from './cms-integration-config'
import { CmsIntegrationError } from './cms-integration-errors'

describe('cms integration config', () => {
  test('defaults to standalone without requiring CMS integration settings', () => {
    const config = resolveCmsIntegrationConfig({})

    expect(config).toEqual({
      integrationMode: 'standalone',
      enabled: false,
      basePath: '',
      cmsBaseUrl: null,
      integrationSecret: null,
      publicOrigin: null,
      handoffTtlMs: 120000,
      accessSessionTtlMs: 28800000,
      accessSessionRenewThresholdMs: 3600000,
      syncExportTimeoutMs: 0,
    })
    expect(buildCmsIntegrationStatus(config)).toEqual({
      integrationMode: 'standalone',
      enabled: false,
    })
  })

  test('resolves CMS mode status without exposing secret or baseUrl health details', () => {
    const config = resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
      AI_PAGE_BUILDER_INTEGRATION_SECRET: 'secret-value',
      AI_PAGE_BUILDER_CMS_BASE_URL: 'https://cms.example.com/manager/',
      AI_PAGE_BUILDER_BASE_PATH: '/pagebuilder/',
      AI_PAGE_BUILDER_PUBLIC_ORIGIN: 'https://builder.example.com/',
      AI_PAGE_BUILDER_HANDOFF_TTL_MS: '300000',
      AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: '86400000',
      AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: '600000',
      AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: '45000',
    })

    expect(config).toEqual({
      integrationMode: 'cms',
      enabled: true,
      basePath: '/pagebuilder',
      cmsBaseUrl: 'https://cms.example.com/manager',
      integrationSecret: 'secret-value',
      publicOrigin: 'https://builder.example.com',
      handoffTtlMs: 300000,
      accessSessionTtlMs: 86400000,
      accessSessionRenewThresholdMs: 600000,
      syncExportTimeoutMs: 45000,
    })
    expect(buildCmsIntegrationStatus(config)).toEqual({
      integrationMode: 'cms',
      enabled: true,
      supportedOpenModes: ['iframe', 'window'],
      basePath: '/pagebuilder',
    })
  })

  test('status remains enabled when CMS baseUrl is missing or invalid', () => {
    const missing = resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
      AI_PAGE_BUILDER_INTEGRATION_SECRET: 'secret-value',
      AI_PAGE_BUILDER_BASE_PATH: '/pagebuilder',
    })
    const invalid = resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
      AI_PAGE_BUILDER_INTEGRATION_SECRET: 'secret-value',
      AI_PAGE_BUILDER_CMS_BASE_URL: 'not a url',
      AI_PAGE_BUILDER_BASE_PATH: '/pagebuilder',
    })

    expect(buildCmsIntegrationStatus(missing)).toEqual({
      integrationMode: 'cms',
      enabled: true,
      supportedOpenModes: ['iframe', 'window'],
      basePath: '/pagebuilder',
    })
    expect(buildCmsIntegrationStatus(invalid)).toEqual({
      integrationMode: 'cms',
      enabled: true,
      supportedOpenModes: ['iframe', 'window'],
      basePath: '/pagebuilder',
    })
  })

  test('parses missing public origin and ttl overrides as null and defaults', () => {
    const config = resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
      AI_PAGE_BUILDER_INTEGRATION_SECRET: 'secret-value',
      AI_PAGE_BUILDER_CMS_BASE_URL: 'https://cms.example.com/manager',
      AI_PAGE_BUILDER_BASE_PATH: '/',
      AI_PAGE_BUILDER_PUBLIC_ORIGIN: '   ',
      AI_PAGE_BUILDER_HANDOFF_TTL_MS: '',
      AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: 'not-a-number',
      AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: '-1',
      AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: 'not-a-number',
    })

    expect(config).toEqual({
      integrationMode: 'cms',
      enabled: true,
      basePath: '',
      cmsBaseUrl: 'https://cms.example.com/manager',
      integrationSecret: 'secret-value',
      publicOrigin: null,
      handoffTtlMs: 120000,
      accessSessionTtlMs: 28800000,
      accessSessionRenewThresholdMs: 3600000,
      syncExportTimeoutMs: 0,
    })
  })

  test('rejects public origin values that include path query or hash', () => {
    const config = resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
      AI_PAGE_BUILDER_INTEGRATION_SECRET: 'secret-value',
      AI_PAGE_BUILDER_CMS_BASE_URL: 'https://cms.example.com/manager',
      AI_PAGE_BUILDER_PUBLIC_ORIGIN: 'https://builder.example.com/pagebuilder',
    })

    expect(config.publicOrigin).toBeNull()
  })

  test('write interfaces reject missing CMS mode configuration with structured errors', () => {
    expect(() => assertCmsIntegrationModeEnabled(resolveCmsIntegrationConfig({}))).toThrow(CmsIntegrationError)
    expect(() => assertCmsIntegrationSecretConfigured(resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
    }))).toThrow(CmsIntegrationError)
  })
})
