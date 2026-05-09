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
    })

    expect(config).toEqual({
      integrationMode: 'cms',
      enabled: true,
      basePath: '/pagebuilder',
      cmsBaseUrl: 'https://cms.example.com/manager',
      integrationSecret: 'secret-value',
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

  test('write interfaces reject missing CMS mode configuration with structured errors', () => {
    expect(() => assertCmsIntegrationModeEnabled(resolveCmsIntegrationConfig({}))).toThrow(CmsIntegrationError)
    expect(() => assertCmsIntegrationSecretConfigured(resolveCmsIntegrationConfig({
      AI_PAGE_BUILDER_INTEGRATION_MODE: 'cms',
    }))).toThrow(CmsIntegrationError)
  })
})
