import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('electron package scripts', () => {
  test('dev:server sets PROMA_CONFIG_DIR to ~/.proma-dev by default', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['dev:server']).toContain('PROMA_CONFIG_DIR=')
    expect(packageJson.scripts?.['dev:server']).toContain('.proma-dev')
  })
})
