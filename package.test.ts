import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('root workspace routing', () => {
  test('dev/build/start scripts target @proma/app', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'),
    ) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.dev).toContain("@proma/app")
    expect(packageJson.scripts?.build).toContain("@proma/app")
    expect(packageJson.scripts?.start).toContain("@proma/app")
  })

  test('main application workspace lives under apps/app', () => {
    expect(existsSync(join(import.meta.dir, 'apps/app/package.json'))).toBe(true)
  })
})
