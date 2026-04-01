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
      baseUrl: 'https://demo.zving.com/zcmstest/',
      cookie: 'ZUSID=1aMDGZ9PQvCDxgBf4xB9kw; CurrentSite=277',
    }), 'utf-8')

    try {
      const config = resolvePageBuilderCmsConfig({})

      expect(config).toMatchObject({
        baseUrl: 'https://demo.zving.com/zcmstest',
        zusid: '1aMDGZ9PQvCDxgBf4xB9kw',
        currentSite: '277',
        cookie: 'ZUSID=1aMDGZ9PQvCDxgBf4xB9kw; CurrentSite=277',
      })
      expect(config?.headers.Referer).toBe('https://demo.zving.com/zcmstest/app.html')
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  test('prefers explicit env vars over cms-settings.json values', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'proma-cms-config-'))
    process.env.PROMA_CONFIG_DIR = configDir
    writeFileSync(join(configDir, 'cms-settings.json'), JSON.stringify({
      baseUrl: 'https://file.example.com/cms',
      zusid: 'file-zusid',
      currentSite: '111',
    }), 'utf-8')

    try {
      const config = resolvePageBuilderCmsConfig({
        PROMA_CMS_BASE_URL: 'https://demo.zving.com/zcmstest/',
        PROMA_CMS_ZUSID: 'env-zusid',
        PROMA_CMS_CURRENT_SITE: '277',
      })

      expect(config).toMatchObject({
        baseUrl: 'https://demo.zving.com/zcmstest',
        zusid: 'env-zusid',
        currentSite: '277',
        cookie: 'ZUSID=env-zusid; CurrentSite=277',
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
