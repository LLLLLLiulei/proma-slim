import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('root workspace routing', () => {
  test('dev/build/start scripts target @ai-page-builder/app', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.dev).toContain("@ai-page-builder/app")
    expect(packageJson.scripts?.build).toContain("@ai-page-builder/app")
    expect(packageJson.scripts?.start).toContain("@ai-page-builder/app")
  })

  test('main application workspace lives under apps/app', () => {
    expect(existsSync(join(import.meta.dir, 'apps/app/package.json'))).toBe(true)
  })
})
