import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getCmsSettingsPath } from './config-paths'
import { readPageBuilderCmsSettings } from './page-builder-cms-settings-service'

describe('page builder cms settings service', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-cms-settings-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('reads cms-settings.json and normalizes the base url', () => {
    writeFileSync(getCmsSettingsPath(), JSON.stringify({
      baseUrl: 'https://demo.zving.com/zcmstest/',
      currentSite: '277',
      zusid: '_-rOf-_qTSOM1GBM3IfH8A',
    }, null, 2), 'utf-8')

    expect(readPageBuilderCmsSettings()).toEqual({
      baseUrl: 'https://demo.zving.com/zcmstest',
      currentSite: '277',
      zusid: '_-rOf-_qTSOM1GBM3IfH8A',
    })
  })

  test('throws a clear error when cms-settings.json is incomplete', () => {
    writeFileSync(getCmsSettingsPath(), JSON.stringify({
      baseUrl: 'https://demo.zving.com/zcmstest',
      currentSite: '277',
    }, null, 2), 'utf-8')

    expect(() => readPageBuilderCmsSettings()).toThrow('CMS 配置文件缺少必填字段: zusid')
  })
})
