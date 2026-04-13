import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'

const originalConfigDir = process.env.PROMA_CONFIG_DIR

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PROMA_CONFIG_DIR
  } else {
    process.env.PROMA_CONFIG_DIR = originalConfigDir
  }
})

describe('resolvePageBuilderCmsConfig', () => {
  test('reads cms config from cms-settings.json when env vars are absent', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'proma-cms-config-'))
    process.env.PROMA_CONFIG_DIR = configDir
    writeFileSync(join(configDir, 'cms-settings.json'), JSON.stringify({
      baseUrl: 'https://demo.zving.com/manager/',
      siteID: 277,
      username: 'file-user',
      password: 'file-pass',
    }), 'utf-8')

    try {
      const config = resolvePageBuilderCmsConfig({})

      expect(config).toEqual({
        baseUrl: 'https://demo.zving.com/manager',
        siteID: '277',
        username: 'file-user',
        password: 'file-pass',
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  test('prefers explicit env vars over cms-settings.json values', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'proma-cms-config-'))
    process.env.PROMA_CONFIG_DIR = configDir
    writeFileSync(join(configDir, 'cms-settings.json'), JSON.stringify({
      baseUrl: 'https://file.example.com/manager',
      siteID: 111,
      username: 'file-user',
      password: 'file-pass',
    }), 'utf-8')

    try {
      const config = resolvePageBuilderCmsConfig({
        PROMA_CMS_BASE_URL: 'https://demo.zving.com/manager/',
        PROMA_CMS_SITE_ID: '277',
        PROMA_CMS_USERNAME: 'env-user',
        PROMA_CMS_PASSWORD: 'env-pass',
      })

      expect(config).toEqual({
        baseUrl: 'https://demo.zving.com/manager',
        siteID: '277',
        username: 'env-user',
        password: 'env-pass',
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  test('defaults siteID to 1 when it is omitted', () => {
    const config = resolvePageBuilderCmsConfig({
      PROMA_CMS_BASE_URL: 'https://demo.zving.com/manager/',
      PROMA_CMS_USERNAME: 'env-user',
      PROMA_CMS_PASSWORD: 'env-pass',
    })

    expect(config).toEqual({
      baseUrl: 'https://demo.zving.com/manager',
      siteID: '1',
      username: 'env-user',
      password: 'env-pass',
    })
  })

  test('returns null when required credentials are missing', () => {
    const config = resolvePageBuilderCmsConfig({
      PROMA_CMS_BASE_URL: 'https://demo.zving.com/manager/',
      PROMA_CMS_USERNAME: 'env-user',
    })

    expect(config).toBeNull()
  })

  test('returns null when PROMA_CMS_SITE_ID is invalid', () => {
    const config = resolvePageBuilderCmsConfig({
      PROMA_CMS_BASE_URL: 'https://demo.zving.com/manager/',
      PROMA_CMS_SITE_ID: 'site-a',
      PROMA_CMS_USERNAME: 'env-user',
      PROMA_CMS_PASSWORD: 'env-pass',
    })

    expect(config).toBeNull()
  })

  test('returns null when baseUrl does not include /manager', () => {
    const config = resolvePageBuilderCmsConfig({
      PROMA_CMS_BASE_URL: 'https://demo.zving.com',
      PROMA_CMS_USERNAME: 'env-user',
      PROMA_CMS_PASSWORD: 'env-pass',
    })

    expect(config).toBeNull()
  })
})
